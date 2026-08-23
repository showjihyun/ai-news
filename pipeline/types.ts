export type SourceId =
  | 'hackernews'
  | 'reddit'
  | 'geeknews'
  | 'rss'
  | 'naver'
  | 'x'
  | 'facebook';

/** 한 소스에서 건져 올린 원본 게시물 하나. */
export interface RawItem {
  source: SourceId;
  /** 사람이 읽는 출처 이름. 예: 'r/LocalLLaMA', 'OpenAI Blog', 'GeekNews' */
  origin: string;
  id: string;
  title: string;
  /** 실제 기사/원문 링크 */
  url: string;
  /** 토론 링크 (없으면 url 과 동일) */
  permalink: string;
  createdAt: string;
  /** 업보트·좋아요·포인트 등 */
  score: number;
  commentCount: number;
  excerpt?: string;
  lang: 'ko' | 'en' | 'other';
}

/** 여러 소스에서 같은 사건을 다룬 아이템들을 하나로 묶은 것. */
export interface Cluster {
  key: string;
  title: string;
  primaryUrl: string;
  items: RawItem[];
  /** 소스 다양성·화제성·신선도를 합친 최종 점수 */
  heat: number;
  breakdown: {
    engagement: number;
    freshness: number;
    diversity: number;
    keyword: number;
  };
  /** 이 이슈가 처음 등장한 시각 — "몇 시간 전 뉴스"로 표시할 때 쓴다. */
  firstSeenAt: string;
  /** 가장 최근에 언급된 시각 — 신선도 점수는 이걸 기준으로 계산한다. */
  lastActivityAt: string;
  origins: string[];
}

/** LLM 이 써낸 글 (발행 전) */
export interface DraftPost {
  title: string;
  description: string;
  tags: string[];
  category: string;
  /** 집필 데스크 이름 (바이라인). personas.ts 참고 */
  desk: string;
  oneLiner: string;
  /** 이 글이 단순 요약과 다른 지점. 편집 점검용이며 페이지에는 노출하지 않는다. */
  angle: string;
  body: string;
}
