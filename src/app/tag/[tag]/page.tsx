import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAllPosts, getTags, isThinListing } from '@/lib/posts';
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
  const count = getAllPosts().filter((p) => p.tags.includes(name)).length;
  return {
    title: `${name} 관련 AI 뉴스`,
    description: `${name}에 관한 최신 AI 소식 모음. ${site.name}`,
    alternates: { canonical: `${site.url}/tag/${encodeURIComponent(name)}/` },
    // 얇은 태그는 색인에서 뺀다 — 이유는 posts.ts 의 MIN_LISTING_POSTS 주석 참고.
    // 루트 레이아웃의 robots 를 페이지 단위로 덮어쓴다.
    ...(isThinListing(count) ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function TagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  const name = decodeURIComponent(tag);
  const posts = getAllPosts().filter((p) => p.tags.includes(name));
  if (posts.length === 0) notFound();

  // 기사 1~2건짜리 태그에 광고를 붙이면 화면의 대부분이 광고가 된다. 그런 페이지는
  // 광고 없이 목록만 보여 준다 — posts.ts 의 MIN_LISTING_POSTS 주석 참고.
  const thin = isThinListing(posts.length);

  return (
    <>
      <h1 className="page-title">#{name}</h1>
      <p className="page-sub">{posts.length}건</p>
      {!thin && <AdSlot slot="top" />}
      <ul className="post-list">
        {posts.map((p) => (
          <PostCard key={p.slug} post={p} />
        ))}
      </ul>
      {!thin && <AdSlot slot="bottom" />}
    </>
  );
}
