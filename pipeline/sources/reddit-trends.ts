import type { RawItem } from '../types.js';
import { REDDIT_SUBS, needsAiFilter, subNewsiness } from '../config.js';
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

/** 우리가 고른 서브인지. 집계본은 우리 목록 밖의 서브도 담는다. */
const KNOWN_SUBS = new Set(REDDIT_SUBS.map((s) => s.name.toLowerCase()));
function isKnownSub(sub: string): boolean {
  return KNOWN_SUBS.has(sub.toLowerCase());
}

/** 검증하지 않은 서브의 뉴스 밀도. 목록에 있는 서브의 하한(0.45)보다 낮게 잡는다. */
const UNVETTED_NEWSINESS = 0.4;

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
  // 구경거리 모음. 로봇 경기 영상·과장 예언이 대부분이라 풀어 줄 내용이 없다.
  'The Singularity is Near',
]);
/*
  'Robotics' 는 일부러 넣지 않는다.

  이 분류에 육상 경기 영상 같은 구경거리가 섞이는 건 맞지만, 휴머노이드 회사의
  투자·출시처럼 진짜 뉴스도 같은 분류로 온다. 통째로 막으면 그쪽까지 날아간다.
  구경거리는 아래 AI 키워드 필터가 잡는다 — 제목에 모델명도 회사명도 없기 때문이다.
*/

/** 마크다운 이스케이프와 HTML 엔티티를 되돌린다. 표 안에 \' 와 &nbsp; 가 섞여 있다. */
function clean(s: string): string {
  return (
    s
      .replace(/\\([\\`*_{}[\]()#+\-.!'"])/g, '$1')
      /*
        세미콜론을 선택으로 둔다. 집계본이 긴 제목을 자를 때 엔티티 한가운데를 자르는
        일이 있어서 `250$.&nbsp` 처럼 세미콜론 없이 끝난다. `&nbsp;` 만 처리하면
        그 토막이 제목에 그대로 남는다(오늘 자 보고서에서 7건 확인).
      */
      .replace(/&nbsp;?/g, ' ')
      .replace(/&quot;?/g, '"')
      .replace(/&#0?39;?/g, "'")
      .replace(/&lt;?/g, '<')
      .replace(/&gt;?/g, '>')
      .replace(/&amp;?/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
  );
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
    /*
      제목 줄을 만나면 상속을 끊는다.

      예전에는 `### r/xxx` 만 보고 headingSub 를 세팅하고 비우지는 않았다.
      그러면 서브레딧별 섹션이 끝난 뒤에 나오는 표(예: ## Trend Analysis)의 행이
      마지막 서브에 그대로 붙는다 — 그 서브의 뉴스 밀도와 필터 규칙까지 딸려 간다.
      지금은 그 표에 글 링크가 없어 안 걸리지만, 저쪽이 링크를 하나 넣는 순간 터진다.
    */
    if (/^#{1,6}\s/.test(line)) {
      headingSub = line.match(/^###\s+r\/(\w+)/i)?.[1] ?? '';
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
    /*
      집계본은 우리가 고르지 않은 서브도 담는다(r/LocalLLM, r/AI_Agents, r/LLMDevs,
      r/datascience 등). 그런 서브는 검증한 적이 없으므로 AI 키워드 필터를 무조건 걸고,
      뉴스 밀도도 낮춰 잡는다. 안 그러면 우리가 일부러 0.45 로 눌러 둔 r/ChatGPT 보다
      검증 안 된 서브가 더 높은 가중치(기본 1.0)를 받는다.
    */
    if ((needsAiFilter(r.sub) || !isKnownSub(r.sub)) && !isAiRelated(r.title)) { dropped++; continue; }
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
    score: Math.round(r.score * (isKnownSub(r.sub) ? subNewsiness(r.sub) : UNVETTED_NEWSINESS)),
    commentCount: r.comments,
    lang: detectLang(r.title),
    titleTruncated: r.truncated || undefined,
  }));

  console.log(
    `  · Reddit 트렌드 집계본: ${items.length}건 (실제 점수 포함, 비뉴스 ${dropped}건 제외)`,
  );
  return items;
}
