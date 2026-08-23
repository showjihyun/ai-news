import type { Cluster, RawItem } from './types.js';
import { SOURCE_WEIGHT, HOT_KEYWORDS, PENALTY_KEYWORDS, TUNING } from './config.js';
import { canonicalUrl, domainOf, titleTokens, isSameStory, hoursAgo, keywordMatcher, isNonOriginalUrl } from './util.js';

// 매처는 정규식 컴파일이 들어가므로 모듈 로드 시 한 번만 만든다.
const HOT_MATCHERS = Object.keys(HOT_KEYWORDS).map(
  (kw) => [kw, keywordMatcher(kw)] as const,
);
const PENALTY_MATCHERS = Object.keys(PENALTY_KEYWORDS).map(
  (kw) => [kw, keywordMatcher(kw)] as const,
);

/**
 * 같은 사건을 다룬 아이템을 한 덩어리로 묶는다.
 *
 * 두 단계로 본다:
 *   1) 정규화한 URL 이 같으면 무조건 같은 사건 (가장 확실한 신호)
 *   2) 아니면 제목 토큰 Jaccard 유사도로 판단
 *
 * 왜 중요한가: "Reddit 과 HN 과 GeekNews 에 동시에 떴다"는 사실 자체가
 * 그 뉴스가 진짜 화제라는 가장 강한 증거다. 클러스터링을 못 하면 이 신호를 잃는다.
 */
export function clusterItems(items: RawItem[]): Cluster[] {
  const clusters: Cluster[] = [];
  const tokenCache = new Map<string, Set<string>>();
  const tokensOf = (item: RawItem) => {
    let t = tokenCache.get(item.id);
    if (!t) {
      t = titleTokens(item.title);
      tokenCache.set(item.id, t);
    }
    return t;
  };

  // 화제성 높은 것부터 넣어야 클러스터 대표 제목이 좋은 것으로 잡힌다.
  const sorted = [...items].sort((a, b) => b.score - a.score);

  for (const item of sorted) {
    const url = canonicalUrl(item.url);
    const tokens = tokensOf(item);

    let target: Cluster | undefined;
    for (const c of clusters) {
      const sameUrl = c.items.some((i) => canonicalUrl(i.url) === url);
      if (sameUrl) {
        target = c;
        break;
      }
      const similar = c.items.some((i) =>
        isSameStory(tokensOf(i), tokens, TUNING.titleSimilarity, TUNING.titleOverlap),
      );
      if (similar) {
        target = c;
        break;
      }
    }

    if (target) {
      target.items.push(item);
    } else {
      clusters.push({
        key: `${domainOf(url) || 'x'}-${[...tokens].sort().slice(0, 4).join('-') || item.id}`,
        title: item.title,
        primaryUrl: url,
        items: [item],
        heat: 0,
        breakdown: { engagement: 0, freshness: 0, diversity: 0, keyword: 0 },
        firstSeenAt: item.createdAt,
        lastActivityAt: item.createdAt,
        origins: [],
      });
    }
  }

  return clusters.map(finalize);
}

