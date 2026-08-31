import type { MetadataRoute } from 'next';
import { getAllPosts, getCategories, getTags, isThinListing } from '@/lib/posts';
import { site, postUrl } from '@/lib/site';

export const dynamic = 'force-static';

/*
  얇은 목록 페이지는 사이트맵에 넣지 않는다.

  기사 1건짜리 태그가 204개였고, 그게 전부 들어가면서 사이트맵 341개 중 3/4 이
  "링크 하나뿐인 페이지" 였다. 크롤 예산이 거기로 새고, 애드센스 심사관이 무작위로
  열어 봐도 대부분 그 화면을 본다. 해당 페이지들은 noindex 로 두었으므로
  (tag/category 의 generateMetadata) 사이트맵에도 있으면 안 된다 —
  색인하지 말라고 해 놓고 색인해 달라고 제출하는 꼴이다.
*/
export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();
  const newest = posts[0]?.date ?? new Date().toISOString();

  return [
    { url: `${site.url}/`, lastModified: newest, changeFrequency: 'hourly', priority: 1 },
    { url: `${site.url}/about/`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${site.url}/privacy/`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${site.url}/contact/`, changeFrequency: 'yearly', priority: 0.3 },
    ...posts.map((p) => ({
      url: postUrl(p.slug),
      lastModified: p.date,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...getCategories()
      .filter((c) => !isThinListing(c.count))
      .map((c) => ({
        url: `${site.url}/category/${encodeURIComponent(c.name)}/`,
        lastModified: newest,
        changeFrequency: 'daily' as const,
        priority: 0.6,
      })),
    ...getTags()
      .filter((t) => !isThinListing(t.count))
      .map((t) => ({
        url: `${site.url}/tag/${encodeURIComponent(t.name)}/`,
        lastModified: newest,
        changeFrequency: 'weekly' as const,
        priority: 0.4,
      })),
  ];
}
