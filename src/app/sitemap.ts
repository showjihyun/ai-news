import type { MetadataRoute } from 'next';
import { getAllPosts, getCategories, getTags } from '@/lib/posts';
import { site, postUrl } from '@/lib/site';

export const dynamic = 'force-static';

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
    ...getCategories().map((c) => ({
      url: `${site.url}/category/${encodeURIComponent(c.name)}/`,
      lastModified: newest,
      changeFrequency: 'daily' as const,
      priority: 0.6,
    })),
    ...getTags().map((t) => ({
      url: `${site.url}/tag/${encodeURIComponent(t.name)}/`,
      lastModified: newest,
      changeFrequency: 'weekly' as const,
      priority: 0.4,
    })),
  ];
}
