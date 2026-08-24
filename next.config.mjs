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

  // 이 아래에 설정을 더 넣기 전에 읽어 두면 시간을 아낄 수 있다.
  //
  // dev 와 build 가 같은 .next 를 쓰기 때문에, 개발 서버를 켠 채 npm run build 를 돌리면
  // 서버가 읽던 매니페스트가 덮여 모든 페이지가 500 이 된다. 에러 메시지가
  // "routes-manifest.json 없음"이라 원인을 짐작하기 어렵다.
  // 해결은 설정이 아니라 작업 순서다 — 개발 서버를 켠 채로 빌드하지 않는다.
  // 이미 그렇게 했다면 개발 서버만 다시 띄우면 복구된다.
  //
  // 시도했다가 되돌린 것 두 가지 (같은 길로 다시 가지 않도록 남긴다):
  //   distDir 분리(.next-dev)          — 충돌은 막지만 별 이득이 없다
  //   serverExternalPackages: gray-matter — 개발 서버가 vendor-chunks 를 아예 만들지 못해
  //     "Cannot find module './vendor-chunks/sanitize-html.js'" 로 전 페이지가 500 이 됐다.
  //     번들 대상에서 빼려던 것이 오히려 청크 생성을 깨뜨렸다.

  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
