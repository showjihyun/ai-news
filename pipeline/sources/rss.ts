import { XMLParser } from 'fast-xml-parser';
import type { RawItem } from '../types.js';
import { RSS_FEEDS } from '../config.js';
import { fetchText, isAiRelated, detectLang, canonicalUrl, hoursAgo, stripHtml, mapLimit } from '../util.js';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  textNodeName: '#text',
});

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(node: any): string {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (typeof node === 'object') return String(node['#text'] ?? '');
  return '';
}

function linkOf(entry: any): string {
  const raw = entry.link;
  if (typeof raw === 'string') return raw;
  for (const l of asArray(raw)) {
    if (typeof l === 'string') return l;
    if (l?.['@rel'] === 'alternate' || !l?.['@rel']) return l?.['@href'] ?? '';
  }
  return textOf(entry.guid) || '';
}

/** RSS/Atom 을 공통 RawItem 으로. 공식 블로그가 여기 들어오므로 속보의 원천이다. */
export async function fetchRssFeeds(sinceHours: number): Promise<RawItem[]> {
  const perFeed = await mapLimit(RSS_FEEDS, 5, async (feed) => {
    const xml = await fetchText(feed.url);
    if (!xml) return [] as RawItem[];

    let doc: any;
    try {
      doc = parser.parse(xml);
    } catch {
      return [] as RawItem[];
    }

    const entries = [
      ...asArray(doc?.rss?.channel?.item),
      ...asArray(doc?.feed?.entry),
      ...asArray(doc?.['rdf:RDF']?.item),
    ];

    const out: RawItem[] = [];
    for (const entry of entries) {
      const title = stripHtml(textOf(entry.title));
      if (!title) continue;

      const summary = stripHtml(
        textOf(entry.description) ||
          textOf(entry.summary) ||
          textOf(entry['content:encoded']) ||
          textOf(entry.content),
      );

      // AI 전용 피드는 제목에 'AI'가 없어도 통과. 종합 매체는 키워드 필터를 거친다.
      if (!feed.dedicated && !isAiRelated(`${title} ${summary.slice(0, 300)}`)) continue;

      const dateStr =
        textOf(entry.pubDate) || textOf(entry.published) || textOf(entry.updated) || textOf(entry['dc:date']);
      // 날짜를 못 읽으면 건너뛴다. 예전에는 new Date() 로 채웠는데, 그러면 몇 년 된
      // 아카이브 항목이 '방금 올라온 글'이 되어 신선도 배수 1.0(최대)을 받고
      // 진짜 속보를 밀어낸다. 모르는 건 모르는 대로 두고 버리는 편이 안전하다.
      const parsed = dateStr ? new Date(dateStr) : null;
      if (!parsed || Number.isNaN(parsed.getTime())) continue;
      const createdAt = parsed.toISOString();
      if (hoursAgo(createdAt) > sinceHours) continue;

      const link = linkOf(entry);
      if (!link) continue;

      out.push({
        source: feed.name === 'GeekNews' ? 'geeknews' : 'rss',
        origin: feed.name,
        id: `rss-${feed.name}-${link}`,
        title,
        url: canonicalUrl(link),
        permalink: canonicalUrl(link),
        createdAt,
        // RSS 에는 화제성 지표가 없다. 1차 출처라는 점을 기저 점수로 인정해 준다.
        score: feed.name === 'GeekNews' ? 25 : 20,
        commentCount: 0,
        excerpt: summary ? summary.slice(0, 600) : undefined,
        lang: detectLang(title) === 'ko' ? 'ko' : feed.lang,
      });
    }
    return out;
  });

  const items = perFeed.flat();
  const geek = items.filter((i) => i.source === 'geeknews').length;
  console.log(`  · RSS: ${items.length}건 (그중 GeekNews ${geek}건)`);
  return items;
}
