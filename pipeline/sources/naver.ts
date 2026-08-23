import type { RawItem } from '../types.js';
import { fetchJson, canonicalUrl, hoursAgo, stripHtml, detectLang } from '../util.js';

interface NaverItem {
  title: string;
  link: string;
  originallink?: string;
  description: string;
  pubDate?: string;
  postdate?: string;
  bloggername?: string;
}

const QUERIES = ['인공지능', 'AI 서비스', '챗GPT', 'LLM', '생성형 AI'];

/**
 * 네이버 검색 API (뉴스 + 블로그). 국내 검색 트래픽이 어디로 쏠리는지 보여주는 지표라
 * "한국 독자가 지금 궁금해하는 것"을 잡는 데 쓴다. 키가 없으면 조용히 건너뛴다.
 */
export async function fetchNaver(sinceHours: number): Promise<RawItem[]> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) {
    console.log('  · Naver: 건너뜀 (NAVER_CLIENT_ID/SECRET 미설정)');
    return [];
  }
  const headers = { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret };
  const items: RawItem[] = [];

  /**
   * 같은 기사가 여러 질의에 걸리면 한 번만 담는다.
   *
   * 질의 5개가 겹치는 건 흔하다 — 챗GPT 기사 하나가 '인공지능', '챗GPT', '생성형 AI'
   * 세 곳에 다 잡힌다. 중복을 그대로 두면 cluster.ts 가 같은 소스 안의 반복을
   * repeatBonus(log2(n)×3) 로 보상해서, 기사 한 건이 세 건인 척 화제성 점수를 얻는다.
   * 통신사 기사 재전송을 눌러 주려고 만든 장치가 반대로 작동하는 셈이다.
   */
  const seen = new Set<string>();

  for (const kind of ['news', 'blog'] as const) {
    for (const q of QUERIES) {
      const data = await fetchJson<{ items: NaverItem[] }>(
        `https://openapi.naver.com/v1/search/${kind}.json?query=${encodeURIComponent(q)}&display=30&sort=date`,
        { headers },
      );
      if (!data?.items) continue;

      for (const it of data.items) {
        const title = stripHtml(it.title);
        const dateStr = it.pubDate || (it.postdate ? `${it.postdate.slice(0, 4)}-${it.postdate.slice(4, 6)}-${it.postdate.slice(6, 8)}` : '');
        // 날짜 불명은 건너뛴다 — 이유는 sources/rss.ts 주석 참고.
        const parsed = dateStr ? new Date(dateStr) : null;
        if (!parsed || Number.isNaN(parsed.getTime())) continue;
        const createdAt = parsed.toISOString();
        if (hoursAgo(createdAt) > sinceHours) continue;

        const link = it.originallink || it.link;
        const key = `nv-${kind}-${canonicalUrl(link)}`;
        if (seen.has(key)) continue;
        seen.add(key);

        items.push({
          source: 'naver',
          origin: kind === 'news' ? '네이버 뉴스' : '네이버 블로그',
          id: `nv-${kind}-${link}`,
          title,
          url: canonicalUrl(link),
          permalink: canonicalUrl(it.link),
          createdAt,
          // 검색 상단 노출 = 국내 관심도의 대리 지표. 균일한 기저 점수를 준다.
          score: kind === 'news' ? 18 : 12,
          commentCount: 0,
          excerpt: stripHtml(it.description).slice(0, 400),
          lang: detectLang(title),
        });
      }
    }
  }

  console.log(`  · Naver: ${items.length}건`);
  return items;
}
