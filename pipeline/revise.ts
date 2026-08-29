import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { yamlEscape } from './util.js';
import { RUBRIC, dimensionName } from './rubric.js';
import type { Review } from './reviews.js';

import { loadEvidence, type StoredEvidence } from './publish.js';
import { runLlmBlocks, parseBlocks } from './writer.js';
import { personaFor } from './personas.js';
import { COMMON_RULES, personaBlock, missingSections } from './prompt.js';
import { measure, readabilityIssues, metricsSummary } from './readability.js';
import { measureHuman, humanSummary, humanIssues } from './humanize.js';
import { evaluatePost } from './evaluate.js';

const POSTS_DIR = path.join(process.cwd(), 'content', 'posts');

const ReviseSchema = z.object({
  title: z.string(),
  description: z.string(),
  oneLiner: z.string(),
  tags: z.array(z.string()).min(2).max(6),
  body: z.string(),
  /** 무엇을 어떻게 고쳤는지. 사람이 확인할 때 diff 대신 읽을 요약. */
  changelog: z.string(),
});
type Revision = z.infer<typeof ReviseSchema>;

const REVISE_SYSTEM = `${COMMON_RULES}

■ 지금 하는 일: 이미 발행된 기사의 개정판을 씁니다.

원고를 처음부터 다시 쓰는 것이 아닙니다. 편집장이 지적한 곳만 고치고, 나머지는 그대로 둡니다.
잘 된 대목까지 건드리면 점수가 오히려 떨어집니다.

지킬 것:
1. 지적된 항목을 하나씩 실제로 고칩니다. "고쳤다"고 말만 하고 문장이 그대로면 안 됩니다.
2. 근거 없는 주장으로 지적된 문장은 삭제하거나, 제공된 자료에서 확인되는 내용으로 바꾸거나,
   "본지가 확인하지 못했습니다"로 명시합니다. 절대 새로운 추측으로 대체하지 않습니다.
3. 사실관계와 핵심 논지는 유지합니다. 개정판이 다른 기사가 되면 안 됩니다.
4. "## 쉽게 풀어보면" 과 "## 나에게 미치는 영향" 섹션은 반드시 유지합니다.
5. 자료에 없는 내용을 새로 추가하지 않습니다. 분량을 늘리려고 살을 붙이지 마세요.`;

const BLOCK_TEMPLATE = [
  '---',
  '아래 형식을 정확히 지켜 출력하세요. 구분자를 그대로 쓰고, 그 밖의 설명은 붙이지 마세요.',
  '',
  '===TITLE===',
  '개정 제목 (문제없으면 원래 제목 그대로)',
  '===DESCRIPTION===',
  '검색 결과용 요약 (80~120자)',
  '===ONELINER===',
  '한 줄 요약 (60자 이내)',
  '===TAGS===',
  '태그를 쉼표로 구분 (2~6개)',
  '===CHANGELOG===',
  '무엇을 어떻게 고쳤는지 항목별로 한 줄씩',
  '===BODY===',
  '개정 본문 (## 부터 시작)',
].join('\n');

