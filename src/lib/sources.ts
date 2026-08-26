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
  /** 카드 왼쪽 레일과 칩 색 */
  color: string;
  /**
   * 글이 적은 날 칸을 마감하는 한 줄.
   *
   * 칸마다 글 수가 달라서 짧은 칸 아래 큰 공백이 남는다(실측 241px). 그냥 비워 두면
   * 구멍으로 읽히지만, "여기까지가 오늘 전부"라고 말해 주면 같은 여백이 정보가 된다.
   * 글이 넉넉한 날에는 붙지 않는다.
   */
  note?: string;
  /**
   * 지켜보는 대상. 지금은 레딧만 쓴다.
   *
   * 화면에는 /소개 페이지에서 나온다. 한때 판의 마감 줄에 칩으로 그렸는데
   * 11개가 160px 이 되어 접힘선 예산을 넘겨서 옮겼다.
   */
  watching?: string[];
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
    color: '#ff6600',
    note: '해커뉴스 상위 글 중 AI 관련만 골라 봅니다.',
  },
  {
    key: 'reddit',
    name: 'Reddit',
    // 진짜 Reddit 색(#ff4500)은 바로 옆 Hacker News 주황(#ff6600)과 구분이 안 된다.
    // 명도를 내려 붙여 놨을 때도 두 칸이 다른 곳으로 읽히게 했다.
    color: '#b02a12',
    // "이 중에서" 라고 쓰면 안 된다 — 가리킬 서브레딧 목록이 /소개 로 옮겨가서
    // 이 화면에는 '이 중'에 해당하는 것이 없다.
    note: 'AI 서브레딧 11곳을 지켜보지만, 기준을 넘는 글은 하루 몇 건뿐입니다.',
    /*
      실제 수집하는 서브 **전부**여야 한다.

      처음에는 aiOnly 인 것만 적었는데, 그러면 라벨이 거짓말을 한다 — r/singularity 는
      키워드 필터를 걸었을 뿐 여전히 수집 대상이고 이미 기사 3건을 냈다. 독자가
      r/singularity 발 기사 바로 위에서 "지켜보는 곳"에 그게 없는 걸 보게 된다.

      파이프라인에서 직접 가져오고 싶었지만 거기는 `./feeds.js` 처럼 확장자를 붙여
      import 하고(Node ESM 방식) Next 의 webpack 이 그걸 못 푼다. 그래서 여기 적되,
      어긋나면 tests/sources.test.ts 가 잡는다.
    */
    watching: [
      'r/LocalLLaMA', 'r/singularity', 'r/OpenAI', 'r/artificial',
      'r/ClaudeAI', 'r/aiagents', 'r/Agentic_Marketing', 'r/ChatGPT',
      'r/StableDiffusion', 'r/MachineLearning', 'r/FigmaDesign',
    ],
  },
  {
    key: 'geeknews',
    name: 'GeekNews',
    color: '#10b981',
    note: '국내 커뮤니티는 하루 서너 건이 정상입니다. 칸을 억지로 채우지 않습니다.',
  },
];

/** 상황판에는 안 세우지만 이름과 색은 필요하다. */
export const OFFICIAL_GROUP: SourceGroupMeta = {
  key: 'official',
  name: '공식 발표',
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

/**
 * 화면에 쓸 반응 수치 한 벌.
 *
 * 예전에는 이 규칙(댓글 우선, 없으면 점수, 둘 다 없으면 '—')이 컴포넌트 두 곳에
 * 복사돼 있었다. 한쪽만 고치면 같은 판 안에서 1위와 3위가 서로 다른 기준으로
 * 수치를 보여 주게 되는데, 컴파일러는 아무 말도 해 주지 않는다.
 */
export interface HeatValue {
  /** 화면에 그대로 찍을 문자열 */
  value: string;
  /** 아래 붙는 라벨 */
  label: string;
  /** 수치가 아예 없는 경우 — 크게 외치면 안 된다 */
  missing: boolean;
}

export function heatValue(post: PostMeta): HeatValue {
  const buzz = topBuzz(post);
  if (!buzz) return { value: '—', label: '집계 전', missing: true };
  const useComments = buzz.comments > 0;
  return {
    value: (useComments ? buzz.comments : buzz.score).toLocaleString(),
    label: useComments ? '댓글' : '점수',
    missing: false,
  };
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
