/**
 * 사이트 주소.
 *
 * 이 값 하나가 정규 URL·사이트맵·RSS·JSON-LD·OG 태그에 전부 들어간다.
 * 그래서 잘못되면 사이트가 통째로 엉뚱한 곳을 가리키는데, 화면은 멀쩡해 보인다.
 *
 * 실제로 두 번 위험했다.
 *   · 남이 쓰는 vercel.app 주소를 넣어 색인이 통째로 남에게 갈 뻔했다.
 *   · 배포처에 환경 변수를 안 넣으면 기본값 localhost 로 빌드가 **성공**한다.
 *     210개 페이지 전부에 `canonical: http://localhost:3000/...` 이 박힌 채
 *     배포되고, 구글은 그걸 색인할 수 없다.
 *
 * 그래서 프로덕션 빌드에서는 값이 없거나 localhost 면 빌드를 세운다.
 * 개발 서버(NODE_ENV=development)에서는 localhost 가 정상이므로 그냥 둔다.
 */
function resolveSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const isProdBuild = process.env.NODE_ENV === 'production';

  if (isProdBuild && (!raw || /^https?:\/\/localhost/i.test(raw))) {
    throw new Error(
      [
        '',
        'NEXT_PUBLIC_SITE_URL 이 없거나 localhost 입니다.',
        '',
        '이대로 빌드하면 정규 URL·사이트맵·RSS·JSON-LD 가 전부 localhost 를 가리킨 채',
        '배포됩니다. 화면은 멀쩡해 보이지만 구글은 한 페이지도 색인하지 못합니다.',
        '',
        '배포처(Cloudflare Pages → Settings → Environment variables)에',
        '실제 주소를 넣고 다시 빌드하세요. 자세한 내용은 DEPLOY.md.',
        '',
      ].join('\n'),
    );
  }
  return (raw || 'http://localhost:3000').replace(/\/$/, '');
}

export const site = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || 'AI 브리핑',
  tagline: 'AI 뉴스를, 아는 사람이 옆에서 설명해 주듯이',
  description:
    '전 세계에서 가장 빠르게 도는 AI 소식을 모아, 전문용어 없이 풀어 드립니다. Hacker News·Reddit·GeekNews 등에서 실제로 화제가 된 것만 골라 하루 여러 번 업데이트합니다.',
  url: resolveSiteUrl(),
  locale: 'ko_KR',
  contactEmail: process.env.CONTACT_EMAIL || 'contact@example.com',
  adsense: {
    client: process.env.NEXT_PUBLIC_ADSENSE_CLIENT || '',
    slots: {
      top: process.env.NEXT_PUBLIC_ADSENSE_SLOT_TOP || '',
      inArticle: process.env.NEXT_PUBLIC_ADSENSE_SLOT_IN_ARTICLE || '',
      bottom: process.env.NEXT_PUBLIC_ADSENSE_SLOT_BOTTOM || '',
    },
  },
  gaId: process.env.NEXT_PUBLIC_GA_ID || '',
};

/**
 * 기사의 절대 주소.
 *
 * 슬러그가 한글이라 반드시 퍼센트 인코딩해야 한다. 안 하면 sitemap 과 RSS 에
 * 원시 UTF-8 바이트가 그대로 들어가는데, sitemap 규약은 URL 인코딩을 요구한다.
 * 브라우저는 알아서 인코딩해 주지만 크롤러와 피드 리더는 그렇지 않을 수 있고,
 * 그러면 기사 60개가 색인에서 통째로 빠진다.
 *
 * ⚠ generateStaticParams 에는 절대 쓰지 말 것. 거기는 원시 슬러그를 돌려줘야 한다.
 * 예전에 거기서 인코딩했다가 `%EB%85%BC%EC%9F%81` 같은 이름의 디렉터리가 생겨
 * 카테고리·태그 페이지가 전부 404 가 된 적이 있다. 인코딩은 **절대 주소를 만들 때만**.
 */
export function postUrl(slug: string): string {
  return `${site.url}/posts/${encodeURIComponent(slug)}/`;
}

/** 카테고리별 색상. 목록에서 한눈에 구분되게 하고, 표지 이미지 없이도 시각적 리듬을 만든다. */
export const CATEGORY_COLOR: Record<string, string> = {
  데일리: '#0f172a',
  신모델: '#6366f1',
  서비스: '#0ea5e9',
  '산업·투자': '#f59e0b',
  연구: '#8b5cf6',
  '정책·규제': '#ef4444',
  활용법: '#10b981',
  논쟁: '#ec4899',
};

export function categoryColor(name: string): string {
  return CATEGORY_COLOR[name] ?? '#64748b';
}

/*
  서버(빌드 시) 렌더링 날짜는 반드시 서울 시각으로 고정한다.
  GitHub Actions 러너는 UTC 라서, 타임존을 안 박으면 슬러그(서울 기준)와 화면에 찍히는
  날짜가 하루 어긋난다 — 주소는 2026-08-22 인데 본문에는 "8월 21일"이 뜬다.
*/
const KST = 'Asia/Seoul';

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    timeZone: KST,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: KST,
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "3시간 전" 같은 상대 시각. 속보 매체라면 절대 시각보다 이쪽이 훨씬 잘 읽힌다. */
export function relativeTime(iso: string, now = Date.now()): string {
  const diffMinutes = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (diffMinutes < 1) return '방금';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return formatDate(iso);
}
