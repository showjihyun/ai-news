import type { MetadataRoute } from 'next';
import { site } from '@/lib/site';

export const dynamic = 'force-static';

/**
 * AI 크롤러를 명시적으로 허용한다.
 *
 * 이 사이트의 목표 중 하나는 사람의 검색뿐 아니라 "AI 에이전트가 답할 때 출처로 인용되는 것"
 * 이다(GEO, Generative Engine Optimization). 인용되려면 먼저 수집이 되어야 하는데,
 * 요즘 많은 매체가 학습 이용을 막으려고 이 봇들을 차단한다. 우리는 반대로 열어 둔다 —
 * 트래픽이 곧 수익인 구조에서 AI 답변에 출처 링크로 노출되는 것은 순이득이다.
 *
 * `Allow: /` 만 있으면 되는 게 아니라 봇 이름을 하나씩 적어 주는 게 낫다.
 * 일부 봇은 자기 이름의 규칙이 있는지부터 확인하고, 없으면 보수적으로 동작한다.
 */
const AI_CRAWLERS = [
  'GPTBot',            // OpenAI 학습
  'OAI-SearchBot',     // ChatGPT 검색 인용
  'ChatGPT-User',      // ChatGPT 가 사용자를 대신해 열람
  'ClaudeBot',         // Anthropic
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  'PerplexityBot',     // Perplexity 색인
  'Perplexity-User',
  'Google-Extended',   // Gemini / AI 개요
  'Applebot-Extended',
  'CCBot',             // Common Crawl — 여러 모델의 데이터 출처
  'Bytespider',
  'Amazonbot',
  'meta-externalagent',
  'cohere-ai',
  'YouBot',
  'DuckAssistBot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: '/' })),
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
