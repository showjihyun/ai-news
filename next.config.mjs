/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static output: fastest Core Web Vitals (= better SEO = better ad revenue)
  // and deployable to Vercel / Cloudflare Pages / Netlify / GitHub Pages alike.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
