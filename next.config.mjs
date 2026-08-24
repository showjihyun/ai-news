/** @type {import('next').NextConfig} */
const nextConfig = {
  // 완전 정적 내보내기: Core Web Vitals 가 가장 좋고(= SEO = 광고 수익),
  // Vercel / Cloudflare Pages / Netlify 어디에나 그대로 올릴 수 있다.
  //
  // 다만 개발 서버에서는 끈다. 이 설정이 켜져 있으면 Next 가 요청 경로를
  // generateStaticParams() 결과와 대조하는데, 브라우저는 한글 슬러그를 퍼센트 인코딩해
  // 보내고 generateStaticParams 는 원본 한글을 돌려주므로 매칭이 실패한다.
  // 그러면 기사 페이지가 전부 500 이 되어 글을 확인할 수 없다(빌드는 정상).
  // 이 옵션은 빌드 산출물 형태를 정하는 것이라 개발 중에는 없어도 동작이 같다.
  ...(process.env.NODE_ENV === 'production' ? { output: 'export' } : {}),
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
