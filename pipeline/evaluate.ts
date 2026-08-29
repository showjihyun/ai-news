import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { RUBRIC, RUBRIC_KEYS, rubricForPrompt, weightedScore, dimensionName } from './rubric.js';
import {
  type Review,
  loadReviews,
  saveReview,
  reviewedSlugs,
  recentWeaknesses,
  recentFixes,
} from './reviews.js';
import { runLlmBlocks, parseBlocks, EVAL_MODEL } from './writer.js';
import { extractArticle } from './extract.js';
import { loadEvidence, type StoredEvidence } from './publish.js';
import { measure, metricsSummary, readabilityIssues } from './readability.js';
import { measureHuman, humanSummary, humanIssues } from './humanize.js';

const POSTS_DIR = path.join(process.cwd(), 'content', 'posts');

/**
 * 평가 결과 스키마.
 *
 * ⚠ writer.ts 의 ClassifySchema 와 같은 이유로 `.transform()` 을 쓰면 안 된다.
 * zodOutputFormat 이 JSON Schema 로 못 바꿔 던지고, API 백엔드 평가가 통째로 실패한다.
 * 1~5 범위 보정은 파싱한 뒤 clampScores 에서 한다.
 */
const ScoreSchema = z.object({
  scores: z.object(
    Object.fromEntries(
      RUBRIC_KEYS.map((k) => [k, z.coerce.number()]),
    ) as Record<string, z.ZodType<number>>,
  ),
  notes: z.object(
    Object.fromEntries(RUBRIC_KEYS.map((k) => [k, z.string()])) as Record<string, z.ZodType<string>>,
  ),
  /** 자료와 어긋나거나 자료에 전혀 없는데 단정한 주장. 이것만 감점 대상이다. */
  unsupported: z.array(z.string()),
  /** 이번 자료로는 확인할 수 없을 뿐, 틀렸다고 볼 근거도 없는 것. 감점하지 않는다. */
  unverifiable: z.array(z.string()),
  fix: z.string(),
});

const JUDGE_SYSTEM = `당신은 한국어 AI 뉴스 매체의 편집장입니다. 기자가 쓴 기사를 평가합니다.

평가 원칙:
1. 후하게 주지 않습니다. 3점이 "무난함"이고, 5점은 정말 잘 쓴 글에만 줍니다.
   전부 4~5점을 주면 이 평가는 아무 쓸모가 없습니다.
2. 점수마다 반드시 본문에서 근거를 찾아 인용합니다. 인용 없는 지적은 하지 않습니다.
3. 사실 근거 항목은 아래에 제공되는 '집필 시 사용한 자료'와 본문을 한 문장씩 대조합니다.
   이 자료에는 원문 본문뿐 아니라 커뮤니티 댓글 원문과 각 소스의 점수·댓글 수가 함께 들어 있습니다.
   커뮤니티 반응 인용이나 "해커뉴스에서 503점" 같은 수치는 그 자료 안에 있으면 정상입니다.

   두 가지를 반드시 구분해서 적으세요.
   - unsupported: 자료와 어긋나거나, 자료 어디에도 없는데 본문이 단정한 것. 이것만 감점합니다.
   - unverifiable: 이번 자료로는 확인할 수 없지만 틀렸다고 볼 근거도 없는 것. 감점하지 않습니다.
     (자료가 잘린 경우, 원문 추출이 실패한 경우 등)

   확실하지 않으면 unsupported 가 아니라 unverifiable 에 넣으세요.
   멀쩡한 근거를 날조로 몰면 다음 기사에서 근거 있는 인용까지 사라집니다.
4. fix 에는 "다음 기사부터 이렇게 하라"를 한 문장으로 씁니다. 추상적인 조언은 쓰지 않습니다.
   나쁜 예: "더 쉽게 쓰세요". 좋은 예: "벤치마크 점수를 쓸 때는 바로 뒤에 '이게 무슨 뜻이냐면'을 붙여 일상 언어로 환산하세요".

루브릭:

${rubricForPrompt()}`;

const BLOCK_TEMPLATE = [
  '---',
  '아래 형식을 정확히 지켜 출력하세요. 구분자를 그대로 쓰고, 그 밖의 설명은 붙이지 마세요.',
  '',
  ...RUBRIC.flatMap((d) => [
    `===${d.key.toUpperCase()}===`,
    `점수(1~5 정수) | 그 점수를 준 근거. 본문에서 인용할 것`,
  ]),
  '===UNSUPPORTED===',
  '자료와 어긋나거나 자료에 전혀 없는데 단정한 주장을 한 줄에 하나씩. 없으면 "없음"',
  '===UNVERIFIABLE===',
  '이번 자료로 확인만 불가한 것(틀렸다는 뜻은 아님)을 한 줄에 하나씩. 없으면 "없음"',
  '===FIX===',
  '다음 기사부터 적용할 구체적 지시 한 문장',
].join('\n');