function finalize(cluster: Cluster): Cluster {
  const items = cluster.items;

  // 대표 제목/링크: 한국어 제목이 있으면 우선(독자가 바로 읽을 수 있어서),
  // 없으면 화제성이 가장 높은 아이템의 제목을 쓴다.
  const best =
    items.find((i) => i.lang === 'ko' && i.score > 0) ??
    items.reduce((a, b) => (b.score > a.score ? b : a));

  // 외부 기사 링크를 우선한다. 토론 링크(레딧/HN/X/긱뉴스)는 원문이 아니라서 후순위.
  // 판정은 util.isNonOriginalUrl 하나로 통일한다 — 여기 목록이 extract 보다 좁으면
  // extract 가 본문 추출을 거부하는 URL 이 대표 링크로 뽑혀 본문 없는 기사가 나간다.
  const article = items.find((i) => !isNonOriginalUrl(i.url)) ?? best;

  cluster.title = best.title;
  cluster.primaryUrl = article.url;
  /**
   * 읽을 수 없는 시각은 걸러 낸다.
   *
   * `new Date(NaN).toISOString()` 은 RangeError 를 던진다. finalize 는 모든 try/catch
   * 바깥에서 도는지라(collect 의 allSettled 는 수집기만 감싼다), 소스 하나가 이상한
   * 타임스탬프를 주면 그 한 건 때문에 수집 전체가 죽고 기사가 0건이 된다.
   * rss/naver 는 자체적으로 걸러 내지만 hackernews·x·facebook 은 제공자 문자열을 그대로 넘긴다.
   */
  const times = items
    .map((i) => new Date(i.createdAt).getTime())
    .filter((t) => Number.isFinite(t));

  if (times.length) {
    cluster.firstSeenAt = new Date(Math.min(...times)).toISOString();
    cluster.lastActivityAt = new Date(Math.max(...times)).toISOString();
  } else {
    // 하나도 못 읽었으면 '아주 오래된 것'으로 둔다. 지금 시각으로 채우면
    // 정체 불명의 항목이 신선도 만점을 받아 진짜 속보를 밀어낸다.
    const epoch = new Date(0).toISOString();
    cluster.firstSeenAt = epoch;
    cluster.lastActivityAt = epoch;
    console.warn(`  ! 시각을 읽을 수 없는 클러스터: ${cluster.title.slice(0, 50)}`);
  }
  cluster.origins = [...new Set(items.map((i) => i.origin))];

  // ── 화제성 점수 ────────────────────────────────────────────────
  // engagement: 소스별로 "가장 강한 신호 하나"를 대표값으로 삼고, 같은 소스 안의
  // 나머지 아이템은 로그로 눌러서 더한다.
  //
  // 단순 합산을 하면 안 되는 이유: 연합뉴스 기사 한 건이 11개 매체로 재전송된 것뿐인데
  // 점수가 11배로 뛴다. 실제로 '조달청 인공지능조달혁신과 출범' 보도자료가 이 방식으로
  // 2위까지 올라왔었다. 재전송 횟수도 신호이긴 하지만 로그 수준의 가치만 있다.
  //
  // 점수 척도가 소스마다 제각각(HN 300점 vs 네이버 18점)이라 log10 으로 압축한 뒤
  // 소스 가중치를 곱한다. 댓글은 "논쟁 중"이라는 뜻이라 업보트보다 가중을 더 준다.
  const bySource = new Map<string, number[]>();
  for (const i of items) {
    const signal = Math.log10(i.score + i.commentCount * 2.5 + 10) * 10;
    const bucket = bySource.get(i.source);
    if (bucket) bucket.push(signal);
    else bySource.set(i.source, [signal]);
  }

  let engagement = 0;
  for (const [source, signals] of bySource) {
    const best = Math.max(...signals);
    const repeatBonus = Math.log2(signals.length) * 3;
    engagement += (best + repeatBonus) * SOURCE_WEIGHT[source as keyof typeof SOURCE_WEIGHT];
  }

  // freshness: 반감기 지수 감쇠. 속보에 확실히 유리하게.
  //
  // 기준 시각은 firstSeenAt 이 아니라 lastActivityAt 이다. 최초 등장 시각을 쓰면
  // 하루 지난 관련 글 하나가 클러스터에 합쳐지는 순간 신선도가 붕괴한다.
  // 실제로 DeepSeek V4 Flash 이슈가 27시간 전 글이 끼면서 heat 38 → 6 으로 떨어졌다.
  // "지금도 이야기되고 있는가"가 우리가 알고 싶은 것이므로 최신 활동 시각이 맞다.
  const age = Math.max(hoursAgo(cluster.lastActivityAt), 0);
  const freshness = Math.pow(0.5, age / TUNING.freshnessHalfLifeHours);

  // diversity: 서로 다른 소스에 걸쳐 떴을수록 진짜 화제다. 여기가 이 시스템의 핵심 신호.
  const distinctSources = new Set(items.map((i) => i.source)).size;
  const diversity = 1 + (distinctSources - 1) * 0.55;

  // keyword: 클릭이 잘 나오는 주제(출시/유출/무료/논란 등)에 가산점을 주고,
  // 지자체 보도자료·행사 후기처럼 일반 독자가 클릭할 이유가 없는 글은 깎는다.
  //
  // includes() 가 아니라 단어 경계 매처를 쓰는 이유: 'agi' 가 'imagine'·'magic' 에,
  // 'ban' 이 'urban'·'banking' 에, 'free' 가 'freelance' 에 걸린다.
  // 그러면 "Adobe imagines new workflows" 같은 제목이 1.3배 가산을 받아 진짜 뉴스를 밀어낸다.
  // 같은 실수를 AI 키워드 필터에서 이미 한 번 했다(util.ts 주석 참고).
  const lowerTitle = items.map((i) => i.title).join(' ').toLowerCase();
  let keyword = 1;
  for (const [kw, match] of HOT_MATCHERS) {
    if (match(lowerTitle)) keyword = Math.max(keyword, HOT_KEYWORDS[kw]);
  }
  for (const [kw, match] of PENALTY_MATCHERS) {
    if (match(lowerTitle)) keyword *= PENALTY_KEYWORDS[kw];
  }

  cluster.breakdown = { engagement, freshness, diversity, keyword };
  cluster.heat = engagement * freshness * diversity * keyword;
  return cluster;
}

export function rankClusters(clusters: Cluster[]): Cluster[] {
  return clusters
    .filter((c) => hoursAgo(c.lastActivityAt) <= TUNING.maxAgeHours)
    .sort((a, b) => b.heat - a.heat);
}
