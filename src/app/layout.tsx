import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import { site } from '@/lib/site';
import { getCategories } from '@/lib/posts';
import { siteJsonLd, toSafeJsonLd } from '@/lib/jsonld';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  keywords: ['AI 뉴스', '인공지능', 'ChatGPT', 'Claude', 'AI 소식', 'LLM', 'AI 정보'],
  openGraph: {
    type: 'website',
    locale: site.locale,
    siteName: site.name,
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
    url: site.url,
  },
  twitter: { card: 'summary_large_image' },
  alternates: {
    canonical: '/',
    types: { 'application/rss+xml': `${site.url}/rss.xml` },
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const categories = getCategories().slice(0, 6);

  return (
    <html lang="ko">
      <head>
        {/* 사이트 전역 구조화 데이터 — AI 엔진이 매체 신뢰도를 판단할 때 쓰는 근거 */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: toSafeJsonLd(siteJsonLd()) }}
        />
        {/* 에이전트에게 정리된 텍스트 색인의 위치를 알려 준다 */}
        <link rel="alternate" type="text/plain" href="/llms.txt" title="llms.txt" />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* 숫자와 소스 이름에만 쓴다. 본문 한글은 Pretendard 그대로 — 자세한 이유는 globals.css */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        {/* 애드센스는 클라이언트 ID 가 설정된 경우에만 로드한다. */}
        {site.adsense.client && (
          <Script
            async
            strategy="afterInteractive"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${site.adsense.client}`}
            crossOrigin="anonymous"
          />
        )}
        {site.gaId && (
          <>
            <Script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${site.gaId}`}
              strategy="afterInteractive"
            />
            <Script id="ga" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${site.gaId}');`}
            </Script>
          </>
        )}
      </head>
      <body>
        <header className="site-header">
          <div className="container header-row">
            <Link href="/" className="brand">
              <span className="brand-dot" aria-hidden="true" />
              {site.name}
            </Link>
            <nav className="nav">
              {categories.map((c) => (
                <Link key={c.name} href={`/category/${encodeURIComponent(c.name)}/`}>
                  {c.name}
                </Link>
              ))}
              <Link href="/about/">소개</Link>
            </nav>
          </div>
        </header>

        <main className="container">{children}</main>

        <footer className="site-footer">
          <div className="container footer-grid">
            <div>
              <div className="brand" style={{ marginBottom: '0.6rem' }}>
                {site.name}
              </div>
              <p className="footer-note">
                이 사이트의 기사는 공개된 원문과 커뮤니티 반응을 바탕으로 AI의 도움을 받아
                작성하며, 발행 전 사람이 확인합니다. 모든 글에 원문 출처를 표기합니다.
                투자·법률·의료에 관한 판단의 근거로 삼지 마세요.
              </p>
            </div>
            <div className="footer-links">
              <Link href="/about/">소개</Link>
              <Link href="/privacy/">개인정보처리방침</Link>
              <Link href="/contact/">문의</Link>
              <a href="/rss.xml">RSS</a>
            </div>
          </div>
          <div className="container" style={{ marginTop: '1.5rem' }}>
            <span className="meta">© {new Date().getFullYear()} {site.name}</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
