import type { RawItem } from '../types.js';
import { REDDIT_SUBS, REDDIT_LISTINGS } from '../config.js';
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
    subreddit: string;
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
 * 앱 자격증명이 있으면 OAuth 로 붙는다.
 *
 * ⚠ 다만 이 사이트에는 기본적으로 쓸 수 없다. Reddit 은 "광고로 수익을 내는 서비스"와
 * "수익화된 웹사이트에 Reddit 콘텐츠를 게시하는 서비스"를 상업적 이용으로 규정하고,
 * 무료 티어(100 QPM)는 비상업 용도로만 허용한다. 애드센스로 운영하는 이 사이트는
 * 상업적 이용에 해당하므로 Reddit 승인과 유료 계약이 필요하다.
 * (2025년 말부터 자체 등록도 닫혀 수동 승인 대기다.)
 *
 * 그래서 기본 경로는 공개 RSS 다. 코드는 남겨 두되, 승인을 받은 경우에만 키를 넣는다.
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
async function fetchSubViaRss(
  sub: string,
  sinceHours: number,
  sort = 'top',
  query = 't=day&limit=25',
): Promise<RawItem[]> {
  const xml = await fetchText(`https://www.reddit.com/r/${sub}/${sort}/.rss?${query}`, {
    headers: { 'User-Agent': BROWSER_UA },
  });
  if (!xml) return [];

  const entries = xml.split('<entry>').slice(1);

  const items: RawItem[] = [];
  let rank = 0;
  for (const entry of entries) {
    rank++;
    const title = decodeEntities(entry.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '').trim();
    const permalink = entry.match(/<link href="([^"]+)"/)?.[1] ?? '';
    const published = entry.match(/<published>([\s\S]*?)<\/published>/)?.[1] ?? '';
    const id = entry.match(/<id>([\s\S]*?)<\/id>/)?.[1] ?? '';
    if (!title || !permalink || !published) continue;

    // 읽을 수 없는 시각이면 이 항목만 건너뛴다.
    // 그냥 toISOString() 을 부르면 RangeError 가 나고, 이 함수 전체가 죽어
    // 그 실행의 레딧 소스가 통째로 사라진다.
    const publishedAt = new Date(published);
    if (Number.isNaN(publishedAt.getTime())) continue;
    const createdAt = publishedAt.toISOString();
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
      /*
        RSS 는 업보트·댓글 수를 주지 않는다. 대신 **순서**를 준다 —
        /top 은 그날 표를 많이 받은 순으로 내려오므로 순위 자체가 점수의 대리 지표다.
        예전에는 전부 15점 고정이라 레딧 글끼리 우열을 못 가렸고, 그 결과
        화제성 순위에서 레딧발 기사가 뭉텅이로 같은 자리에 몰렸다.

        1위 40점에서 시작해 순위마다 완만히 깎는다. 절대값은 실제 업보트와 무관하지만
        (그건 알 수 없다) 같은 목록 안의 상대 순서는 정확히 보존된다.
        상한을 40 으로 낮게 잡은 이유: 실제 점수를 아는 HN·GeekNews 항목을
        추측값이 밀어내면 안 되기 때문이다.
      */
      score: Math.max(8, Math.round(40 / (1 + rank * 0.12))),
      commentCount: 0,
      lang: detectLang(title),
    });
  }
  return items;
}

/** 게시물 하나를 RawItem 으로. subreddit 은 응답 안에 들어 있다. */
function toItem(p: RedditChild['data'], weight: number): RawItem | null {
  if (p.stickied || p.over_18) return null;

  const sub = p.subreddit || '';
  // r/MachineLearning 은 AI 전용이 아니라 통계·수학 글도 올라온다. 거기만 키워드 필터.
  if (sub === 'MachineLearning' && !isAiRelated(p.title)) return null;
  if (isHelpRequest(p.title)) return null;

  const permalink = `https://www.reddit.com${p.permalink}`;
  const outbound = p.url_overridden_by_dest || p.url || permalink;

  return {
    source: 'reddit',
    origin: `r/${sub}`,
    id: `rd-${p.id}`,
    title: p.title.trim(),
    url: canonicalUrl(outbound.startsWith('/r/') ? permalink : outbound),
    permalink,
    createdAt: new Date(p.created_utc * 1000).toISOString(),
    // 정렬별 가중을 점수에 반영한다. rising 은 아직 표가 적지만 먼저 잡는 값어치가 있다.
    score: Math.round((p.score ?? 0) * weight),
    commentCount: p.num_comments ?? 0,
    excerpt: p.selftext ? p.selftext.slice(0, 600) : undefined,
    lang: detectLang(p.title),
  };
}

