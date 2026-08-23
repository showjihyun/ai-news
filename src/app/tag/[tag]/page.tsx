import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAllPosts, getTags } from '@/lib/posts';
import { PostCard } from '@/components/PostCard';
import { AdSlot } from '@/components/AdSlot';
import { site } from '@/lib/site';

export const dynamicParams = false;

export function generateStaticParams() {
  // 인코딩하지 않는다 — 이유는 category/[category]/page.tsx 주석 참고.
  return getTags().map((t) => ({ tag: t.name }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag } = await params;
  const name = decodeURIComponent(tag);
  return {
    title: `${name} 관련 AI 뉴스`,
    description: `${name}에 관한 최신 AI 소식 모음. ${site.name}`,
    alternates: { canonical: `${site.url}/tag/${encodeURIComponent(name)}/` },
  };
}

export default async function TagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const name = decodeURIComponent(tag);
  const posts = getAllPosts().filter((p) => p.tags.includes(name));
  if (posts.length === 0) notFound();

  return (
    <>
      <h1 className="page-title">#{name}</h1>
      <p className="page-sub">{posts.length}건</p>
      <AdSlot slot="top" />
      <ul className="post-list">
        {posts.map((p) => (
          <PostCard key={p.slug} post={p} />
        ))}
      </ul>
      <AdSlot slot="bottom" />
    </>
  );
}
