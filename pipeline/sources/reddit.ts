import type { RawItem } from '../types.js';
import { REDDIT_SUBS } from '../config.js';
import {
  fetchJson, fetchText, isAiRelated, isHelpRequest, detectLang, canonicalUrl, hoursAgo, sleep, UA,
} from '../util.js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#0?32;/g, ' ')
    .replace(/&amp;/g, '&');
}

interface RedditChild {
  data: {
    id: string;
    title: string;
    url_overridden_by_dest?: string;
    url: string;
    permalink: string;
    created_utc: number;
    score: number;
    num_comments: number;
    selftext?: string;
    stickied?: boolean;
    over_18?: boolean;
  };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * 앱 자격증명이 있으면 OAuth 로 붙는다. 공개 .json 엔드포인트는 클라우드 IP에서
 * 429/403 을 자주 뱉기 때문에, GitHub Actions 에서 돌릴 거면 키를 넣는 편이 안정적이다.
 */
async function getToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const body = new URLSearchParams({ grant_type: 'client_credentials' });
  const data = await fetchJson<{ access_token: string; expires_in: number }>(
    'https://www.reddit.com/api/v1/access_token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': UA,
      },
      body,
    },
  );
  if (!data?.access_token) return null;
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

/**
 * RSS 폴백.
 *
 * 레딧은 데이터센터/클라우드 IP 에서 오는 `/hot.json` 요청을 403 으로 막는다.
 * 반면 `/hot/.rss` 는 아직 열려 있다. RSS 에는 업보트·댓글 수가 없지만,
 * 이 시스템에서 레딧의 가장 큰 가치는 "이 뉴스가 레딧에도 떴다"는 교차 출처 신호이고
 * 그건 RSS 로도 온전히 살릴 수 있다. 점수는 보수적인 기저값으로 채운다.
 */
async function fetchSubViaRss(sub: string, sinceHours: number): Promise<RawItem[]> {
  const xml = await fetchText(`https://www.reddit.com/r/${sub}/hot/.rss?limit=40`, {
    headers: { 'User-Agent': BROWSER_UA },
  });
  if (!xml) return [];

  const items: RawItem[] = [];
  for (const entry of xml.split('<entry>').slice(1)) {
    const title = decodeEntities(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim();
    const permalink = entry.match(/<link href="([^"]+)"/)?.[1] ?? '';
    const published = entry.match(/<published>([\s\S]*?)<\/published>/)?.[1] ?? '';
    const id = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1] ?? '';
    if (!title || !permalink || !published) continue;

    const createdAt = new Date(published).toISOString();
    if (hoursAgo(createdAt) > sinceHours) continue;

    // 본문 HTML 안의 [link] 앵커가 외부 원문 주소다.
    const content = entry.match(/<content type="html">([\s\S]*?)<\/content>/)?.[1] ?? '';
    const decoded = decodeEntities(content);
    const outbound = decoded.match(/href="([^"]+)"[^>]*>\s*\[link\]/)?.[1];

    // JSON 경로와 같은 관문을 통과시킨다. 폴백이 원래 경로보다 느슨하면 안 된다.
    //
    // NSFW: RSS 에는 over_18 플래그가 없지만, 레딧은 성인물 썸네일을 nsfw.png 로 준다.
    // r/StableDiffusion 같은 이미지 서브가 폴백으로 넘어올 때 이 검사가 없으면
    // 성인물이 애드센스 사이트에 실릴 수 있다 — 정책 위반이자 계정 정지 사유다.
    if (/nsfw\.png|\bnsfw\b/i.test(decoded) || /\[nsfw\]/i.test(title)) continue;

    // 키워드 필터도 JSON 경로와 동일하게 적용한다(r/MachineLearning 은 AI 전용이 아니다).
    if (sub === 'MachineLearning' && !isAiRelated(title)) continue;
    if (isHelpRequest(title)) continue;

    items.push({
      source: 'reddit',
      origin: `r/${sub}`,
      id: `rd-${id.replace('t3_', '') || permalink}`,
      title,
      url: canonicalUrl(outbound && !outbound.includes('/comments/') ? outbound : permalink),
      permalink,
      createdAt,
      score: 15, // 실제 업보트를 알 수 없으므로 낮게 잡는다 — 과대평가보다 낫다.
      commentCount: 0,
      lang: detectLang(title),
    });
  }
  return items;
}

