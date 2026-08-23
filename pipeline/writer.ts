import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { Cluster, DraftPost } from './types.js';
import type { Evidence } from './extract.js';
import { personaFor } from './personas.js';
import { buildFocusNote } from './reviews.js';
import {
  CATEGORIES,
  CLASSIFY_SYSTEM,
  COMMON_RULES,
  buildClassifyPrompt,
  buildWriteSystem,
  buildWritePrompt,
  personaBlock,
  missingSections,
  retryNote,
} from './prompt.js';

const MODEL = () => process.env.LLM_MODEL || 'claude-opus-5';

/**
 * 평가·채점용 모델.
 *
 * 집필은 판단력이 필요하지만 채점은 주어진 기준에 맞춰 대조하는 작업이라 부담이 덜하다.
 * 기본값은 집필 모델과 같게 두되(품질 우선), 속도가 급하면 LLM_EVAL_MODEL 로 낮출 수 있다.
 * 측정: 기사 1건 평가에 모델 처리만 2~3분이 걸려서, 기동 옵션 최적화(6.9→4.8초)보다
 * 여기를 바꾸는 편이 체감 차이가 훨씬 크다.
 */
export const EVAL_MODEL = () => process.env.LLM_EVAL_MODEL || MODEL();

const ClassifySchema = z.object({
  category: z.enum(CATEGORIES as [string, ...string[]]),
  /**
   * 일반 독자 기준 뉴스 가치 0~10. 낮으면 아예 안 쓰는 편이 낫다.
   *
   * clamp 를 거는 이유: CLI 백엔드는 구조화 출력을 서버가 강제해 주지 않아서
   * 모델이 0~100 척도로 답하는 일이 실제로 있었다. 범위를 벗어났다고 파이프라인을
   * 통째로 실패시키는 것보다 잘라서 쓰는 편이 낫다.
   */
  readerValue: z.coerce.number().transform((n) => Math.max(0, Math.min(10, n))),
  /**
   * 구글 애드센스 정책 위험도.
   *
   * 이 사이트의 수입원이 애드센스인데 파이프라인에 정책 인식이 없었다.
   * AI 뉴스에는 NSFW 모델, 딥페이크 피해, 탈옥, 무기 활용 같은 주제가 정기적으로 나오고,
   * 그런 기사가 섞이면 페이지 단위 광고 중단이나 사이트 심사 반려로 이어질 수 있다.
   * 분류는 어차피 기사를 읽으므로 필드 하나 늘리는 비용은 사실상 0이다.
   */
  adRisk: z
    .string()
    .transform((v) => {
      // CLI 백엔드는 구조화 출력을 서버가 강제하지 않아서 자리표시자를 그대로
      // 뱉는 일이 있다(실제로 "none|low|high" 가 그대로 왔다).
      //
      // 모르는 값은 high 로 본다. low 로 떨어뜨리면 skipAdRiskHigh 게이트를 그냥 통과해
      // "판정에 실패했으니 일단 발행" 이 되는데, 애드센스가 수입원인 사이트에서
      // 안전한 쪽은 발행이 아니라 건너뛰기다. 잘못 걸러진 기사는 --force 로 낼 수 있지만,
      // 잘못 나간 기사는 되돌릴 수 없다.
      const t = v.trim().toLowerCase();
      if (t === 'none' || t === 'low' || t === 'high') return t;
      // 왜 발행이 멈췄는지 로그만 보고 알 수 있어야 한다. 값이 안 읽힌 것과
      // 진짜로 위험한 기사인 것은 결과가 같아도 대응이 다르다.
      console.warn(`  ! adRisk 값을 읽지 못했습니다(받은 값: ${JSON.stringify(v)}). 안전하게 high 로 처리합니다.`);
      return 'high';
    })
    .pipe(z.enum(['none', 'low', 'high'])),
  adRiskReason: z.string().describe('위험도 판단 근거. none 이면 "없음"'),
  reason: z.string().describe('그 카테고리와 점수를 준 이유. 한 문장'),
});

