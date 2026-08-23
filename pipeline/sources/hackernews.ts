import type { RawItem } from '../types.js';
import { fetchJson, isAiRelated, detectLang, canonicalUrl } from '../util.js';

interface AlgoliaHit {
  objectID: string;
  title: string | null;
  story_title?: string | null;
  url: string | null;
  story_url?: string | null;
  points: number | null;
  num_comments: number | null;
  created_at: string;
  author: string;
}

const QUERIES = ['AI', 'OpenAI', 'Anthropic', 'LLM', 'Claude', 'Gemini', 'AI agent'];

/**
 * Hacker News (Algolia). 키가 필요 없고, X/개발자 커뮤니티에서 도는 이야기가
 * 대체로 여기 먼저 올라와서 "속보성" 관점에서 가성비가 가장 좋은 소스다.
 */
export async function fetchHackerNews(sinceHours: number): Promise<RawItem[]> {
  const sinceTs = Math.floor((Date.now() - sinceHours * 3_600_000) / 1000);
  const endpoints = [
    `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=50`,
    ...QUERIES.map(
      (q) =>
        `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}` +
        `&tags=story&hitsPerPage=40&numericFilters=created_at_i>${sinceTs},points>15`,
    ),
  ];

  const seen = new Set<string>();
  const items: RawItem[] = [];

  for (const endpoint of endpoints) {
    const data = await fetchJson<{ hits: AlgoliaHit[] }>(endpoint);
    if (!data?.hits) continue;

    for (const hit of data.hits) {
      const title = hit.title || hit.story_title;
      if (!title || seen.has(hit.objectID)) continue;
      if (!isAiRelated(title)) continue;

      const permalink = `https://news.ycombinator.com/item?id=${hit.objectID}`;
      const url = hit.url || hit.story_url || permalink;
      seen.add(hit.objectID);
      items.push({
        source: 'hackernews',
        origin: 'Hacker News',
        id: `hn-${hit.objectID}`,
        title: title.trim(),
        url: canonicalUrl(url),
        permalink,
        createdAt: hit.created_at,
        score: hit.points ?? 0,
        commentCount: hit.num_comments ?? 0,
        lang: detectLang(title),
      });
    }
  }

  console.log(`  · Hacker News: ${items.length}건`);
  return items;
}

/** 글을 쓸 때 "사람들 반응"으로 인용할 상위 댓글을 가져온다. */
export async function fetchHnTopComments(storyId: string, limit = 5): Promise<string[]> {
  const data = await fetchJson<{ hits: { comment_text: string | null; points: number | null }[] }>(
    `https://hn.algolia.com/api/v1/search?tags=comment,story_${storyId}&hitsPerPage=${limit * 3}`,
  );
  if (!data?.hits) return [];
  return data.hits
    .filter((h) => h.comment_text)
    .slice(0, limit)
    .map((h) => h.comment_text!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 40)
    .map((t) => t.slice(0, 400));
}