export async function fetchReddit(sinceHours: number): Promise<RawItem[]> {
  const token = await getToken();
  const base = token ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const items: RawItem[] = [];
  let rssFallbacks = 0;

  for (const sub of REDDIT_SUBS) {
    const data = await fetchJson<{ data: { children: RedditChild[] } }>(
      `${base}/r/${sub}/hot.json?limit=40&raw_json=1`,
      { headers },
    );
    if (!data?.data?.children) {
      const viaRss = await fetchSubViaRss(sub, sinceHours);
      if (viaRss.length) rssFallbacks++;
      items.push(...viaRss);
      await sleep(400);
      continue;
    }

    for (const { data: p } of data.data.children) {
      if (p.stickied || p.over_18) continue;
      const createdAt = new Date(p.created_utc * 1000).toISOString();
      if (hoursAgo(createdAt) > sinceHours) continue;
      // AI 전용 서브레딧이면 키워드 필터를 건너뛴다 (제목에 'AI'가 없어도 AI 뉴스라서).
      const dedicated = sub !== 'MachineLearning';
      if (!dedicated && !isAiRelated(p.title)) continue;
      // 개인 질문·도움 요청은 뉴스가 아니다. 분류 호출까지 가기 전에 끊는다.
      if (isHelpRequest(p.title)) continue;

      const permalink = `https://www.reddit.com${p.permalink}`;
      const outbound = p.url_overridden_by_dest || p.url || permalink;
      items.push({
        source: 'reddit',
        origin: `r/${sub}`,
        id: `rd-${p.id}`,
        title: p.title.trim(),
        url: canonicalUrl(outbound.startsWith('/r/') ? permalink : outbound),
        permalink,
        createdAt,
        score: p.score ?? 0,
        commentCount: p.num_comments ?? 0,
        excerpt: p.selftext ? p.selftext.slice(0, 600) : undefined,
        lang: detectLang(p.title),
      });
    }
    await sleep(400); // 레딧 rate limit 배려
  }

  const mode = token ? 'OAuth' : rssFallbacks ? `공개 API 차단 → RSS 폴백 ${rssFallbacks}개 서브` : '공개 API';
  console.log(`  · Reddit: ${items.length}건 (${mode})`);
  return items;
}

/**
 * 해당 게시물의 상위 댓글 — 여론을 글에 녹일 때 쓴다.
 *
 * fetchReddit 과 같은 토큰을 써야 한다. 예전에는 www.reddit.com 으로 인증 없이 불렀는데,
 * 그건 fetchReddit 이 OAuth 로 우회하고 있는 바로 그 403 에 그대로 걸린다.
 * safeFetch 가 에러를 삼키므로 CI 에서는 커뮤니티 반응이 조용히 0건이 된다.
 */
export async function fetchRedditTopComments(permalink: string, limit = 5): Promise<string[]> {
  const token = await getToken();
  const path = permalink.replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '');
  const base = token ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

  const data = await fetchJson<any>(
    `${base}${path}.json?limit=${limit * 2}&raw_json=1`,
    headers ? { headers } : undefined,
  );
  const children = data?.[1]?.data?.children;
  if (!Array.isArray(children)) return [];
  return children
    .map((c: any) => c?.data?.body as string | undefined)
    .filter((b): b is string => typeof b === 'string' && b.length > 40 && b !== '[deleted]')
    .slice(0, limit)
    .map((b) => b.replace(/\s+/g, ' ').slice(0, 400));
}