/** 편집장 지적을 재작성 지시로 바꾼다. 점수가 낮은 항목부터. */
function buildRevisePrompt(
  post: { title: string; oneLiner: string; body: string },
  review: Review,
  evidence: StoredEvidence,
  target: number,
): string {
  const weak = RUBRIC.map((d) => ({ d, score: review.scores[d.key] ?? 3 }))
    .filter((x) => x.score < 5)
    .sort((a, b) => a.score - b.score);

  const lines = [
    `다음 기사를 개정하세요. 현재 종합 ${review.overall.toFixed(2)}점, 목표 ${target.toFixed(1)}점 이상입니다.`,
    '',
    '■ 현재 제목',
    post.title,
    '',
    '■ 현재 한 줄 요약',
    post.oneLiner,
    '',
    '■ 현재 본문',
    post.body,
    '',
    '■ 편집장 지적 (점수가 낮은 항목부터)',
  ];

  for (const { d, score } of weak) {
    lines.push('', `### ${d.name} — ${score}점 / 5점 (가중치 ${d.weight}%)`);
    lines.push(`지적: ${review.notes[d.key] || '(없음)'}`);
    lines.push(`5점 기준: ${d.best}`);
  }

  if (review.unsupported.length) {
    lines.push(
      '',
      '■ 근거 없는 주장 — 반드시 처리할 것',
      '아래 문장들은 제공된 자료에서 확인되지 않았습니다.',
      '삭제하거나, 자료에서 확인되는 내용으로 바꾸거나, "본지가 확인하지 못했습니다"로 고치세요.',
      '새로운 추측으로 대체하면 더 나빠집니다.',
      ...review.unsupported.map((u) => `- ${u}`),
    );
  }

  // 기계적으로 잰 가독성 문제는 LLM 판단보다 정확하다. 숫자를 그대로 넘긴다.
  const metrics = measure(post.body);
  const issues = readabilityIssues(metrics);
  lines.push('', '■ 읽기 편함 — 기계 측정 결과', metricsSummary(metrics));
  if (issues.length) {
    lines.push('', '고쳐야 할 지점:', ...issues.map((i) => `- ${i}`));
  } else {
    lines.push('기계 측정으로는 문제없습니다. 현재 문단·문장 구조를 무너뜨리지 마세요.');
  }

  const human = measureHuman(post.body);
  const humanProblems = humanIssues(human);
  lines.push('', '■ 사람이 쓴 글 같은가 — 기계 측정', humanSummary(human));
  if (humanProblems.length) {
    lines.push('', '고쳐야 할 지점:', ...humanProblems.map((i) => `- ${i}`));
  } else {
    lines.push('기계 측정으로는 문제없습니다. 지금의 리듬을 무너뜨리지 마세요.');
  }

  lines.push(
    '',
    '■ 이 기사가 근거로 삼은 자료 (여기 있는 내용만 쓸 수 있습니다)',
    '[원문 본문]',
    evidence.articleText || '(추출 실패)',
  );
  if (evidence.reactions.length) {
    lines.push('', '[커뮤니티 반응 원문]', ...evidence.reactions.map((r) => `- ${r}`));
  }
  if (evidence.items.length) {
    lines.push(
      '',
      '[각 소스의 반응 지표]',
      ...evidence.items.map((i) =>
        i.score < 0
          ? `- [${i.origin}] ${i.title} — 반응 수치 불명(발행 당시 값이 남아 있지 않음). 구체적 수치를 쓰지 마세요.`
          : `- [${i.origin}] ${i.title} — 점수 ${i.score}, 댓글 ${i.commentCount}`,
      ),
    );
  }

  return lines.join('\n');
}

async function reviseViaApi(system: string, prompt: string): Promise<Revision> {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: process.env.LLM_MODEL || 'claude-opus-5',
    max_tokens: 16000,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(ReviseSchema), effort: 'medium' },
    messages: [{ role: 'user', content: prompt }],
  });
  if (!response.parsed_output) throw new Error('개정판 파싱 실패');
  return response.parsed_output as Revision;
}

