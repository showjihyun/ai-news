import type { RawItem } from '../types.js';
import { fetchJson, canonicalUrl, hoursAgo, detectLang } from '../util.js';

/**
 * Facebook.
 *
 * 알아둘 것: 메타는 공개 게시물 검색 API 를 폐지했다. 지금 남아 있는 합법적인 경로는
 * (1) 내가 운영하거나 권한을 받은 페이지의 피드, (2) 승인받은 앱의 Page Public Content
 * Access 정도뿐이다. 그래서 "페이스북에서 뜨는 AI 글"을 임의로 긁어오는 건 불가능하고,
 * 여기서는 지정한 공식 페이지(OpenAI, MetaAI 등)의 피드만 가져온다.
 * 토큰이 없으면 조용히 건너뛴다 — 나머지 소스만으로도 파이프라인은 충분히 돈다.
 */
export async function fetchFacebook(sinceHours: number): Promise<RawItem[]> {
  const token = process.env.FACEBOOK_PAGE_TOKEN;
  const pageIds = (process.env.FACEBOOK_PAGE_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!token || pageIds.length === 0) {
    console.log('  · Facebook: 건너뜀 (공개 검색 API 폐지 — 페이지 토큰 설정 시에만 동작)');
    return [];
  }

  const items: RawItem[] = [];
  for (const pageId of pageIds) {
    const data = await fetchJson<{
      data?: { id: string; message?: string; created_time: string; permalink_url?: string;
               reactions?: { summary?: { total_count: number } };
               comments?: { summary?: { total_count: number } } }[];
    }>(
      // 토큰은 쿼리스트링이 아니라 헤더로 보낸다. 쿼리에 실으면 요청이 실패했을 때
      // util.ts 가 찍는 URL 로그에 토큰이 그대로 남는다(=Actions 실행 로그에 평문 노출).
      `https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}/posts` +
        `?fields=id,message,created_time,permalink_url,reactions.summary(true),comments.summary(true)` +
        `&limit=25`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!data?.data) continue;

    for (const p of data.data) {
      if (!p.message) continue;
      if (hoursAgo(p.created_time) > sinceHours) continue;
      const permalink = p.permalink_url || `https://facebook.com/${p.id}`;
      items.push({
        source: 'facebook',
        origin: `Facebook ${pageId}`,
        id: `fb-${p.id}`,
        title: p.message.replace(/\s+/g, ' ').slice(0, 200),
        url: canonicalUrl(permalink),
        permalink,
        createdAt: p.created_time,
        score: p.reactions?.summary?.total_count ?? 0,
        commentCount: p.comments?.summary?.total_count ?? 0,
        excerpt: p.message.slice(0, 500),
        lang: detectLang(p.message),
      });
    }
  }

  console.log(`  · Facebook: ${items.length}건`);
  return items;
}
