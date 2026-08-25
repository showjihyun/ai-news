import type { SourceId } from './types.js';

export { RSS_FEEDS } from './feeds.js';
export type { FeedConfig } from './feeds.js';

/** 사이트 정체성: 비전문가에게 AI 뉴스를 빠르고 쉽게. */
export const SITE = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || 'AI 브리핑',
  url: (process.env.NEXT_PUBLIC_SITE_URL || 'https://example.com').replace(/\/$/, ''),
};

/** 소스별 신뢰 가중치. 화제성 점수 척도가 소스마다 달라서 이걸로 보정한다. */
export const SOURCE_WEIGHT: Record<SourceId, number> = {
  hackernews: 1.0,
  reddit: 0.9,
  geeknews: 1.15, // 한국어 독자에게 바로 꽂히는 소스라 가산
  rss: 0.75,      // 공식 블로그 = 화제성 지표는 없지만 1차 출처라 속보 가치가 큼
  naver: 0.8,
  x: 1.0,
  facebook: 0.6,
};

/**
 * 수집 대상 서브레딧.
 *
 * aiOnly 를 서브마다 명시한다. 예전에는 코드에 `sub === 'MachineLearning'` 이라고
 * 박아 두었는데, AI 전용이 아닌 서브를 하나 더 넣는 순간 그 조건이 거짓말이 된다.
 *
 * aiOnly: false 인 곳은 AI 키워드 필터를 반드시 거친다. 예를 들어 r/FigmaDesign 은
 * 살아 있는 커뮤니티지만 올라오는 글 대부분이 "손그림 2,000개 무료 배포" 같은
 * 디자인 도구 이야기다. 필터 없이 넣으면 AI 뉴스 사이트에 디자인 잡담이 쏟아진다.
 */
export interface RedditSub {
  name: string;
  /** true = 이 서브의 글은 제목에 'AI' 가 없어도 AI 이야기로 본다 */
  aiOnly: boolean;
  /**
   * 뉴스 밀도. 점수에 곱해 순위를 조정한다.
   *
   * AI 전용이라고 다 뉴스인 건 아니다. r/ChatGPT·r/StableDiffusion 은 밈과
   * 자기 작업물 자랑이 상위를 채운다 — 실측에서 93건 중 49건이 이 둘이었고
   * 1위가 "Thanks for the help mom 🖥️😭" 였다. 커뮤니티 자체는 값어치가 있어서
   * 빼기는 아깝고, 그대로 두면 진짜 뉴스를 밀어낸다. 그래서 가중으로 눌러 둔다.
   */
  newsiness: number;
}

export const REDDIT_SUBS: RedditSub[] = [
  // 뉴스·발표가 주로 도는 곳
  { name: 'LocalLLaMA', aiOnly: true, newsiness: 1.0 },
  /*
    r/singularity 는 AI 전용 서브지만 키워드 필터를 건다.

    이 서브의 상위권은 절반이 로봇 경기 영상과 밈이다. 실제로 어제 1위가 3048점짜리
    육상 경기 영상이었고, AI 전용으로 두면 그게 그대로 우리 화제성 1위가 된다.
    설명할 거리가 없는 구경거리는 "AI 뉴스를 풀어 준다"는 이 사이트가 팔 물건이 아니다.
    이 서브의 진짜 뉴스는 거의 항상 모델명이나 회사명을 제목에 달고 있어서
    키워드 필터로 걸러도 놓치는 게 적다.
  */
  { name: 'singularity', aiOnly: false, newsiness: 0.9 },
  { name: 'OpenAI', aiOnly: true, newsiness: 1.0 },
  { name: 'artificial', aiOnly: true, newsiness: 1.0 },
  { name: 'ClaudeAI', aiOnly: true, newsiness: 0.9 },
  { name: 'aiagents', aiOnly: true, newsiness: 0.9 },
  { name: 'Agentic_Marketing', aiOnly: true, newsiness: 0.85 },

  // AI 전용이지만 밈·자기 작업물 자랑이 상위를 채우는 곳.
  // 키워드 필터를 걸어 "Thanks for the help mom 🖥️😭" 같은 글부터 걸러내고,
  // 그러고도 남는 자랑글이 뉴스를 밀어내지 않도록 가중을 크게 낮춘다.
  { name: 'ChatGPT', aiOnly: false, newsiness: 0.45 },
  { name: 'StableDiffusion', aiOnly: false, newsiness: 0.45 },

  // 종합 커뮤니티 — AI 키워드가 있는 글만 가져온다
  { name: 'MachineLearning', aiOnly: false, newsiness: 0.9 }, // 통계·수학 글도 섞인다
  { name: 'FigmaDesign', aiOnly: false, newsiness: 0.7 },     // 대부분 디자인 도구 이야기다
];