const PostSchema = z.object({
  title: z.string().describe('한국어 SEO 제목. 45자 이내. 낚시성 금지, 구체적인 사실을 담을 것'),
  description: z.string().describe('검색 결과에 뜨는 요약. 80~120자'),
  oneLiner: z.string().describe('"한 줄 요약" 박스에 들어갈 문장 하나. 60자 이내'),
  tags: z.array(z.string()).min(2).max(6).describe('한국어 태그. 예: OpenAI, 이미지생성, 오픈소스'),
  /** 이 글만의 차별점. 요약글로 전락하지 않았는지 스스로 점검하게 만드는 장치. */
  angle: z.string().describe('이 글이 단순 요약과 다른 지점을 한 문장으로. 편집 점검용'),
  body: z
    .string()
    .describe('마크다운 본문. 섹션 제목은 직접 짓되 "## 쉽게 풀어보면"과 "## 나에게 미치는 영향"은 반드시 포함'),
});

export type Classification = z.infer<typeof ClassifySchema>;

/** LLM 이 직접 만들어 내는 부분. category/desk 는 파이프라인이 붙인다. */
type DraftBody = z.infer<typeof PostSchema>;

// ── 백엔드 1: Anthropic API ────────────────────────────────────────────

function client() {
  return new Anthropic();
}

/**
 * 안전 분류기가 거절하면(HTTP 200 + stop_reason: 'refusal') 다른 모델로 한 번 더 시도한다.
 * 뉴스에는 소송·규제·보안 같은 주제가 섞이므로 실제로 걸릴 수 있다.
 */
async function parseWithFallback<T>(request: any): Promise<T> {
  const c = client();
  let response = await c.messages.parse(request);

  if (response.stop_reason === 'refusal') {
    const fallback = process.env.LLM_FALLBACK_MODEL || 'claude-sonnet-5';
    console.warn(`  ! ${request.model} 거절 → ${fallback} 재시도`);
    response = await c.messages.parse({ ...request, model: fallback });
  }

  if (!response.parsed_output) {
    throw new Error(`구조화 출력 파싱 실패 (stop_reason: ${response.stop_reason})`);
  }

  const u = response.usage;
  console.log(
    `  · 토큰 in ${u.input_tokens} / out ${u.output_tokens}` +
      (u.cache_read_input_tokens ? ` / 캐시적중 ${u.cache_read_input_tokens}` : ''),
  );
  return response.parsed_output as T;
}

