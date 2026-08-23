import fs from 'node:fs';
import path from 'node:path';
import type { Cluster, DraftPost } from './types.js';
import { slugify, canonicalUrl, seoulDateStamp, yamlEscape } from './util.js';
import { markPublished } from './state.js';

const POSTS_DIR = path.join(process.cwd(), 'content', 'posts');
const EVIDENCE_DIR = path.join(process.cwd(), 'data', 'evidence');

/**
 * 집필에 실제로 쓰인 근거를 그대로 남긴다.
 *
 * 나중에 품질 평가를 할 때 원문 URL 을 다시 긁어 대조하면 오판이 난다. 기자가 본 것은
 * 원문 본문뿐이 아니라 커뮤니티 댓글과 각 소스의 점수·댓글 수까지였기 때문이다.
 * 실제로 첫 평가에서 "해커뉴스 503점" 같은 진짜 수치가 전부 날조로 잡혔고,
 * 그대로 뒀으면 개선 지시가 '근거 있는 커뮤니티 반응을 빼라'는 엉뚱한 방향으로 갔다.
 *
 * 평가와 집필이 같은 자료를 보게 만드는 것이 유일하게 옳은 방법이다.
 */
export interface StoredEvidence {
  articleText: string;
  reactions: string[];
  items: { origin: string; title: string; url: string; score: number; commentCount: number }[];
}

export function saveEvidence(slug: string, cluster: Cluster, evidence: { articleText: string; reactions: string[] }) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const stored: StoredEvidence = {
    articleText: evidence.articleText,
    reactions: evidence.reactions,
    items: cluster.items.map((i) => ({
      origin: i.origin,
      title: i.title,
      url: i.permalink,
      score: i.score,
      commentCount: i.commentCount,
    })),
  };
  fs.writeFileSync(
    path.join(EVIDENCE_DIR, `${slug}.json`),
    JSON.stringify(stored, null, 2) + '\n',
    'utf8',
  );
}

/** 이미 만들어진 근거 묶음을 그대로 저장 (backfill 용). */
export function saveEvidenceRaw(slug: string, evidence: StoredEvidence) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(EVIDENCE_DIR, `${slug}.json`),
    JSON.stringify(evidence, null, 2) + '\n',
    'utf8',
  );
}

export function loadEvidence(slug: string): StoredEvidence | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(EVIDENCE_DIR, `${slug}.json`), 'utf8')) as StoredEvidence;
  } catch {
    return null;
  }
}

/** 발행 시각 기준 슬러그. 날짜 접두사가 있으면 URL만 봐도 신선도가 보이고 충돌도 없다. */
function buildSlug(title: string, date: Date): string {
  const stamp = seoulDateStamp(date);
  const base = slugify(title) || 'ai-news';
  return `${stamp}-${base}`;
}

export function publishPost(
  cluster: Cluster,
  draft: DraftPost,
  evidence?: { articleText: string; reactions: string[] },
): string {
  const now = new Date();
  let slug = buildSlug(draft.title, now);

  fs.mkdirSync(POSTS_DIR, { recursive: true });
  let n = 2;
  while (fs.existsSync(path.join(POSTS_DIR, `${slug}.md`))) slug = `${buildSlug(draft.title, now)}-${n++}`;

  // 출처 표기는 선택이 아니라 필수다. 애드센스 정책상 원문 크레딧이 없으면
  // '가치 없는 콘텐츠'로 분류될 수 있고, 독자 신뢰에도 직결된다.
  const sources = cluster.items
    .slice(0, 8)
    .map((i) => ({ origin: i.origin, title: i.title, url: i.permalink }));

  const frontmatter = [
    '---',
    `title: ${yamlEscape(draft.title)}`,
    `description: ${yamlEscape(draft.description)}`,
    `oneLiner: ${yamlEscape(draft.oneLiner)}`,
    // 반드시 따옴표로 감싼다. 안 그러면 YAML 파서가 타임스탬프로 해석해 JS Date 객체를
    // 만들고, String(Date) 는 'Sat Aug 22 2026 01:20:03 GMT+0900 (대한민국 표준시)' 가 된다.
    // 그 값이 JSON-LD datePublished 와 sitemap lastmod 에 그대로 들어가 색인에서 거부된다.
    `date: ${yamlEscape(now.toISOString())}`,
    `category: ${yamlEscape(draft.category)}`,
    `desk: ${yamlEscape(draft.desk)}`,
    `tags: [${draft.tags.map(yamlEscape).join(', ')}]`,
    `heat: ${Math.round(cluster.heat)}`,
    `originUrl: ${yamlEscape(cluster.primaryUrl)}`,
    `originTitle: ${yamlEscape(cluster.title)}`,
    'sources:',
    ...sources.flatMap((s) => [
      `  - origin: ${yamlEscape(s.origin)}`,
      `    title: ${yamlEscape(s.title)}`,
      `    url: ${yamlEscape(s.url)}`,
    ]),
    '---',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(POSTS_DIR, `${slug}.md`), frontmatter + draft.body.trim() + '\n', 'utf8');

  if (evidence) saveEvidence(slug, cluster, evidence);

  markPublished({
    slug,
    title: cluster.title,
    urls: cluster.items.map((i) => canonicalUrl(i.url)),
    publishedAt: now.toISOString(),
  });

  return slug;
}
