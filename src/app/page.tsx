import Link from 'next/link';
import { getAllPosts, getCategories } from '@/lib/posts';
import { PostCard } from '@/components/PostCard';
import { AdSlot } from '@/components/AdSlot';
import { site } from '@/lib/site';
import { LiveTime } from '@/components/LiveTime';
import { SourceSection } from '@/components/SourceSection';
import { groupPosts, SOURCE_GROUPS } from '@/lib/sources';

export default function HomePage() {
  const posts = getAllPosts();
  const categories = getCategories();
  const latest = posts[0];

  // 소스별 묶음은 일간 브리핑을 뺀다. 브리핑은 그날 발행분을 재조합한 것이라
  // 출처가 없고, 섞이면 "어디서 온 이야기인가"라는 축 자체가 흐려진다.
  const grouped = groupPosts(posts.filter((p) => p.category !== '데일리'));

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
            {posts.slice(0, 6).map((post, i) => (
              <PostCard key={post.slug} post={post} lead={i === 0} />
            ))}
          </ul>

          {/* 어디서 온 이야기인지로 한 번 더 묶어 준다.
              공식·매체 → Reddit → GeekNews 순. 앞의 두 개는 속보가 먼저 뜨는 곳이고
              GeekNews 는 국내 독자에게 바로 닿는 곳이라 마지막에 둔다. */}
          {SOURCE_GROUPS.map((g) => (
            <SourceSection key={g.key} group={g.key} posts={grouped[g.key]} />
          ))}

          {posts.length > 6 && (
            <>
              <AdSlot slot="bottom" />
              <h2 className="page-title" style={{ fontSize: '1.1rem' }}>
                전체 기사
              </h2>
              <ul className="post-list">
                {posts.slice(6, 40).map((post) => (
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