async function classifyViaApi(cluster: Cluster, evidence: Evidence): Promise<Classification> {
  return parseWithFallback<Classification>({
    model: MODEL(),
    max_tokens: 2000,
    system: [
      { type: 'text', text: CLASSIFY_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    output_config: { format: zodOutputFormat(ClassifySchema), effort: 'low' },
    messages: [{ role: 'user', content: buildClassifyPrompt(cluster, evidence) }],
  });
}

async function writeViaApi(
  cluster: Cluster,
  evidence: Evidence,
  category: string,
  extra: string,
  focusNote: string,
): Promise<DraftBody> {
  return parseWithFallback<DraftBody>({
    model: MODEL(),
    max_tokens: 16000,
    // 공통 규칙 블록은 모든 글에서 바이트 단위로 동일하다. 여기에 캐시 지점을 두면
    // 페르소나가 달라도 앞부분은 캐시 적중한다.
    // personaBlock 을 직접 부른다 — 예전엔 buildWriteSystem(...).slice(COMMON_RULES.length) 로
    // 잘라 썼는데, 공통 규칙 앞에 뭐라도 덧붙이는 순간 엉뚱한 위치에서 잘려 페르소나 지시가
    // 소리 없이 반토막 난다. 조립을 두 곳에서 하지 않는 편이 안전하다.
    system: [
      { type: 'text', text: COMMON_RULES, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: personaBlock(personaFor(category)) },
      // 편집 평가에서 나온 개선 지시. 캐시 지점(COMMON_RULES) 뒤에 두어야
      // 내용이 매번 달라져도 앞부분 캐시가 깨지지 않는다.
      ...(focusNote ? [{ type: 'text' as const, text: focusNote }] : []),
    ],
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(PostSchema), effort: 'medium' },
    messages: [{ role: 'user', content: buildWritePrompt(cluster, evidence) + extra }],
  });
}

// ── 백엔드 2: claude CLI (구독 계정으로 실행 — API 키 불필요) ──────────

let tmpCounter = 0;

/**
 * 시스템 프롬프트를 인자로 직접 넘기지 않고 파일로 준다.
 *
 * 이유: Windows 에서는 spawn 에 shell:true 가 필요한데(그래야 claude.exe 를 PATH 에서 찾는다),
 * 그러면 Node 가 인자들을 그대로 이어 붙여 cmd.exe 에 넘긴다. 시스템 프롬프트에는 줄바꿈과
 * 큰따옴표가 들어 있어서("충격", "경악" 같은 금지어 목록) 인자가 중간에 끊기고 명령이 깨진다.
 * --system-prompt-file 로 넘기면 셸을 타는 문자열이 짧은 상대 경로 하나뿐이라 안전하다.
 * 사용자 프롬프트는 원래 stdin 으로 주므로 애초에 셸을 타지 않는다.
 */
/** 빈 MCP 설정 파일. 한 번만 만들어 두고 재사용한다. */
let mcpConfigPath: string | null = null;
function emptyMcpConfigPath(): string {
  if (mcpConfigPath) return mcpConfigPath;
  const dir = path.join('data', '.tmp');
  fs.mkdirSync(dir, { recursive: true });
  mcpConfigPath = path.join(dir, 'empty-mcp.json');
  fs.writeFileSync(mcpConfigPath, JSON.stringify({ mcpServers: {} }), 'utf8');
  return mcpConfigPath;
}

function writeTempPrompt(system: string): string {
  const dir = path.join('data', '.tmp'); // 상대 경로 — 공백이 낄 여지를 없앤다
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `system-${process.pid}-${tmpCounter++}.txt`);
  fs.writeFileSync(file, system, 'utf8');
  return file;
}

/** 평가 모듈에서도 같은 CLI 경로를 쓴다. 백엔드가 두 벌로 갈리면 관리가 안 된다. */
export function runLlmBlocks(prompt: string, system: string, model?: string): Promise<string> {
  return runClaudeCli(prompt, system, model);
}

