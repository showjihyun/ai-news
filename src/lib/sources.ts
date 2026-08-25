import type { PostMeta } from './posts';

/**
 * 기사를 "어디서 온 이야기인가"로 묶는다.
 *
 * 카테고리(신모델·논쟁 등)가 무엇을 다루는지라면, 이건 어느 판에서 도는 이야기인지다.
 * 둘은 다른 축이라 독자가 고르는 기준도 다르다 — 개발자 판의 반응이 궁금한 사람과
 * 국내에서 뭐가 회자되는지 궁금한 사람은 서로 다른 글을 찾는다.
 */
export type SourceGroup = 'hackernews' | 'reddit' | 'geeknews' | 'official';

export interface SourceGroupMeta {
  key: SourceGroup;
  name: string;
  tagline: string;
  /** 카드 왼쪽 레일과 칩 색 */
  color: string;
}

/**
 * 홈 상황판에 세우는 세 판.
 *
 * 전부 "사람들이 모여서 떠드는 곳"이라는 공통점으로 고른 것이다. 기업 공식 발표는
 * 여기 넣지 않는다 — 그건 뜨는 장소가 아니라 소식의 종류라, 같은 줄에 세우면
 * "어디서 뜨고 있나"라는 축이 무너진다. 공식 발표는 아래 별도 줄로 뺐다.
 */
export const SOURCE_GROUPS: SourceGroupMeta[] = [
  {
    key: 'hackernews',
    name: 'Hacker News',
    tagline: '개발자들이 가장 먼저 물어뜯는 곳',
    color: '#ff6600',
  },
  {
    key: 'reddit',
    name: 'Reddit',
    tagline: '실제로 써 본 사람들의 반응',
    // 진짜 Reddit 색(#ff4500)은 바로 옆 Hacker News 주황(#ff6600)과 구분이 안 된다.
    // 명도를 내려 붙여 놨을 때도 두 칸이 다른 곳으로 읽히게 했다.
    color: '#b02a12',
  },
  {
    key: 'geeknews',
    name: 'GeekNews',
    tagline: '국내에서 회자되는 소식',
    color: '#10b981',
  },
];

/** 상황판에는 안 세우지만 이름과 색은 필요하다. */
export const OFFICIAL_GROUP: SourceGroupMeta = {
  key: 'official',
  name: '공식 발표',
  tagline: '기업이 직접 낸 소식',
  color: '#1a44ff',
};

const ALL_GROUPS = [...SOURCE_GROUPS, OFFICIAL_GROUP];

export function groupMeta(key: SourceGroup): SourceGroupMeta {
  return ALL_GROUPS.find((g) => g.key === key) ?? SOURCE_GROUPS[0];
}

/**
 * 기사가 속한 그룹.
 *
 * 한 기사가 여러 판에 동시에 뜨는 일이 흔하다(그게 이 사이트가 화제성을 판단하는
 * 핵심 신호이기도 하다). 그럴 때는 커뮤니티 쪽을 우선한다 — 공식 발표는 어디서나
 * 볼 수 있지만 "사람들이 그걸 어떻게 받아들였나"는 커뮤니티에만 있고,
 * 그게 우리 기사에 담긴 차별점이기 때문이다.
 */
export function sourceGroupOf(post: PostMeta): SourceGroup {
  const origins = post.sources.map((s) => s.origin);
  // 한 기사가 여러 판에 동시에 뜨는 일이 흔하다. 그럴 때는 희소한 쪽을 남긴다 —
  // Hacker News 는 거의 모든 기사에 붙어 있어서, 그쪽을 우선하면 나머지 두 칸이 빈다.
  if (origins.some((o) => o.startsWith('r/'))) return 'reddit';
  if (origins.some((o) => o.includes('GeekNews'))) return 'geeknews';
  if (origins.some((o) => o.includes('Hacker News'))) return 'hackernews';
  return 'official';
}

/** 그 기사가 커뮤니티에서 얼마나 뜨거웠는지. 카드에 근거로 표시한다. */
export interface Buzz {
  score: number;
  comments: number;
  origin: string;
}

export function topBuzz(post: PostMeta): Buzz | null {
  const ranked = post.sources
    .map((s) => ({ score: s.score ?? 0, comments: s.comments ?? 0, origin: s.origin }))
    // 댓글에 가중을 더 준다. 업보트는 '봤다'지만 댓글은 '반응했다'라서
    // "논쟁이 붙었다"를 재는 데는 이쪽이 정확하다.
    .sort((a, b) => b.comments * 3 + b.score - (a.comments * 3 + a.score));

  const best = ranked[0];
  if (!best || (best.score <= 0 && best.comments <= 0)) return null;
  return best;
}

export function groupPosts(posts: PostMeta[]): Record<SourceGroup, PostMeta[]> {
  const out: Record<SourceGroup, PostMeta[]> = {
    hackernews: [],
    reddit: [],
    geeknews: [],
    official: [],
  };
  for (const p of posts) out[sourceGroupOf(p)].push(p);
  return out;
}
