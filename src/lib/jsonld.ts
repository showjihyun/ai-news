import { site } from './site';

/**
 * JSON-LD 를 <script> 안에 안전하게 넣기 위한 이스케이프.
 *
 * 제목이나 출처에 "</script>" 같은 문자열이 섞이면 태그가 조기 종료되면서
 * 스크립트 주입이 된다. 원문 제목은 외부에서 오는 값이라 실제로 가능한 경로다.
 */
export function toSafeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

/**
 * 사이트 전역 구조화 데이터.
 *
 * AI 엔진이 답변에 출처를 붙일 때 "이게 어떤 매체이고 믿을 만한가"를 먼저 판단한다.
 * Organization + WebSite 를 명시하면 그 판단에 쓸 근거가 생긴다. publishingPrinciples 로
 * 편집 원칙 페이지를 가리키는 것도 뉴스 매체 평가에서 실제로 쓰이는 신호다.
 */
export function siteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'NewsMediaOrganization',
        '@id': `${site.url}/#organization`,
        name: site.name,
        url: site.url,
        description: site.description,
        knowsLanguage: 'ko',
        publishingPrinciples: `${site.url}/about/`,
        email: site.contactEmail,
        // 이 매체가 무엇을 다루는지 기계가 읽을 수 있게 못박아 둔다.
        knowsAbout: [
          '인공지능',
          'Artificial Intelligence',
          '대규모 언어 모델',
          'Large Language Models',
          'OpenAI',
          'Anthropic',
          'Google DeepMind',
          'AI 정책',
          'AI 활용법',
        ],
      },
      {
        '@type': 'WebSite',
        '@id': `${site.url}/#website`,
        url: site.url,
        name: site.name,
        description: site.description,
        inLanguage: 'ko',
        publisher: { '@id': `${site.url}/#organization` },
      },
    ],
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