function runClaudeCli(prompt: string, system: string, model = MODEL()): Promise<string> {
  const systemFile = writeTempPrompt(system);

  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      'claude',
      [
        '-p',
        '--output-format', 'json',
        '--model', model,
        '--system-prompt-file', systemFile,
        // 기동 시간을 줄인다. 측정값: 기본 6.9초 → 이 옵션들로 4.8초.
        // 이 파이프라인은 도구도 MCP 도 슬래시 명령도 쓰지 않고 텍스트만 주고받으므로
        // 전부 꺼도 결과가 달라지지 않는다. 호출이 수십 번이라 누적 효과가 크다.
        // (--bare 는 더 빠르지만 ANTHROPIC_API_KEY 만 인정해서 구독 로그인으로는 못 쓴다.)
        //
        // MCP 설정을 인라인 JSON 으로 주면 안 된다. Windows 에서 shell:true 로 spawn 하면
        // cmd.exe 가 따옴표를 벗겨 '{mcpServers:{}}' 를 파일 경로로 읽는다. 파일로 넘긴다.
        '--strict-mcp-config', '--mcp-config', emptyMcpConfigPath(),
        '--disable-slash-commands',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'], shell: process.platform === 'win32' },
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        // 사용량 한도는 일반 오류와 다르게 다뤄야 한다. 남은 기사를 계속 시도해 봐야
        // 전부 같은 이유로 실패하고, 실제로 개정 10건이 그렇게 통째로 날아갔다.
        // (한도 소진 시 stderr 가 비어 있거나 한도 문구만 오는 경우가 있어 둘 다 본다.)
        const text = `${err} ${out}`;
        const rateLimited =
          /usage limit|rate limit|too many requests|quota|한도|사용량/i.test(text) ||
          (code === 1 && err.trim() === '');
        const e = new Error(
          rateLimited
            ? `Claude 사용량 한도로 보입니다 (종료 코드 ${code}). 한도가 회복된 뒤 다시 실행하세요.`
            : `claude CLI 종료 코드 ${code}: ${err.slice(0, 400)}`,
        );
        (e as Error & { rateLimited?: boolean }).rateLimited = rateLimited;
        return reject(e);
      }
      try {
        resolve(JSON.parse(out).result as string);
      } catch {
        resolve(out);
      }
    });
    // stdin 에도 오류 리스너가 있어야 한다.
    // claude 가 PATH 에 없거나 곧바로 죽으면 stdin 에 ENOENT/EPIPE 가 올라오는데,
    // 리스너가 없으면 EventEmitter 가 그대로 다시 던져서 Promise 밖으로 새어 나가고
    // main().catch → process.exit(1) 로 실행 전체가 죽는다. 남은 기사도 함께 날아간다.
    child.stdin.on('error', reject);
    child.stdin.write(prompt);
    child.stdin.end();
  }).finally(() => {
    try {
      fs.unlinkSync(systemFile);
    } catch {
      /* 정리 실패는 무시 — 다음 실행에서 덮어쓴다 */
    }
  });
}

function extractJson(raw: string): unknown {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/)?.[1];
  const bare = raw.match(/\{[\s\S]*\}/)?.[0];
  return JSON.parse(fenced ?? bare ?? raw);
}

async function classifyViaCli(cluster: Cluster, evidence: Evidence): Promise<Classification> {
  const prompt =
    buildClassifyPrompt(cluster, evidence) +
    `\n\n---\n아래 JSON 하나만 출력하세요.\n` +
    '```json\n{"category":"' +
    CATEGORIES.join('|') +
    '","readerValue":<0에서 10 사이 정수 — 일반인 독자에게 얼마나 가치 있는 뉴스인지>,' +
    '"adRisk":"<none 또는 low 또는 high 중 정확히 하나>","adRiskReason":"근거 또는 없음",' +
    '"reason":"한 문장"}\n```';
  const raw = await runClaudeCli(prompt, CLASSIFY_SYSTEM);
  return ClassifySchema.parse(extractJson(raw));
}

/**
 * CLI 백엔드용 블록 포맷.
 *
 * JSON 을 쓰지 않는 이유: 본문이 2,000자 넘는 마크다운이라 따옴표·줄바꿈·백슬래시가
 * 잔뜩 들어간다. API 백엔드는 서버가 구조화 출력을 강제해 주지만 CLI 는 아니라서,
 * 모델이 이스케이프를 한 군데만 놓쳐도 통째로 파싱 실패한다. 실제로 그렇게 깨졌다.
 * 구분자 방식은 본문에 무엇이 들어 있든 안전하다.
 */
const BLOCK_FIELDS = ['TITLE', 'DESCRIPTION', 'ONELINER', 'TAGS', 'ANGLE', 'BODY'] as const;

/**
 * LLM 이 낸 ===BLOCK=== 구분 출력을 이름→내용 맵으로 바꾼다.
 *
 * 집필·평가·개정 세 모듈이 같은 형식을 쓰므로 여기 한 곳에서만 정의한다.
 * 예전에는 각자 사본을 갖고 있었는데 이 사본만 이름 패턴이 [A-Z]+ 라(밑줄 불가)
 * 다른 두 곳이 쓰는 ===NEEDS_WORK=== 같은 블록을 읽지 못했다.
 */
export function parseBlocks(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = raw.split(/^===([A-Z_]+)===[^\S\n]*$/m);
  // parts = [머리말, 필드명, 내용, 필드명, 내용, ...]
  for (let i = 1; i < parts.length - 1; i += 2) {
    out[parts[i]] = parts[i + 1].trim();
  }
  return out;
}

