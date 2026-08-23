import { fetchText, stripHtml, domainOf, mapLimit, isDiscussionUrl } from './util.js';
import type { Cluster } from './types.js';
import { fetchHnTopComments } from './sources/hackernews.js';
import { fetchRedditTopComments } from './sources/reddit.js';

/** 반응 인용 상한. 너무 많으면 프롬프트가 반응으로만 차서 원문 분석이 밀린다. */
const MAX_REACTIONS = 12;

/**
 * 원문 본문을 최대한 뽑아낸다. LLM 이 제목만 보고 쓰면 헛소리를 하게 되므로,
 * 사실 근거를 넣어주는 게 글 품질(=재방문율=수익)의 핵심이다.
 * 파싱 라이브러리 없이 간단한 휴리스틱으로 처리 — 실패하면 excerpt 로 폴백한다.
 */
export async function extractArticle(url: string, maxChars = 6000): Promise<string> {
  const html = await fetchText(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!html) return '';

  // <article> 또는 본문으로 보이는 큰 덩어리를 우선 시도
  const article = html.match(/<article[\s\S]*?<\/article>/i)?.[0];
  const main = article ?? html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;

  // 문단 단위로 뽑아 짧은 UI 텍스트(메뉴/버튼)를 걸러낸다
  const paragraphs = [...main.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter((t) => t.length > 60);

  const text = paragraphs.length >= 3 ? paragraphs.join('\n\n') : stripHtml(main);
  return text.slice(0, maxChars);
}

export interface Evidence {
  articleText: string;
  reactions: string[];
}


/**
 * 글을 쓰기 위한 근거 묶음.
 *
 * 예전에는 대표 URL 하나만 긁고 첫 소스의 댓글 4개만 가져왔다. 그러면 쓸 재료가 없어서
 * 원문을 옮기는 것 말고는 할 수 있는 게 없다 — 차별성 점수가 낮았던 진짜 이유다.
 *
 * 그래서 두 가지를 넓혔다.
 *   1) 서로 다른 매체의 기사를 여러 개 긁는다. 같은 사건도 매체마다 강조점이 달라서,
 *      그 차이 자체가 "어디는 A를 강조했지만 어디는 B를 뺐다" 같은 분석 재료가 된다.
 *   2) 커뮤니티 댓글을 모든 토론 소스에서 모은다. 반대 의견과 빠진 조건은
 *      대부분 댓글에 있고, 그게 요약글과 해설글을 가르는 지점이다.
 */
export async function gatherEvidence(cluster: Cluster): Promise<Evidence> {
  // ── 1) 본문: 서로 다른 도메인의 기사 최대 3곳 ──────────────────
  const seenHosts = new Set<string>();
  const articleUrls: { url: string; origin: string }[] = [];

  for (const url of [cluster.primaryUrl, ...cluster.items.map((i) => i.url)]) {
    if (isDiscussionUrl(url)) continue; // 토론 페이지는 원문이 아니다
    const host = domainOf(url);
    if (!host || seenHosts.has(host)) continue;
    seenHosts.add(host);
    const origin = cluster.items.find((i) => i.url === url)?.origin ?? host;
    articleUrls.push({ url, origin });
    if (articleUrls.length >= 3) break;
  }

  const texts = await mapLimit(articleUrls, 3, async ({ url, origin }) => {
    const text = await extractArticle(url, 5000);
    return text.length > 300 ? `[${origin} — ${domainOf(url)}]\n${text}` : '';
  });

  // ── 2) 반응: 모든 토론 소스에서 ────────────────────────────────
  const hnItems = cluster.items.filter((i) => i.source === 'hackernews').slice(0, 2);
  const redditItems = cluster.items
    .filter((i) => i.source === 'reddit')
    .sort((a, b) => b.commentCount - a.commentCount)
    .slice(0, 2);

  const reactionGroups = await Promise.all([
    ...hnItems.map(async (i) =>
      (await fetchHnTopComments(i.id.replace(/^hn-/, ''), 6)).map((c) => `[Hacker News] ${c}`),
    ),
    ...redditItems.map(async (i) =>
      (await fetchRedditTopComments(i.permalink, 6)).map((c) => `[${i.origin}] ${c}`),
    ),
  ]);

  // 소스별로 번갈아 뽑는다. 한 스레드가 상한을 다 차지하면 반대 의견이 잘려 나간다.
  const reactions: string[] = [];
  for (let round = 0; reactions.length < MAX_REACTIONS; round++) {
    const before = reactions.length;
    for (const group of reactionGroups) {
      if (group[round] && reactions.length < MAX_REACTIONS) reactions.push(group[round]);
    }
    if (reactions.length === before) break; // 더 뽑을 게 없다
  }

  // 본문 추출이 전부 실패하면 각 소스의 요약문으로 메운다.
  const joined = texts.filter(Boolean).join('\n\n---\n\n');
  const fallback = cluster.items
    .map((i) => i.excerpt)
    .filter((e): e is string => Boolean(e))
    .join('\n\n');

  return {
    articleText: joined.length > 300 ? joined : fallback,
    reactions,
  };
}
