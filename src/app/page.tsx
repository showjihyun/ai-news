import Link from 'next/link';
import { getAllPosts, getCategories } from '@/lib/posts';
import { PostCard } from '@/components/PostCard';
import { AdSlot } from '@/components/AdSlot';
import { site } from '@/lib/site';
import { LiveTime } from '@/components/LiveTime';

export default function HomePage() {
  const posts = getAllPosts();
  const categories = getCategories();
  const latest = posts[0];

  return (
    <>
      <section className="hero">
        <h1>{site.tagline}</h1>
        <p>{site.description}</p>
        {latest && (
          <p className="meta" style={{ marginTop: '0.75rem' }}>
            마지막 업데이트 <LiveTime iso={latest.date} /> · 총 {posts.length}건
          </p>
        )}
      </section>

      <AdSlot slot="top" />

      {posts.length === 0 ? (
        <div className="empty" style={{ marginTop: '2rem' }}>
          <p style={{ marginTop: 0 }}>아직 발행된 글이 없습니다.</p>
          <p style={{ marginBottom: 0 }}>
            <code>npm run run</code> 을 실행하면 지금 가장 화제인 AI 뉴스를 수집해 기사로
            발행합니다.
          </p>
        </div>
      ) : (
        <>
          <ul className="post-list">
            {posts.slice(0, 12).map((post, i) => (
              <PostCard key={post.slug} post={post} lead={i === 0} />
            ))}
          </ul>

          {posts.length > 12 && (
            <>
              <AdSlot slot="bottom" />
              <ul className="post-list">
                {posts.slice(12, 40).map((post) => (
                  <PostCard key={post.slug} post={post} />
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {categories.length > 0 && (
        <section style={{ margin: '3rem 0 1rem' }}>
          <h2 className="page-title" style={{ fontSize: '1.1rem' }}>
            분야별로 보기
          </h2>
          <div className="tag-row">
            {categories.map((c) => (
              <Link key={c.name} className="tag" href={`/category/${encodeURIComponent(c.name)}/`}>
                {c.name} ({c.count})
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
