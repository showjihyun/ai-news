import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { Cluster } from './types.js';
import type { TrendSnapshot } from './collect.js';
import { hoursAgo, seoulDateStamp, seoulDayStart, yamlEscape } from './util.js';
import { isAlreadyPublished } from './state.js';

/**
 * 일간 종합 브리핑.
 *
 * 왜 만드는가: 해외 상위 AI 매체(The Neuron 의 "Everything That Happened in AI Today",
 * TLDR AI 의 일간 이슈)가 공통으로 쓰는 형식이고, 실제로 이들의 최대 트래픽 자산이다.
 * 이유는 두 가지다.
 *   1) "오늘 AI 뉴스" 같은 검색어를 한 페이지가 독점한다.
 *   2) 매일 같은 자리에 있으니 독자가 습관적으로 다시 온다 — 재방문은 광고 노출의 기반이다.
 *
 * 개별 기사와 달리 이 글은 LLM 없이 만든다. 이미 발행한 기사와 수집된 클러스터를
 * 재조합하는 것이라 새로 지어낼 내용이 없고, 그래야 사실 오류가 끼어들 여지도 없다.
 */

const POSTS_DIR = path.join(process.cwd(), 'content', 'posts');

interface PublishedToday {
  slug: string;
  title: string;
  oneLiner: string;
  category: string;
  date: string;
}

function postsPublishedOn(dayStart: Date, dayEnd: Date): PublishedToday[] {
  if (!fs.existsSync(POSTS_DIR)) return [];

  return fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { data } = matter(fs.readFileSync(path.join(POSTS_DIR, f), 'utf8'));
      return {
        slug: f.replace(/\.md$/, ''),
        title: String(data.title ?? ''),
        oneLiner: String(data.oneLiner ?? data.description ?? ''),
        category: String(data.category ?? ''),
        date: String(data.date ?? ''),
      };
    })
    .filter((p) => {
      if (p.category === '데일리') return false; // 브리핑이 브리핑을 인용하지 않도록
      const t = new Date(p.date).getTime();
      return t >= dayStart.getTime() && t < dayEnd.getTime();
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * 기사로 쓰지는 않았지만 오늘 화제였던 것들 — "짧게 훑기" 코너에 넣는다.
 *
 * 중복 판정을 URL 로 한다. 예전에는 제목을 비교했는데, 발행된 기사 제목은 LLM 이 새로
 * 지은 한국어('엔비디아 AVO, ARC-AGI-3서 100%')이고 클러스터 제목은 원문 영어
 * ('NVIDIA AVO scores 100% on...')라서 두 문자열이 겹칠 일이 없었다. 결과적으로
 * 필터가 한 번도 걸리지 않아, 바로 위 '오늘의 주요 소식'에 실린 기사가 아래
 * '짧게 훑기'에 그대로 또 나왔다 — 한 페이지 안의 중복 콘텐츠다.
 *
 * 발행 기록(state)에는 그 이슈를 이루던 모든 소스 URL 이 남아 있으므로, 그걸로 비교하면
 * 언어와 무관하게 정확히 걸린다.
 */
function briefMentions(snapshot: TrendSnapshot, limit = 6): Cluster[] {
  return snapshot.clusters
    .filter((c) => hoursAgo(c.lastActivityAt) <= 24)
    .filter((c) => !isAlreadyPublished(c.items.map((i) => i.url), c.title))
    .slice(0, limit);
}

export function buildDigest(snapshot: TrendSnapshot, when = new Date()): string | null {
  // 서울 시각 기준 하루. CI 러너가 UTC 라도 한국 독자 기준 '오늘'로 묶인다.
  const stamp = seoulDateStamp(when);
  const dayStart = seoulDayStart(when);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3_600_000);

  const todays = postsPublishedOn(dayStart, dayEnd);
  if (todays.length === 0) {
    console.log('[브리핑] 오늘 발행한 기사가 없어 건너뜁니다.');
    return null;
  }

  const [year, month, day] = stamp.split('-');
  const dateLabel = `${year}년 ${Number(month)}월 ${Number(day)}일`;
  const title = `오늘의 AI 뉴스 총정리 — ${dateLabel}`;
  const slug = `${stamp}-ai-뉴스-총정리`;

  const lines: string[] = [];
  lines.push(
    `오늘 하루 전 세계 AI 커뮤니티에서 가장 많이 언급된 소식 ${todays.length}건을 한자리에 모았습니다. ` +
      '각 항목의 제목을 누르면 자세한 해설로 이동합니다.',
    '',
  );

  lines.push('## 오늘의 주요 소식', '');
  todays.forEach((p, i) => {
    lines.push(`### ${i + 1}. [${p.title}](/posts/${p.slug}/)`);
    lines.push('');
    lines.push(`**${p.category}** · ${p.oneLiner}`);
    lines.push('');
  });

  const mentions = briefMentions(snapshot);
  if (mentions.length > 0) {
    lines.push('## 짧게 훑기', '');
    lines.push('기사로 다루지는 않았지만 오늘 함께 화제가 된 소식입니다.', '');
    for (const c of mentions) {
      lines.push(`- [${c.title}](${c.primaryUrl}) — ${c.origins.slice(0, 2).join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## 내일은 무엇을 볼까', '');
  lines.push(
    '이 브리핑은 매일 갱신됩니다. Hacker News, Reddit, GeekNews를 비롯한 여러 커뮤니티를 ' +
      '동시에 지켜보다가 여러 곳에서 함께 화제가 된 소식만 골라 싣습니다.',
    '',
    '[RSS로 구독하기](/rss.xml)',
  );

  const frontmatter = [
    '---',
    `title: ${yamlEscape(title)}`,
    `description: ${yamlEscape(`${dateLabel} AI 뉴스 총정리. 오늘 해외 커뮤니티에서 가장 화제가 된 AI 소식 ${todays.length}건을 한국어로 정리했습니다.`)}`,
    `oneLiner: ${yamlEscape(`오늘 AI 업계에서 벌어진 일 ${todays.length}가지, 5분이면 따라잡습니다`)}`,
    /**
     * 그날의 시각을 쓴다. new Date() 를 쓰면 안 된다.
     *
     * 이 파일은 30분마다 덮어써진다. 매번 지금 시각을 찍으면 브리핑이 언제나
     * '가장 최근 글'이 되어 홈 첫 카드를 차지하고, 사이트맵의 lastmod 와 RSS pubDate 도
     * 매번 갱신된다. 방금 낸 진짜 기사는 아래로 밀리고, 구독자는 같은 브리핑을
     * 하루에 최대 48번 새 글로 받는다. 또 --when 으로 과거 날짜를 만들면
     * 슬러그의 날짜와 frontmatter 날짜가 어긋난다.
     */
    `date: ${yamlEscape(when.toISOString())}`,   // 따옴표 필수 — publish.ts 주석 참고
    'category: "데일리"',
    'desk: "편집국"',
    `tags: ["AI 뉴스", "일간브리핑", "AI 총정리"]`,
    'heat: 0',
    'originUrl: ""',
    `originTitle: ${yamlEscape(title)}`,
    'sources: []',
    '---',
    '',
  ].join('\n');

  fs.mkdirSync(POSTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(POSTS_DIR, `${slug}.md`), frontmatter + lines.join('\n') + '\n', 'utf8');

  console.log(`[브리핑] ✓ ${slug}.md (기사 ${todays.length}건, 짧게 훑기 ${mentions.length}건)`);
  return slug;
}
