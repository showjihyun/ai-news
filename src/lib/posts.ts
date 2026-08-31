import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const POSTS_DIR = path.join(process.cwd(), 'content', 'posts');

export interface PostSource {
  origin: string;
  title: string;
  url: string;
  /** 발행 시점의 커뮤니티 반응. 예전 기사에는 없을 수 있어 옵셔널. */
  score?: number;
  comments?: number;
}

export interface Post {
  slug: string;
  title: string;
  description: string;
  oneLiner: string;
  date: string;
  category: string;
  desk: string;
  tags: string[];
  heat: number;
  originUrl: string;
  originTitle: string;
  sources: PostSource[];
  body: string;
  /** 예상 읽는 시간(분). 카드에 표시하면 클릭 결정을 도와준다. */
  readingMinutes: number;
}

export type PostMeta = Omit<Post, 'body'>;

/** 한국어는 분당 500자 정도로 잡는다(영어 200단어 기준의 통용 환산). */
function readingMinutes(body: string): number {
  return Math.max(1, Math.round(body.replace(/\s/g, '').length / 500));
}

/**
 * 프론트매터의 날짜를 항상 ISO 8601 문자열로 정규화한다.
 *
 * YAML 파서는 따옴표 없는 `date: 2026-08-22T01:20:03.036Z` 를 JS Date 객체로 만든다.
 * 거기에 String() 을 씌우면 'Sat Aug 22 2026 01:20:03 GMT+0900 (대한민국 표준시)' 가 되고,
 * 그 값이 JSON-LD datePublished · OG article:published_time · <time datetime> ·
 * sitemap lastmod 에 전부 그대로 들어간다. 구글 리치 결과는 그 형식을 거부하고,
 * sitemaps.org 는 W3C Datetime 을 요구하므로 lastmod 자체가 무시된다.
 *
 * 발행 쪽(pipeline/publish.ts)에서 따옴표를 씌우도록 고쳤지만, 이미 만들어진 파일과
 * 손으로 쓴 파일도 있으므로 읽는 쪽에서도 막는다.
 */
function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}

function parse(fileName: string): Post {
  const raw = fs.readFileSync(path.join(POSTS_DIR, fileName), 'utf8');
  const { data, content } = matter(raw);
  const slug = fileName.replace(/\.md$/, '');

  return {
    slug,
    title: String(data.title ?? slug),
    description: String(data.description ?? ''),
    oneLiner: String(data.oneLiner ?? ''),
    date: toIso(data.date),
    category: String(data.category ?? '뉴스'),
    desk: String(data.desk ?? '편집팀'),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    heat: Number(data.heat ?? 0),
    originUrl: String(data.originUrl ?? ''),
    originTitle: String(data.originTitle ?? ''),
    sources: Array.isArray(data.sources)
      ? data.sources.map((s: Record<string, unknown>) => ({
          origin: String(s.origin ?? ''),
          title: String(s.title ?? ''),
          url: String(s.url ?? ''),
          score: typeof s.score === 'number' ? s.score : undefined,
          comments: typeof s.comments === 'number' ? s.comments : undefined,
        }))
      : [],
    body: content,
    readingMinutes: readingMinutes(content),
  };
}

let cache: Post[] | null = null;

/** 최신순 전체 글. 정적 빌드라 한 번만 읽고 캐시해도 안전하다. */
export function getAllPosts(): Post[] {
  if (cache) return cache;
  if (!fs.existsSync(POSTS_DIR)) return (cache = []);

  cache = fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map(parse)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return cache;
}

export function getPost(slug: string): Post | undefined {
  return getAllPosts().find((p) => p.slug === slug);
}

/**
 * 목록 페이지(태그·카테고리)가 광고와 색인을 받을 자격을 갖추는 최소 기사 수.
 *
 * 기사 1건짜리 태그 페이지는 제목 한 줄과 링크 하나가 전부다. 거기에 광고를 위아래로
 * 붙이면 "내용은 거의 없고 광고만 있는 화면"이 되는데, 애드센스가 정면으로 금지하는
 * 형태이고 심사 거절 사유 1위인 '가치 없는 콘텐츠' 에 그대로 걸린다.
 *
 * 실제로 그랬다 — 태그 253개 중 204개가 1건짜리였고, 사이트맵 341개 중 3/4 이
 * 그런 페이지였다. 심사관이 무작위로 한 장 열면 대부분 여기에 떨어진다.
 *
 * 이 수에 못 미치는 목록은 광고를 걸지 않고, 사이트맵에서 빼고, noindex 로 둔다.
 * 페이지 자체는 지우지 않는다 — 기사에서 태그로 나가는 링크가 이미 있고, follow 는
 * 살려 두므로 크롤러가 링크를 타고 기사로 가는 경로는 그대로다.
 */
export const MIN_LISTING_POSTS = 3;

/** 광고와 색인을 붙이기에는 내용이 모자란 목록 페이지인가. */
export function isThinListing(count: number): boolean {
  return count < MIN_LISTING_POSTS;
}

export function getCategories(): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of getAllPosts()) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export function getTags(): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of getAllPosts()) {
    for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * 같은 카테고리 → 태그가 겹치는 순으로 관련 글을 뽑는다.
 * 체류 시간이 늘면 광고 노출도 늘기 때문에, 관련 글 배치는 수익에 직접 영향을 준다.
 */
export function getRelated(post: Post, limit = 4): PostMeta[] {
  return getAllPosts()
    .filter((p) => p.slug !== post.slug)
    .map((p) => {
      const sharedTags = p.tags.filter((t) => post.tags.includes(t)).length;
      const sameCategory = p.category === post.category ? 2 : 0;
      return { post: p, score: sharedTags + sameCategory };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || new Date(b.post.date).getTime() - new Date(a.post.date).getTime())
    .slice(0, limit)
    .map((x) => x.post);
}

marked.setOptions({ gfm: true, breaks: false });

/**
 * 본문 마크다운 → HTML.
 *
 * 본문은 우리 LLM 이 만든 것이라 위험도가 낮지만, 그래도 정화한다.
 * 원문 발췌가 프롬프트를 타고 들어오는 구조라서 외부 문자열이 본문에 섞일 여지가 있다.
 */
export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false }) as string;
  return sanitizeHtml(html, {
    allowedTags: [
      'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'blockquote', 'strong', 'em',
      'a', 'code', 'pre', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    allowedAttributes: { a: ['href', 'title'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      // 외부 링크는 새 탭 + rel 처리. 이탈해도 우리 탭은 남아 있어야 광고 노출이 유지된다.
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer nofollow' },
      }),
    },
  });
}