async function writeViaCli(
  cluster: Cluster,
  evidence: Evidence,
  category: string,
  extra: string,
  focusNote: string,
): Promise<DraftBody> {
  const template = [
    '---',
    '출력 형식을 정확히 지켜 주세요. 아래 구분자를 그대로 쓰고, 그 밖의 설명은 붙이지 마세요.',
    '',
    '===TITLE===',
    '한국어 제목 (45자 이내)',
    '===DESCRIPTION===',
    '검색 결과용 요약 (80~120자)',
    '===ONELINER===',
    '한 줄 요약 (60자 이내)',
    '===TAGS===',
    '태그를 쉼표로 구분 (2~6개)',
    '===ANGLE===',
    '이 글이 단순 요약과 다른 지점 한 문장',
    '===BODY===',
    '마크다운 본문 (## 부터 시작)',
  ].join('\n');

  const prompt = `${buildWritePrompt(cluster, evidence)}${extra}\n\n${template}\n`;

  const raw = await runClaudeCli(prompt, buildWriteSystem(category) + focusNote);
  const blocks = parseBlocks(raw);

  const missing = BLOCK_FIELDS.filter((f) => !blocks[f]);
  if (missing.length) {
    throw new Error(`CLI 응답에 누락된 블록: ${missing.join(', ')}`);
  }

  const parsed = PostSchema.safeParse({
    title: blocks.TITLE,
    description: blocks.DESCRIPTION,
    oneLiner: blocks.ONELINER,
    tags: blocks.TAGS.split(/[,\n]/)
      .map((t) => t.trim().replace(/^[-*#]\s*/, ''))
      .filter(Boolean)
      .slice(0, 6),
    angle: blocks.ANGLE,
    body: blocks.BODY,
  });
  if (!parsed.success) throw new Error(`CLI 응답 스키마 불일치: ${parsed.error.message.slice(0, 300)}`);
  return parsed.data;
}

// ── 공개 API ──────────────────────────────────────────────────────────

const isCli = () => (process.env.LLM_BACKEND || 'api').toLowerCase() === 'cli';

export function classify(cluster: Cluster, evidence: Evidence): Promise<Classification> {
  return isCli() ? classifyViaCli(cluster, evidence) : classifyViaApi(cluster, evidence);
}

export async function writePost(
  cluster: Cluster,
  evidence: Evidence,
  category: string,
): Promise<DraftPost> {
  // 최근 평가에서 약하게 나온 항목을 이번 집필에 되먹인다. 이게 개선 루프의 연결 지점이다.
  const focusNote = buildFocusNote();
  if (focusNote) console.log('  · 편집 개선 지시 반영됨');

  const write = (extra: string) =>
    isCli()
      ? writeViaCli(cluster, evidence, category, extra, focusNote)
      : writeViaApi(cluster, evidence, category, extra, focusNote);

  let draft = await write('');

  // 프롬프트로 지시해도 필수 섹션을 빼먹는 일이 실제로 있었다. 한 번 더 시켜 본다.
  // 두 번째도 실패하면 그냥 발행한다 — 섹션이 없다고 기사를 통째로 버릴 이유는 없고,
  // 실패했다는 사실은 로그에 남겨서 프롬프트를 손볼 근거로 쓴다.
  const missing = missingSections(draft.body);
  if (missing.length > 0) {
    console.warn(`  ! 필수 섹션 누락(${missing.join(', ')}) → 재작성 요청`);
    const retried = await write(retryNote(missing));
    const stillMissing = missingSections(retried.body);
    if (stillMissing.length < missing.length) draft = retried;
    if (stillMissing.length > 0) {
      console.warn(`  ! 재작성 후에도 누락: ${stillMissing.join(', ')} (그대로 발행)`);
    }
  }

  return { ...draft, category, desk: personaFor(category).desk };
}
