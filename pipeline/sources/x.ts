import type { RawItem } from '../types.js';
import { fetchJson, canonicalUrl, hoursAgo, detectLang } from '../util.js';

interface Tweet {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
  public_metrics?: { retweet_count: number; reply_count: number; like_count: number; quote_count: number };
}

const QUERY =
  '(AI OR LLM OR OpenAI OR Anthropic OR "AI agent" OR GPT) -is:retweet -is:reply lang:en has:links';

/**
 * X(Twitter) API v2 recent search.
 *
 * 주의: 이 엔드포인트는 유료 플랜(Basic 이상)이 필요하다. 토큰이 없으면 건너뛴다.
 * 토큰이 없어도 X 에서 도는 이야기는 대부분 몇십 분 안에 Hacker News/Reddit 로
 * 흘러들어오므로, 그쪽이 사실상의 대체재 역할을 한다.
 */
export async function fetchX(sinceHours: number): Promise<RawItem[]> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) {
    console.log('  · X: 건너뜀 (X_BEARER_TOKEN 미설정 — HN/Reddit 이 대체 커버)');
    return [];
  }

  const url =
    `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(QUERY)}` +
    `&max_results=100&tweet.fields=created_at,public_metrics,entities&expansions=author_id&user.fields=username,name`;

  const data = await fetchJson<{ data?: Tweet[]; includes?: { users?: { id: string; username: string }[] } }>(
    url,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!data?.data) {
    console.log('  · X: 0건');
    return [];
  }

  const userById = new Map((data.includes?.users ?? []).map((u) => [u.id, u.username]));
  const items: RawItem[] = [];

  for (const t of data.data) {
    if (hoursAgo(t.created_at) > sinceHours) continue;
    const m = t.public_metrics;
    // 트윗 자체는 화제성 편차가 크다. 리트윗 가중이 높은 이유는 확산 = 뉴스 가치라서.
    const score = (m?.like_count ?? 0) + (m?.retweet_count ?? 0) * 3 + (m?.quote_count ?? 0) * 2;
    if (score < 50) continue;

    const username = userById.get(t.author_id) ?? 'i';
    const permalink = `https://x.com/${username}/status/${t.id}`;
    items.push({
      source: 'x',
      origin: `X @${username}`,
      id: `x-${t.id}`,
      title: t.text.replace(/\s+/g, ' ').slice(0, 200),
      url: canonicalUrl(permalink),
      permalink,
      createdAt: t.created_at,
      score,
      commentCount: m?.reply_count ?? 0,
      excerpt: t.text.slice(0, 500),
      lang: detectLang(t.text),
    });
  }

  console.log(`  · X: ${items.length}건`);
  return items;
}
