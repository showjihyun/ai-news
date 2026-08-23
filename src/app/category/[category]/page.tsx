import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAllPosts, getCategories } from '@/lib/posts';
import { PostCard } from '@/components/PostCard';
import { AdSlot } from '@/components/AdSlot';
import { site } from '@/lib/site';
import { PERSONA_BEATS } from '@/lib/desks';

export const dynamicParams = false;

export function generateStaticParams() {
  // 여기서는 인코딩하지 않는다. Next 가 파일 경로를 만들 때 알아서 퍼센트 인코딩하는데,
  // 미리 인코딩해서 넘기면 이중 인코딩되어 '%EB%85%BC%EC%9F%81' 이라는 이름의 디렉터리가
  // 그대로 생긴다. 그러면 브라우저 요청은 디코딩되어 '논쟁' 을 찾으므로 전부 404 가 된다.
  // (링크의 href 는 반대로 encodeURIComponent 가 필요하다 — 그쪽은 브라우저가 보는 주소다.)
  return getCategories().map((c) => ({ category: c.name }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const name = decodeURIComponent(category);
  return {
    title: `${name} AI 뉴스`,
    description: `${name} 분야의 최신 AI 소식을 쉽게 풀어 전합니다. ${site.name}`,
    alternates: { canonical: `${site.url}/category/${encodeURIComponent(name)}/` },
  };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const name = decodeURIComponent(category);
  const posts = getAllPosts().filter((p) => p.category === name);
  if (posts.length === 0) notFound();

  return (
    <>
      <h1 className="page-title">{name}</h1>
      <p className="page-sub">
        {PERSONA_BEATS[name] ?? `${name} 관련 소식`} · {posts.length}건
      </p>
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