const NEWSINESS = new Map(REDDIT_SUBS.map((s) => [s.name, s.newsiness]));

/** 그 서브의 뉴스 밀도 가중. 모르는 서브는 1.0 으로 둔다. */
export function subNewsiness(sub: string): number {
  return NEWSINESS.get(sub) ?? 1.0;
}

/** 멀티레딧 경로용. r/a+b+c 형태로 한 번에 받는다. */
export const REDDIT_MULTI = REDDIT_SUBS.map((s) => s.name).join('+');

const AI_ONLY_SUBS = new Set(REDDIT_SUBS.filter((s) => s.aiOnly).map((s) => s.name));

/** 이 서브의 글에 AI 키워드 필터를 걸어야 하는가. */
export function needsAiFilter(sub: string): boolean {
  return !AI_ONLY_SUBS.has(sub);
}

/**
 * 레딧에서 무엇을 "베스트"로 볼 것인가.
 *
 * 한 가지 정렬만 보면 놓치는 게 생긴다.
 *   top  — 그날 실제로 표를 많이 받은 글. 검증된 화제지만 이미 몇 시간 지난 뒤다.
 *   hot  — 지금 올라오는 중인 글. 속보에 유리하지만 반짝하고 사라지는 것도 섞인다.
 *   rising — 막 오르기 시작한 글. 남들보다 먼저 쓰려는 이 사이트에 가장 값어치가 크다.
 *
 * 셋을 함께 받아 클러스터링 단계에서 합친다. 같은 글이 여러 정렬에 걸리면
 * 그만큼 확실한 신호라 화제성 점수도 자연히 올라간다.
 */
export const REDDIT_LISTINGS: { sort: string; query: string; weight: number }[] = [
  { sort: 'top', query: 't=day&limit=25', weight: 1.0 },
  { sort: 'hot', query: 'limit=25', weight: 0.9 },
  // rising 은 표본이 적어 점수가 낮게 잡히므로, 발굴 가치를 인정해 가중을 조금 준다.
  { sort: 'rising', query: 'limit=15', weight: 1.1 },
];


/** 이 단어가 없으면 AI 뉴스가 아니라고 본다. */
export const AI_KEYWORDS = [
  'ai', 'a.i.', 'artificial intelligence', 'llm', 'gpt', 'chatgpt', 'openai',
  'anthropic', 'claude', 'gemini', 'deepmind', 'llama', 'mistral', 'qwen',
  'deepseek', 'grok', 'copilot', 'midjourney', 'stable diffusion', 'sora',
  'transformer', 'diffusion model', 'neural network', 'machine learning',
  // 'gpu' / 'benchmark' / 'inference' 는 여기 넣지 않는다. AI 뉴스 판별 기준으로 너무 약해서
  // "Linux 7.2 정식 출시 (CPU·GPU 스케줄링 개선)" 같은 걸 끌고 들어온다.
  // 화제성 가산점(HOT_KEYWORDS)으로는 여전히 쓸모가 있다.
  'agentic', 'rag', 'fine-tune', 'finetuning', 'nvidia',
  'hugging face', 'huggingface', 'multimodal', 'agi', 'mcp',
  '인공지능', '생성형', '거대언어모델', '초거대', '챗지피티', '오픈에이아이',
  '앤스로픽', '클로드', '제미나이', '엔비디아', '딥시크', '자율주행',
];

