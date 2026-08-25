import type { RawItem } from '../types.js';
import { needsAiFilter, subNewsiness } from '../config.js';
import { fetchText, isAiRelated, isHelpRequest, detectLang, hoursAgo } from '../util.js';

/**
 * Reddit AI 트렌드 집계본.
 *
 * 레딧 본체는 비인증 트래픽에 레이트리밋이 매우 빡빡해서, 실행 한 번에 요청 한두 개가
 * 예산의 전부다. 그마저도 RSS 로 받으면 업보트·댓글 수가 오지 않는다.
 * 그래서 남이 매일 집계해 두는 곳에서 **실제 점수**를 받아 온다.
 *
 * 출처: github.com/liyedanpdx/reddit-ai-trends (MIT)
 *   - AI 관련 서브레딧을 매일 집계해 마크다운 표로 커밋한다.
 *   - raw.githubusercontent.com 이라 레이트리밋이 사실상 없다.
 *   - 표에 제목·서브·점수·댓글 수·분류·작성시각이 다 들어 있다.
 *
 * 이걸 기사 본문의 근거로 쓰지는 않는다. 저쪽 요약을 받아 우리가 다시 요약하면
 * 전언의 전언이 되어 사실 검증이 불가능해진다. 쓰는 것은 표의 사실값뿐이다 —
 * 어떤 글이 몇 점을 받았나. 본문은 우리 파이프라인이 원문에서 직접 만든다.
 */

const REPORT_URL =
  'https://raw.githubusercontent.com/liyedanpdx/reddit-ai-trends/main/reports/latest_report_en.md';

/**
 * 뉴스가 아닌 분류.
 *
 * 집계본은 서브레딧 상위를 그대로 담아서 밈·짤·영상이 상당수 섞인다. 실제로 어제
 * 1위가 육상 경기 영상이었다. 점수만 보면 최상위라 이걸 안 걸러내면 화제성 순위를
 * 통째로 잠식한다. 분류 칸이 이미 있으니 그걸 쓴다.
 */
const NON_NEWS = new Set([
  'Meme', 'Funny', 'Shitposting', 'Video', 'Image', 'Humor',
  'Help Wanted', 'Question', 'Support',
]);

/** 마크다운 이스케이프와 HTML 엔티티를 되돌린다. 표 안에 \' 와 &nbsp; 가 섞여 있다. */
function clean(s: string): string {
  return s
    .replace(/\\([\\`*_{}[\]()#+\-.!'"])/g, '$1')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** '2026-08-24 16:21 UTC' → ISO. 형식이 어긋나면 null 을 돌려 그 행만 버린다. */
function parseUtc(s: string): string | null {
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** '| a | b | c |' → ['a','b','c'] */
function cells(row: string): string[] {
  const t = row.trim();
  if (!t.startsWith('|')) return [];
  return t.slice(1, t.endsWith('|') ? -1 : undefined).split('|').map((c) => c.trim());
}

interface Row {
  id: string;
  title: string;
  truncated: boolean;
  sub: string;
  score: number;
  comments: number;
  category: string;
  createdAt: string;
}

/**
 * 표를 훑어 행을 뽑는다.
 *
 * 표 모양이 세 가지다 — 오늘의 인기(6칸), 주간·월간(순위 칸이 붙어 7칸),
 * 서브레딧별(커뮤니티 칸이 없어 5칸). 칸 수로 분기하면 저쪽이 칸을 하나 더하는 순간
 * 조용히 어긋나므로, 제목 칸을 먼저 찾고 거기서부터 상대 위치로 읽는다.
 */
function parseRows(md: string): Row[] {
  const out: Row[] = [];
  let headingSub = '';

  for (const line of md.split('\n')) {
    const h3 = line.match(/^###\s+r\/(\w+)/i);
    if (h3) {
      headingSub = h3[1];
      continue;
    }
    if (!line.trim().startsWith('|')) continue;

    const c = cells(line);
    const ti = c.findIndex((x) => /\[.*\]\(https?:\/\/[^)]*\/comments\/\w+/.test(x));
    if (ti < 0) continue; // 헤더·구분선·빈 행

    const link = c[ti].match(/\[(.*)\]\((https?:\/\/[^)]+)\)/);
    if (!link) continue;
    const id = link[2].match(/\/comments\/(\w+)/)?.[1];
    if (!id) continue;

    // 제목 다음 칸이 [r/xxx](...) 형태면 커뮤니티 칸이다. 없으면 ### 제목에서 물려받는다.
    const subCell = c[ti + 1] ?? '';
    const subMatch = subCell.match(/r\/(\w+)/);
    const hasSubCell = /\]\(/.test(subCell) && !!subMatch;
    const sub = hasSubCell ? subMatch![1] : headingSub;
    const n = ti + (hasSubCell ? 2 : 1);

    const score = Number(c[n]);
    const comments = Number(c[n + 1]);
    const category = clean(c[n + 2] ?? '');
    const createdAt = parseUtc(c[n + 3] ?? '');
    if (!sub || !createdAt || !Number.isFinite(score) || !Number.isFinite(comments)) continue;

    const rawTitle = clean(link[1]);
    out.push({
      id,
      title: rawTitle.replace(/\s*\.\.\.$/, '').replace(/\s*…$/, ''),
      // 집계본은 긴 제목을 잘라서 싣는다. 잘린 제목으로 기사를 쓰면 사실이 어긋나므로
      // 표시해 두고, 뒤에서 이런 항목은 단독 기사로 못 나가게 막는다.
      truncated: /\.\.\.$|…$/.test(rawTitle),
      sub,
      score,
      comments,
      category,
      createdAt,
    });
  }
  return out;
}

/**
 * 집계본에서 항목을 만든다.
 *
 * 같은 글이 오늘·주간·월간 표에 겹쳐 나오므로 ID 로 합치고 가장 큰 점수를 남긴다.
 */
export async function fetchRedditTrends(sinceHours: number): Promise<RawItem[]> {
  const md = await fetchText(REPORT_URL, {}, 20_000);
  if (!md) {
    console.log('  · Reddit 트렌드 집계본: 받지 못했습니다');
    return [];
  }

  const byId = new Map<string, Row>();
  let dropped = 0;
  for (const r of parseRows(md)) {
    if (NON_NEWS.has(r.category)) { dropped++; continue; }
    if (needsAiFilter(r.sub) && !isAiRelated(r.title)) { dropped++; continue; }
    if (isHelpRequest(r.title)) { dropped++; continue; }
    if (hoursAgo(r.createdAt) > sinceHours) continue;

    const prev = byId.get(r.id);
    if (!prev || r.score > prev.score) byId.set(r.id, r);
  }

  const items: RawItem[] = [...byId.values()].map((r) => ({
    source: 'reddit',
    origin: `r/${r.sub}`,
    id: `rd-${r.id}`,
    title: r.title,
    url: `https://www.reddit.com/comments/${r.id}`,
    permalink: `https://www.reddit.com/comments/${r.id}`,
    createdAt: r.createdAt,
    score: Math.round(r.score * subNewsiness(r.sub)),
    commentCount: r.comments,
    lang: detectLang(r.title),
    titleTruncated: r.truncated || undefined,
  }));

  console.log(
    `  · Reddit 트렌드 집계본: ${items.length}건 (실제 점수 포함, 비뉴스 ${dropped}건 제외)`,
  );
  return items;
}