/**
 * 레딧에서 AI 관련 베스트 글을 모은다.
 *
 * 서브레딧을 하나씩 도는 대신 멀티레딧(r/a+b+c)으로 한 번에 받는다.
 * 예전에는 8개 서브를 개별 요청해서 실행마다 8회를 썼고, 그게 레이트리밋(429)의
 * 주된 원인이었다. 멀티레딧이면 정렬 하나당 1회로 끝난다 — 8회 → 1회.
 *
 * 정렬은 세 가지를 함께 본다(top·hot·rising). 이유는 config.ts 의 REDDIT_LISTINGS 주석 참고.
 * 같은 글이 여러 정렬에 걸리면 클러스터링에서 합쳐지고, 그만큼 확실한 신호로 취급된다.
 */
export async function fetchReddit(sinceHours: number): Promise<RawItem[]> {
  const token = await getToken();
  const base = token ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const multi = REDDIT_SUBS.join('+');
  const byId = new Map<string, RawItem>();
  let jsonOk = 0;

  for (const listing of REDDIT_LISTINGS) {
    const data = await fetchJson<{ data: { children: RedditChild[] } }>(
      `${base}/r/${multi}/${listing.sort}.json?${listing.query}&raw_json=1`,
      { headers },
    );
    if (!data?.data?.children) {
      await sleep(1000);
      continue;
    }
    jsonOk++;

    for (const { data: p } of data.data.children) {
      const item = toItem(p, listing.weight);
      if (!item) continue;
      if (hoursAgo(item.createdAt) > sinceHours) continue;

      // 같은 글이 여러 정렬에 나오면 가장 높은 점수를 남긴다.
      const prev = byId.get(item.id);
      if (!prev || item.score > prev.score) byId.set(item.id, item);
    }
    await sleep(1000); // 레이트리밋 배려. 요청이 3회뿐이라 부담이 없다.
  }

  const items = [...byId.values()];

  // JSON 이 전부 막혔을 때만 RSS 로 내려간다. 점수를 못 얻으므로 최후 수단이다.
  let rssFallbacks = 0;
  if (jsonOk === 0) {
    // RSS 도 정렬을 고를 수 있다. /top?t=day 가 곧 "그날의 베스트"라서 이게 1순위다.
    // 서브당 한 번만 받는다 — 정렬을 여러 개 돌리면 요청이 배로 늘어 429 에 걸린다.
    const seen = new Set(items.map((i) => i.id));
    for (const sub of REDDIT_SUBS) {
      const viaRss = await fetchSubViaRss(sub, sinceHours, 'top', 't=day&limit=25');
      const fresh = viaRss.filter((i) => !seen.has(i.id));
      for (const i of fresh) seen.add(i.id);
      if (fresh.length) rssFallbacks++;
      items.push(...fresh);
      await sleep(1500);
    }
  }

  const mode = token
    ? `OAuth · 정렬 ${jsonOk}/${REDDIT_LISTINGS.length}`
    : jsonOk
      ? `공개 API · 정렬 ${jsonOk}/${REDDIT_LISTINGS.length}`
      : rssFallbacks
        ? `JSON 차단 → RSS 폴백 ${rssFallbacks}개 서브 (점수 없음)`
        : 'JSON·RSS 모두 실패';
  console.log(`  · Reddit: ${items.length}건 (${mode})`);
  if (!token && jsonOk === 0) {
    console.log('    → 순위 기반 추정 점수입니다(RSS 는 업보트를 주지 않음). 상대 순서는 정확합니다.');
  }
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
