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

export const REDDIT_SUBS = [
  'LocalLLaMA',
  'singularity',
  'OpenAI',
  'artificial',
  'ClaudeAI',
  'MachineLearning',
  'StableDiffusion',
  'ChatGPT',
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
