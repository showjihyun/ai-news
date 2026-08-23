import type { RawItem } from '../types.js';
import { fetchJson, isAiRelated, detectLang, canonicalUrl, hoursAgo } from '../util.js';

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

      /**
       * 시간 창을 여기서도 확인한다.
       *
       * 두 번째 엔드포인트(search_by_date)는 numericFilters 로 걸러 주지만,
       * 첫 번째 front_page 검색에는 시간 조건이 없다. 며칠째 프런트페이지에 남아 있는
       * 글이 그대로 들어오는데, rankClusters 는 lastActivityAt(최댓값)만 보므로
       * 오래된 항목이 신선한 클러스터에 붙으면 걸러지지 않는다. 그러면 이미 식은 토론의
       * 점수·댓글 수가 engagement 에 더해지고 소스 다양성까지 올려 화제성을 부풀린다.
       *
       * 읽을 수 없는 시각도 여기서 버린다 — 그대로 두면 finalize 에서 RangeError 가 난다.
       */
      const created = new Date(hit.created_at);
      if (Number.isNaN(created.getTime())) continue;
      if (hoursAgo(created.toISOString()) > sinceHours) continue;

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
        createdAt: created.toISOString(),
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
