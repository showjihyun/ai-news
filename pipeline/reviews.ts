import fs from 'node:fs';
import path from 'node:path';
import { RUBRIC } from './rubric.js';

/**
 * 평가 결과 저장소와 개선 지시 생성.
 *
 * evaluate.ts 에서 분리한 이유는 순환 참조 때문이다.
 * evaluate 는 LLM 호출을 위해 writer 를 쓰고, writer 는 집필 전에 개선 지시를 읽어야 한다.
 * 둘을 한 파일에 두면 writer ↔ evaluate 가 서로를 import 하게 된다.
 * 여기에는 파일 입출력과 순수 계산만 두어 어느 쪽에서 불러도 안전하게 만든다.
 */

const REVIEWS_PATH = path.join(process.cwd(), 'data', 'reviews.json');

export interface Review {
  slug: string;
  title: string;
  category: string;
  desk: string;
  publishedAt: string;
  reviewedAt: string;
  scores: Record<string, number>;
  overall: number;
  /** 항목별 근거 — 점수만 있으면 무엇을 고쳐야 할지 알 수 없다. */
  notes: Record<string, string>;
  /** 다음 글에 반영할 구체적 지시 하나. */
  fix: string;
  /** 자료와 어긋나거나 자료에 없는데 단정한 주장. 비어 있어야 정상. */
  unsupported: string[];
  /** 이번 자료로 확인만 불가한 것. 틀렸다는 뜻이 아니므로 감점하지 않는다. */
  unverifiable: string[];
  /** 집필 당시 자료로 평가했는지. false 면 재수집본이라 판정 신뢰도가 낮다. */
  evidenceExact: boolean;
}

interface ReviewStore {
  reviews: Review[];
}

function loadStore(): ReviewStore {
  try {
    return JSON.parse(fs.readFileSync(REVIEWS_PATH, 'utf8')) as ReviewStore;
  } catch {
    return { reviews: [] };
  }
}

export function loadReviews(): Review[] {
  return loadStore().reviews;
}

export function saveReview(review: Review) {
  const store = loadStore();
  store.reviews = store.reviews.filter((r) => r.slug !== review.slug);
  store.reviews.unshift(review);
  store.reviews.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  fs.mkdirSync(path.dirname(REVIEWS_PATH), { recursive: true });
  fs.writeFileSync(REVIEWS_PATH, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

/**
 * 평가 기록을 지운다. 기사를 격리할 때 쓴다.
 *
 * 기록을 남겨 두면 다음 improve 가 사이트에 없는 파일을 고치려다 실패한다.
 * 되돌릴 때는 evaluate 가 다시 만들어 준다.
 */
export function removeReview(slug: string) {
  const store = loadStore();
  const before = store.reviews.length;
  store.reviews = store.reviews.filter((r) => r.slug !== slug);
  if (store.reviews.length === before) return;
  fs.mkdirSync(path.dirname(REVIEWS_PATH), { recursive: true });
  fs.writeFileSync(REVIEWS_PATH, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

export function reviewedSlugs(): Set<string> {
  return new Set(loadStore().reviews.map((r) => r.slug));
}

// ── 개선 루프 ──────────────────────────────────────────────────────────

export interface Weakness {
  key: string;
  name: string;
  average: number;
}

/**
 * 최근 기사에서 가장 약한 항목들.
 *
 * 이게 개선 루프의 심장이다. 평가만 하고 끝나면 점수는 제자리다.
 * 여기서 뽑은 약점이 다음 집필 프롬프트에 '이번에 특히 신경 쓸 것'으로 들어간다.
 */
export function recentWeaknesses(sampleSize = 10, threshold = 4.0): Weakness[] {
  const recent = loadStore().reviews.slice(0, sampleSize);
  if (recent.length < 3) return []; // 표본이 적으면 노이즈다

  return RUBRIC.map((d) => {
    const vals = recent
      .map((r) => r.scores[d.key])
      .filter((n): n is number => typeof n === 'number');
    const average = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return { key: d.key, name: d.name, average };
  })
    .filter((w) => w.average > 0 && w.average < threshold)
    .sort((a, b) => a.average - b.average)
    .slice(0, 2); // 두 개까지만. 지시가 많으면 전부 흐려진다.
}

/** 최근 리뷰에서 나온 구체적 지시들 — 중복 제거해 상위 몇 개만. */
export function recentFixes(sampleSize = 6, limit = 3): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of loadStore().reviews.slice(0, sampleSize)) {
    const fix = r.fix?.trim();
    if (!fix || seen.has(fix)) continue;
    seen.add(fix);
    out.push(fix);
    if (out.length >= limit) break;
  }
  return out;
}

/** 집필 프롬프트에 덧붙일 개선 지시. 없으면 빈 문자열. */
export function buildFocusNote(): string {
  const weak = recentWeaknesses();
  const fixes = recentFixes();
  if (weak.length === 0 && fixes.length === 0) return '';

  const lines = ['', '■ 최근 편집 평가 결과 — 이번 기사에서 특히 신경 쓸 것', ''];

  for (const w of weak) {
    lines.push(`- **${w.name}** 항목이 최근 평균 ${w.average.toFixed(1)}/5 로 낮습니다.`);
    const d = RUBRIC.find((x) => x.key === w.key);
    if (d) lines.push(`  기준: ${d.best}`);
  }
  if (fixes.length) {
    lines.push('', '편집장이 직전 기사들에 남긴 지시:');
    for (const f of fixes) lines.push(`- ${f}`);
  }
  return lines.join('\n');
}