function buildJudgePrompt(
  post: {
    title: string;
    oneLiner: string;
    desk: string;
    body: string;
    sources: { origin: string; title: string; url: string }[];
  },
  evidence: StoredEvidence,
  exact: boolean,
): string {
  const lines = [
    '다음 기사를 루브릭에 따라 평가하세요.',
    '',
    `■ 제목: ${post.title}`,
    `■ 한 줄 요약: ${post.oneLiner}`,
    `■ 담당 데스크: ${post.desk}`,
    '',
    '■ 기사 본문',
    post.body,
    '',
    // 가독성은 세어 보면 알 수 있는 부분이 크다. 심사원이 감으로 매기지 않도록
    // 문단·문장 길이를 미리 재서 넘긴다. 같은 글에 매번 같은 점수가 나오게 하는 장치이기도 하다.
    '■ 읽기 편함 — 기계 측정 (이 수치를 근거로 readability 를 채점하세요)',
    metricsSummary(measure(post.body)),
    ...(() => {
      const issues = readabilityIssues(measure(post.body));
      return issues.length
        ? ['자동 검출된 문제:', ...issues.map((i) => `- ${i}`)]
        : ['자동 검출된 문제 없음 (다만 소제목이 내용을 예고하는지, 목록이 적절한지는 직접 판단하세요)'];
    })(),
    '',
    // 인간미도 세어 보면 상당 부분 드러난다. 심사원이 감으로 매기지 않도록 수치를 준다.
    '■ 사람이 쓴 글 같은가 — 기계 측정 (이 수치를 근거로 humanness 를 채점하세요)',
    humanSummary(measureHuman(post.body)),
    ...(() => {
      const issues = humanIssues(measureHuman(post.body));
      return issues.length
        ? ['자동 검출된 문제:', ...issues.map((i) => `- ${i}`)]
        : ['자동 검출된 문제 없음 (다만 기자의 판단이 드러나는지는 직접 읽고 판단하세요)'];
    })(),
    '',
    exact
      ? '■ 집필 시 사용한 자료 (기자가 실제로 본 것 전부)'
      : '■ 참고 자료 — 주의: 집필 당시 자료가 남아 있지 않아 지금 다시 수집한 것입니다.' +
        ' 기자는 이보다 많은 자료(특히 커뮤니티 댓글 원문과 각 소스의 점수·댓글 수)를 보고 썼습니다.' +
        ' 여기서 찾지 못한 인용이나 수치는 unsupported 가 아니라 unverifiable 로 분류하세요.',
    '',
    '[원문 본문]',
    evidence.articleText || '(추출 실패)',
  ];

  if (evidence.reactions.length) {
    lines.push('', '[커뮤니티 반응 원문]', ...evidence.reactions.map((r) => `- ${r}`));
  }

  if (evidence.items.length) {
    lines.push(
      '',
      '[각 소스의 반응 지표]',
      ...evidence.items.map((i) =>
        i.score < 0
          ? `- [${i.origin}] ${i.title} — 반응 수치는 남아 있지 않음(발행 당시 값 소실) — ${i.url}`
          : `- [${i.origin}] ${i.title} — 점수 ${i.score}, 댓글 ${i.commentCount} — ${i.url}`,
      ),
    );
  }

  return lines.join('\n');
}

function readPost(file: string) {
  const { data, content } = matter(fs.readFileSync(path.join(POSTS_DIR, file), 'utf8'));
  const raw = data.date;
  return {
    slug: file.replace(/\.md$/, ''),
    title: String(data.title ?? ''),
    oneLiner: String(data.oneLiner ?? ''),
    category: String(data.category ?? ''),
    desk: String(data.desk ?? ''),
    originUrl: String(data.originUrl ?? ''),
    publishedAt: raw instanceof Date ? raw.toISOString() : String(raw ?? ''),
    sources: Array.isArray(data.sources)
      ? data.sources.map((s: Record<string, unknown>) => ({
          origin: String(s.origin ?? ''),
          title: String(s.title ?? ''),
          url: String(s.url ?? ''),
        }))
      : [],
    body: content.trim(),
  };
}

async function judgeViaApi(system: string, prompt: string) {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: EVAL_MODEL(),
    max_tokens: 8000,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    output_config: { format: zodOutputFormat(ScoreSchema), effort: 'medium' },
    messages: [{ role: 'user', content: prompt }],
  });
  if (!response.parsed_output) throw new Error('평가 파싱 실패');
  const parsed = response.parsed_output as z.infer<typeof ScoreSchema>;
  return { ...parsed, scores: clampScores(parsed.scores) };
}