/** 있으면 화제성이 큰 폭으로 오르는 단어. 클릭이 잘 나오는 주제들. */
export const HOT_KEYWORDS: Record<string, number> = {
  'open source': 1.2, 'opensource': 1.2, 'open-source': 1.2,
  'release': 1.25, 'launch': 1.25, 'announce': 1.2, 'unveil': 1.2,
  'gpt-6': 1.6, 'gpt-5': 1.4, 'claude': 1.3, 'gemini': 1.3, 'llama': 1.25,
  'benchmark': 1.15, 'sota': 1.2, 'free': 1.2, 'price': 1.2, 'pricing': 1.2,
  'lawsuit': 1.25, 'ban': 1.25, 'leak': 1.4, 'leaked': 1.4,
  'layoff': 1.3, 'job': 1.2, 'agi': 1.3, 'breakthrough': 1.3,
  'funding': 1.2, 'billion': 1.2, 'acquisition': 1.25,
  '출시': 1.3, '공개': 1.25, '무료': 1.25, '유출': 1.4, '논란': 1.3, '규제': 1.2,
};

/**
 * 있으면 화제성을 깎는 단어.
 *
 * 지자체 보도자료·행사 후기 류는 구글뉴스 한국 피드에 대량으로 들어오고 서로
 * 비슷해서 클러스터도 잘 뭉치지만, 일반 독자가 클릭할 이유가 없는 글이다.
 * 광고 수익은 "읽고 싶은 글"에서 나오므로 편집 기준으로 눌러 둔다.
 */
export const PENALTY_KEYWORDS: Record<string, number> = {
  '경진대회': 0.35, '성료': 0.3, '간담회': 0.4, '위촉': 0.35, '협약식': 0.35,
  '업무협약': 0.45, '개소식': 0.3, '출범식': 0.5, '공모전': 0.45, '수상': 0.5,
  '시상식': 0.35, '워크숍': 0.5, '설명회': 0.45, '기념식': 0.3, '착수보고회': 0.3,
  '조달청': 0.5, '군수': 0.4, '시장님': 0.3, '도지사': 0.5, '의원': 0.6,
};

export const TUNING = {
  /** 화제성 반감기(시간). 짧을수록 '속보'에 유리. */
  freshnessHalfLifeHours: 8,
  /** 이 시간보다 오래된 글은 아예 후보에서 제외 */
  maxAgeHours: 48,
  /** 클러스터 제목 유사도 임계값 (Jaccard) */
  titleSimilarity: 0.45,
  /** 제목 길이가 크게 다를 때 쓰는 포함계수 임계값 (공통 토큰 / 짧은 제목 토큰 수) */
  titleOverlap: 0.55,
  /** 한 번 실행에 쓸 글 개수 기본값 */
  defaultWriteLimit: 4,
  /** 최소 화제성. 이보다 낮으면 글로 쓰지 않는다 (품질 하한선) */
  minHeat: 12,
  /**
   * LLM 이 매긴 '일반 독자 기준 뉴스 가치' 하한.
   * 화제성이 높아도 개발자만 관심 있는 내용(예: 특정 양자화 파일 배포)이 있는데,
   * 그런 글은 우리 독자층에 안 맞고 광고 성과도 나쁘다.
   */
  minReaderValue: 5,
  /**
   * 쓸 근거로 인정하는 최소 원문 길이(자).
   *
   * 이보다 짧고 커뮤니티 반응도 없으면 재료가 제목뿐이라 기사를 쓰지 않는다.
   * 400자는 리드 문단 하나 정도 — 이보다 적으면 사실을 옮길 것도 없다.
   * 구글뉴스 RSS 처럼 링크가 리다이렉트 껍데기인 소스에서 실제로 자주 걸린다.
   */
  minArticleTextChars: 400,
  /**
   * 기사 품질 하한. 발행 후 평가에서 이 점수에 못 미치면 자동으로 개정한다.
   * 4.0 은 "모든 항목이 무난"이고 4.5 는 "여러 항목이 우수"다.
   * 4.5 로 올린 근거: 13건 측정에서 읽기편함·출처표기는 5점이 흔한데
   * 비전문가이해도·독자실용성은 5점이 0건이었다. 천장이 그 두 항목에 있었고,
   * 무엇이 4점과 5점을 가르는지 프롬프트에 명시해서 열어 두었다.
   */
  minQuality: 4.5,
  /**
   * 애드센스 정책 위험이 high 인 기사를 건너뛸지.
   * false 로 두면 발행하되 로그에 경고만 남긴다. 수익이 목적이라면 켜 두는 편이 안전하다.
   */
  skipAdRiskHigh: true,
  /** 한 기사에 허용할 개정 시도 횟수. 늘려도 수확이 급격히 줄어든다. */
  maxReviseAttempts: 3,
};
