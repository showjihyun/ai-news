export const site = {
  name: process.env.NEXT_PUBLIC_SITE_NAME || 'AI 브리핑',
  tagline: 'AI 뉴스를, 아는 사람이 옆에서 설명해 주듯이',
  description:
    '전 세계에서 가장 빠르게 도는 AI 소식을 모아, 전문용어 없이 풀어 드립니다. Hacker News·Reddit·GeekNews 등에서 실제로 화제가 된 것만 골라 하루 여러 번 업데이트합니다.',
  url: (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, ''),
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