/**
 * 1~5 밖의 점수를 잘라 낸다. 스키마에서 못 하는 이유는 ScoreSchema 주석 참고.
 * 숫자가 아니면 기본값 3 — 모델이 항목을 빠뜨렸다고 최하점을 주면 개정 루프가 헛돈다.
 */
function clampScores(scores: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of RUBRIC_KEYS) {
    const n = scores[k];
    out[k] = Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : 3;
  }
  return out;
}

async function judgeViaCli(system: string, prompt: string) {
  const raw = await runLlmBlocks(`${prompt}\n\n${BLOCK_TEMPLATE}\n`, system, EVAL_MODEL());
  const blocks = parseBlocks(raw);

  const scores: Record<string, number> = {};
  const notes: Record<string, string> = {};
  for (const d of RUBRIC) {
    const line = blocks[d.key.toUpperCase()] ?? '';
    const [scorePart, ...rest] = line.split('|');
    // 숫자가 하나도 없으면 NaN 으로 만들어 기본값(3) 으로 보낸다.
    // Number('') 은 0 이고 0 은 유한한 값이라, 그냥 두면 모델이 빠뜨린 항목이
    // "기본값 3" 이 아니라 최하점 1 로 굳어 개정 루프를 헛돌게 만든다.
    const digits = (scorePart ?? '').replace(/[^\d.]/g, '');
    const n = digits === '' ? NaN : Number(digits);
    scores[d.key] = Number.isFinite(n) ? Math.max(1, Math.min(5, n)) : 3;
    notes[d.key] = rest.join('|').trim() || line.trim();
  }

  const listOf = (raw: string): string[] => {
    const t = (raw ?? '').trim();
    if (!t || /^(없음|none|-)$/i.test(t)) return [];
    return t
      .split('\n')
      .map((l) => l.replace(/^[-*]\s*/, '').trim())
      .filter(Boolean);
  };

  return {
    scores,
    notes,
    unsupported: listOf(blocks.UNSUPPORTED ?? ''),
    unverifiable: listOf(blocks.UNVERIFIABLE ?? ''),
    fix: (blocks.FIX ?? '').trim(),
  };
}

/** 기사 한 편을 평가한다. */
/**
 * 심사 대상 한 편.
 *
 * 디스크에 있는 기사든 아직 발행 안 한 초안이든 같은 모양이라, 심사는 파일을
 * 몰라도 된다. 이걸 떼어낸 이유는 **발행 전에 심사하기 위해서**다 —
 * 자세한 사정은 judgeDraft 주석에.
 */
export interface JudgeTarget {
  slug: string;
  title: string;
  oneLiner: string;
  category: string;
  desk: string;
  originUrl: string;
  publishedAt: string;
  sources: { origin: string; title: string; url: string }[];
  body: string;
}

/**
 * 기사 한 편을 심사한다. 파일을 읽지 않는다.
 *
 * 예전에는 심사가 디스크에서 시작해서, 구조적으로 **발행한 뒤에만** 검증할 수 있었다.
 * 그래서 날조가 있는 기사도 일단 사이트에 올라간 다음 고쳐졌고, 고치는 데 실패하면
 * 그대로 남았다. 실제로 그 상태로 4건이 라이브에 있었다 — 그중 하나는 제목에
 * "13조 원"이라고 썼는데 원문은 129억 달러(약 18조 원)였다.
 *
 * 이제 집필 직후 메모리에서 부를 수 있다. 그러면 날조가 사이트에 **도달하지 못한다**.
 */
export async function judgeDraft(
  post: JudgeTarget,
  evidence: StoredEvidence,
  exact: boolean,
): Promise<Review> {
  // Anthropic API 만 구조화 출력을 서버가 강제한다. 나머지는 블록 형식을 쓴다.
  const isCli = (process.env.LLM_BACKEND || 'nvidia').toLowerCase() !== 'api';
  const prompt = buildJudgePrompt(post, evidence, exact);
  const result = isCli
    ? await judgeViaCli(JUDGE_SYSTEM, prompt)
    : await judgeViaApi(JUDGE_SYSTEM, prompt);

  return {
    slug: post.slug,
    title: post.title,
    category: post.category,
    desk: post.desk,
    publishedAt: post.publishedAt,
    reviewedAt: new Date().toISOString(),
    scores: result.scores,
    overall: weightedScore(result.scores),
    notes: result.notes,
    fix: result.fix,
    unsupported: result.unsupported,
    unverifiable: result.unverifiable,
    evidenceExact: exact,
  };
}

