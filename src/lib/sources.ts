import type { PostMeta } from './posts';

/**
 * 기사를 "어디서 온 이야기인가"로 묶는다.
 *
 * 카테고리(신모델·논쟁 등)가 무엇을 다루는지라면, 이건 어느 판에서 도는 이야기인지다.
 * 둘은 다른 축이라 독자가 고르는 기준도 다르다 — 개발자 판의 반응이 궁금한 사람과
 * 국내에서 뭐가 회자되는지 궁금한 사람은 서로 다른 글을 찾는다.
 */
export type SourceGroup = 'reddit' | 'geeknews' | 'public';

export interface SourceGroupMeta {
  key: SourceGroup;
  name: string;
  tagline: string;
  /** 카드 왼쪽 레일과 칩 색 */
  color: string;
}

export const SOURCE_GROUPS: SourceGroupMeta[] = [
  {
    key: 'public',
    name: '공식·매체',
    tagline: '기업 발표와 주요 매체가 먼저 전한 소식',
    color: '#1a44ff',
  },
  {
    key: 'reddit',
    name: 'Reddit',
    tagline: '커뮤니티에서 실제로 논쟁이 붙은 이야기',
    color: '#ff4500',
  },
  {
    key: 'geeknews',
    name: 'GeekNews',
    tagline: '국내 기술 커뮤니티에서 회자되는 소식',
    color: '#10b981',
  },
];

export function groupMeta(key: SourceGroup): SourceGroupMeta {
  return SOURCE_GROUPS.find((g) => g.key === key) ?? SOURCE_GROUPS[0];
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
  if (origins.some((o) => o.startsWith('r/'))) return 'reddit';
  if (origins.some((o) => o.includes('GeekNews'))) return 'geeknews';
  return 'public';
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
  const out: Record<SourceGroup, PostMeta[]> = { public: [], reddit: [], geeknews: [] };
  for (const p of posts) out[sourceGroupOf(p)].push(p);
  return out;
}
