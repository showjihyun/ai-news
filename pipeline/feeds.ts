export interface FeedConfig {
  name: string;
  url: string;
  lang: 'ko' | 'en';
  /**
   * true = 이 피드에 올라오는 건 전부 AI 이야기라, 제목에 'AI' 가 없어도 통과시킨다.
   * false = 종합 매체이므로 AI 키워드 필터를 반드시 거친다.
   *
   * 이걸 피드 이름 정규식으로 추측하면(예전 방식) 'Simon Willison' 같은 이름을
   * 못 잡거나 반대로 엉뚱한 걸 통과시킨다. 명시하는 편이 정확하다.
   */
  dedicated: boolean;
}

/**
 * 1차 출처 위주. 여기서 먼저 잡히면 남들보다 먼저 쓸 수 있다.
 * 죽은 피드는 콘솔에 404/403 으로 찍히므로 주기적으로 확인하고 정리할 것.
 */
export const RSS_FEEDS: FeedConfig[] = [
  // ── AI 1차 출처 (전량 통과) ───────────────────────────────
  { name: 'OpenAI Blog', url: 'https://openai.com/news/rss.xml', lang: 'en', dedicated: true },
  // Anthropic 은 공식 RSS 가 없다(anthropic.com/*.xml 전부 404). 구글뉴스 검색 피드로 대체.
  {
    name: 'Anthropic 뉴스',
    url: 'https://news.google.com/rss/search?q=Anthropic+Claude+when:2d&hl=en-US&gl=US&ceid=US:en',
    lang: 'en',
    dedicated: true,
  },
  { name: 'Google DeepMind', url: 'https://deepmind.google/blog/rss.xml', lang: 'en', dedicated: true },
  { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', lang: 'en', dedicated: true },
  { name: 'AI News (smol.ai)', url: 'https://news.smol.ai/rss.xml', lang: 'en', dedicated: true },
  { name: 'MarkTechPost', url: 'https://www.marktechpost.com/feed/', lang: 'en', dedicated: true },
  {
    name: 'TechCrunch AI',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
    lang: 'en',
    dedicated: true,
  },
  { name: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/', lang: 'en', dedicated: true },
  {
    name: 'The Verge AI',
    url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
    lang: 'en',
    dedicated: true,
  },
  {
    name: 'MIT Tech Review AI',
    url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed',
    lang: 'en',
    dedicated: true,
  },
  {
    name: '구글뉴스 AI(한국)',
    url: 'https://news.google.com/rss/search?q=AI+%EC%9D%B8%EA%B3%B5%EC%A7%80%EB%8A%A5+when:2d&hl=ko&gl=KR&ceid=KR:ko',
    lang: 'ko',
    dedicated: true,
  },

  // ── 종합 매체 (AI 키워드 필터 적용) ───────────────────────
  { name: 'Google AI Blog', url: 'https://blog.google/technology/ai/rss/', lang: 'en', dedicated: false },
  { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', lang: 'en', dedicated: false },
  // GeekNews 는 AI 전용이 아니다. 필터를 안 걸면 'Linux 7.2 출시' 같은 게 섞여 들어온다.
  { name: 'GeekNews', url: 'https://news.hada.io/rss/news', lang: 'ko', dedicated: false },
];
