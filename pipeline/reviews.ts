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
const NEWLINE = '\n';

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
  /**
   * 날조 때문에 사이트에서 내린 시각.
   *
   * 기록을 지우지 않고 표시만 하는 이유가 둘 있다.
   * 첫째, 다음 글에 반영할 지시(fix)와 무엇을 지어냈는지(unsupported)가 여기 있다.
   * 지워 버리면 집필기가 배워야 할 교훈에서 가장 나쁜 사례만 쏙 빠진다.
   * 둘째, 지우면 평균 점수가 저절로 올라간다 — 낮은 점수를 없앤 것뿐인데
   * 품질이 좋아진 것처럼 보여서, 이 기능을 만들게 한 바로 그 하락을 못 보게 된다.
   */
  quarantinedAt?: string;
}

/**
 * 날조가 남아 있는가.
 *
 * 옛 기록에는 unsupported 가 아예 없을 수 있어서(스키마가 나중에 붙었다)
 * 반드시 옵셔널 체이닝으로 본다. cli 쪽에서 `r.unsupported.length` 로 바로 읽다가
 * 기록 하나 때문에 개정 명령 전체가 죽는 일이 있었고, 그 단계는 continue-on-error 라
 * 워크플로는 아무 일 없다는 듯 커밋까지 진행했다 — 안전망이 조용히 꺼진 것이다.
 */
export function hasFabrication(r: Review): boolean {
  return (r.unsupported?.length ?? 0) > 0;
}

/** 사이트에 살아 있는 기사만. 격리된 것은 뺀다. */
export function livingReviews(): Review[] {
  return loadReviews().filter((r) => !r.quarantinedAt);
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
  saveStore(store);
}

function saveStore(store: ReviewStore) {
  fs.mkdirSync(path.dirname(REVIEWS_PATH), { recursive: true });
  fs.writeFileSync(REVIEWS_PATH, JSON.stringify(store, null, 2) + NEWLINE, 'utf8');
}

/**
 * 격리 표시를 한 번에 찍는다.
 *
 * 슬러그마다 파일을 다시 읽고 쓰면, 중간에 죽었을 때 옮긴 파일과 기록이 어긋난다.
 * 한 번만 쓴다.
 */
export function markQuarantined(slugs: string[], at = new Date().toISOString()) {
  if (slugs.length === 0) return;
  const set = new Set(slugs);
  const store = loadStore();
  for (const r of store.reviews) if (set.has(r.slug)) r.quarantinedAt = at;
  saveStore(store);
}

/** 격리를 되돌린다. 사람이 파일을 content/posts 로 옮겼을 때 쓴다. */
export function unmarkQuarantined(slug: string) {
  const store = loadStore();
  for (const r of store.reviews) if (r.slug === slug) delete r.quarantinedAt;
  saveStore(store);
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