async function reviseViaCli(system: string, prompt: string): Promise<Revision> {
  const raw = await runLlmBlocks(`${prompt}\n\n${BLOCK_TEMPLATE}\n`, system);
  const blocks = parseBlocks(raw);
  const missing = ['TITLE', 'DESCRIPTION', 'ONELINER', 'TAGS', 'BODY'].filter((f) => !blocks[f]);
  if (missing.length) throw new Error(`개정판에 누락된 블록: ${missing.join(', ')}`);

  return ReviseSchema.parse({
    title: blocks.TITLE,
    description: blocks.DESCRIPTION,
    oneLiner: blocks.ONELINER,
    tags: blocks.TAGS.split(/[,\n]/)
      .map((t) => t.trim().replace(/^[-*#]\s*/, ''))
      .filter(Boolean)
      .slice(0, 6),
    body: blocks.BODY,
    changelog: blocks.CHANGELOG ?? '',
  });
}

/**
 * 초안 하나를 개정한다. 파일을 건드리지 않는다.
 *
 * 발행 전 검증에서 쓴다 — 날조가 발견되면 사이트에 올리기 전에 여기서 고친다.
 * 예전에는 개정이 파일을 직접 고치는 구조라 반드시 발행 뒤에야 돌 수 있었고,
 * 그래서 고치는 데 실패한 기사가 그대로 라이브에 남았다.
 */
export async function reviseDraft(
  post: { title: string; oneLiner: string; body: string },
  review: Review,
  evidence: StoredEvidence,
  target: number,
): Promise<Revision> {
  const isCli = (process.env.LLM_BACKEND || 'nvidia').toLowerCase() !== 'api';
  const prompt = buildRevisePrompt(post, review, evidence, target);
  return isCli
    ? reviseViaCli(REVISE_SYSTEM, prompt)
    : reviseViaApi(REVISE_SYSTEM, prompt);
}

/** 프론트매터의 발행 정보는 그대로 두고 본문·제목만 교체한다. */
function rewriteFile(file: string, revision: Revision) {
  const full = path.join(POSTS_DIR, file);
  const raw = fs.readFileSync(full, 'utf8');
  const { data } = matter(raw);

  const esc = yamlEscape;   // 프론트매터 인용 규칙은 util 한 곳에서만 정의한다

  // 원본 프론트매터를 줄 단위로 유지하면서 바뀐 필드만 갈아 끼운다.
  // gray-matter 로 다시 직렬화하면 sources 배열 서식과 날짜 인용이 흐트러진다.
  const headEnd = raw.indexOf('\n---', 3);
  const head = raw.slice(0, headEnd);
  const replaced = head
    .split('\n')
    .map((line) => {
      if (line.startsWith('title:')) return `title: ${esc(revision.title)}`;
      if (line.startsWith('description:')) return `description: ${esc(revision.description)}`;
      if (line.startsWith('oneLiner:')) return `oneLiner: ${esc(revision.oneLiner)}`;
      if (line.startsWith('tags:')) return `tags: [${revision.tags.map(esc).join(', ')}]`;
      return line;
    })
    .join('\n');

  const revisedAt = new Date().toISOString();
  const withRevision = replaced.includes('revisedAt:')
    ? replaced.replace(/revisedAt: .*/, `revisedAt: ${esc(revisedAt)}`)
    : `${replaced}\nrevisedAt: ${esc(revisedAt)}`;

  fs.writeFileSync(full, `${withRevision}\n---\n\n${revision.body.trim()}\n`, 'utf8');
  void data;
}

function readBody(file: string): { title: string; oneLiner: string; body: string; category: string } {
  const { data, content } = matter(fs.readFileSync(path.join(POSTS_DIR, file), 'utf8'));
  return {
    title: String(data.title ?? ''),
    oneLiner: String(data.oneLiner ?? ''),
    category: String(data.category ?? ''),
    body: content.trim(),
  };
}

export interface ImproveResult {
  /** 최종 채택된 평가 결과. 호출자가 saveReview 로 저장해야 한다. */
  review: Review;
  slug: string;
  before: number;
  after: number;
  attempts: number;
  reachedTarget: boolean;
  /** 남은 근거 없는 주장 수. 0 이 아니면 사람이 확인해야 한다. */
  unsupportedLeft: number;
  changelog: string;
}

/** 개정이 더 필요한가. 점수와 사실 오류를 따로 본다. */
function needsWork(review: Review, target: number): boolean {
  // 근거 없는 주장은 점수와 무관하게 막는다.
  // 4.2점인데 날조가 있는 글은 3.9점짜리 정상 기사보다 나쁘다. 종합 점수는
  // 가중 평균이라 사실 오류 하나가 다른 항목에 묻혀 버리기 때문에 따로 걸어야 한다.
  return review.overall < target || review.unsupported.length > 0;
}

/**
 * 목표 점수에 닿고 근거 없는 주장이 사라질 때까지 개정한다.
 *
 * 반드시 지키는 것: **나빠지면 되돌린다.** LLM 개정은 좋아질 때가 많지만
 * 항상 그런 건 아니고, 나빠진 판을 덮어써 버리면 되돌릴 방법이 없다.
 * 매 시도마다 원고를 들고 있다가 더 나은 쪽만 남긴다.
 *
 * '더 낫다'의 기준도 점수만이 아니다. 점수가 조금 올라도 날조가 늘었다면 그건 개악이다.
 */
export async function improveToTarget(
  file: string,
  review: Review,
  target: number,
  maxAttempts: number,
): Promise<ImproveResult> {
  const slug = file.replace(/\.md$/, '');
  const isCli = (process.env.LLM_BACKEND || 'nvidia').toLowerCase() !== 'api';

  const evidence: StoredEvidence = loadEvidence(slug) ?? {
    articleText: '',
    reactions: [],
    items: [],
  };

  let bestReview = review;
  let bestSource = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
  const before = review.overall;
  const changelogs: string[] = [];
  let attempts = 0;

  while (needsWork(bestReview, target) && attempts < maxAttempts) {
    attempts++;
    const post = readBody(file);
    const system = REVISE_SYSTEM + '\n' + personaBlock(personaFor(post.category));
    const prompt = buildRevisePrompt(post, bestReview, evidence, target);

    const revision = isCli
      ? await reviseViaCli(system, prompt)
      : await reviseViaApi(system, prompt);

    const gone = missingSections(revision.body);
    if (gone.length) {
      console.log(`    ! 개정판에서 필수 섹션 누락(${gone.join(', ')}) — 이 판은 버립니다`);
      fs.writeFileSync(path.join(POSTS_DIR, file), bestSource, 'utf8');
      continue;
    }

    rewriteFile(file, revision);
    const reReview = await evaluatePost(file);

    // 사실 오류가 줄었으면 점수가 조금 내려가도 받는다. 반대로 오류가 늘었으면
    // 점수가 올라도 버린다 — 신뢰가 점수보다 우선이다.
    const fewerErrors = reReview.unsupported.length < bestReview.unsupported.length;
    const moreErrors = reReview.unsupported.length > bestReview.unsupported.length;
    const better = moreErrors ? false : fewerErrors || reReview.overall > bestReview.overall;

    const detail =
      `${reReview.overall.toFixed(2)}점` +
      (reReview.unsupported.length ? `, 근거없는 주장 ${reReview.unsupported.length}건` : ', 근거 문제 없음');

    if (better) {
      bestReview = reReview;
      bestSource = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
      if (revision.changelog) changelogs.push(revision.changelog);
      console.log(`    ${attempts}차 개정: ${detail} (반영)`);
    } else {
      fs.writeFileSync(path.join(POSTS_DIR, file), bestSource, 'utf8');
      console.log(`    ${attempts}차 개정: ${detail} — 이전만 못해 되돌림`);
    }
  }

  // 여기서 저장하지 않는다. 여러 기사를 동시에 개정할 때 saveReview 가
  // 읽기→수정→쓰기라서 서로의 결과를 덮어쓴다. 호출자가 순차로 저장한다.
  return {
    review: bestReview,
    slug,
    before,
    after: bestReview.overall,
    attempts,
    reachedTarget: !needsWork(bestReview, target),
    unsupportedLeft: bestReview.unsupported.length,
    changelog: changelogs.join('\n'),
  };
}

export { dimensionName };