/** 이미 발행된 기사를 심사한다. 파일에서 읽어 judgeDraft 에 넘긴다. */
export async function evaluatePost(file: string): Promise<Review> {
  const post = readPost(file);

  // 집필 당시 자료가 최우선. 이게 없으면 지금 다시 긁어 대조하되, 그 사실을 평가자에게 알린다.
  const stored = loadEvidence(post.slug);
  const exact = stored !== null;
  const evidence: StoredEvidence = stored ?? {
    articleText: post.originUrl ? await extractArticle(post.originUrl, 5000) : '',
    reactions: [],
    // -1 은 "값이 남아 있지 않음" 센티널이다(backfill.ts 와 동일). 0 으로 채우면
    // 심사원에게 "반응이 실제로 0이었다"고 알리는 셈이라, 본문의 "해커뉴스 503점"
    // 같은 서술이 근거 없는 주장으로 판정된다.
    items: post.sources.map((s) => ({ ...s, score: -1, commentCount: -1 })),
  };

  return judgeDraft(post, evidence, exact);
}

/** 일간 브리핑은 LLM 이 쓴 글이 아니라 발행분 재조합이므로 평가 대상이 아니다. */
function articleFiles(): string[] {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => {
      const { data } = matter(fs.readFileSync(path.join(POSTS_DIR, f), 'utf8'));
      return String(data.category ?? '') !== '데일리';
    })
    .sort()
    .reverse();
}

/** 아직 평가하지 않은 기사. */
export function pendingPosts(): string[] {
  const reviewed = reviewedSlugs();
  return articleFiles().filter((f) => !reviewed.has(f.replace(/\.md$/, '')));
}

export function allPosts(): string[] {
  return articleFiles();
}

export function printReport(reviews: Review[]) {
  const line = '─'.repeat(68);
  if (reviews.length === 0) {
    console.log('\n평가된 기사가 없습니다. `npm run evaluate` 를 먼저 실행하세요.\n');
    return;
  }

  console.log(`\n${line}\n기사 품질 평가  (${reviews.length}건)\n${line}\n`);

  const avg = (key: string) => {
    const vals = reviews.map((r) => r.scores[key]).filter((n): n is number => typeof n === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  for (const d of RUBRIC) {
    const a = avg(d.key);
    const filled = Math.round(a);
    console.log(
      `  ${d.name.padEnd(12)} ${'●'.repeat(filled)}${'○'.repeat(5 - filled)}  ${a.toFixed(2)}  (가중치 ${d.weight}%)`,
    );
  }

  const overall = reviews.reduce((s, r) => s + r.overall, 0) / reviews.length;
  console.log(`\n  종합 ${overall.toFixed(2)} / 5.00`);

  // 개선 추이: 오래된 절반 vs 최신 절반
  if (reviews.length >= 6) {
    const sorted = [...reviews].sort(
      (a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(),
    );
    const half = Math.floor(sorted.length / 2);
    const older = sorted.slice(0, half);
    const newer = sorted.slice(half);
    const mean = (rs: Review[]) => rs.reduce((s, r) => s + r.overall, 0) / rs.length;
    const delta = mean(newer) - mean(older);
    const arrow = delta > 0.1 ? '▲ 개선' : delta < -0.1 ? '▼ 하락' : '— 보합';
    console.log(
      `  추이 ${arrow}  이전 ${mean(older).toFixed(2)} → 최근 ${mean(newer).toFixed(2)} (${delta >= 0 ? '+' : ''}${delta.toFixed(2)})`,
    );
  }

  const unsupported = reviews.filter((r) => r.unsupported.length > 0);
  if (unsupported.length) {
    console.log(`\n  ⚠ 근거 없는 주장이 발견된 기사 ${unsupported.length}건 — 직접 확인하세요:`);
    for (const r of unsupported.slice(0, 5)) {
      console.log(`    · ${r.slug}`);
      for (const u of r.unsupported.slice(0, 2)) console.log(`      "${u.slice(0, 80)}"`);
    }
  }

  const weak = recentWeaknesses();
  console.log(`\n${line}\n다음 기사에 반영될 개선 지시\n${line}`);
  if (weak.length === 0) {
    console.log('  약점으로 잡힌 항목 없음 (표본 3건 미만이거나 전 항목 4.0 이상)');
  } else {
    for (const w of weak) console.log(`  · ${w.name} (평균 ${w.average.toFixed(2)}) 보완`);
  }
  for (const f of recentFixes()) console.log(`  · ${f}`);
  console.log('');
}

export { dimensionName, loadReviews, saveReview };
export type { Review };
