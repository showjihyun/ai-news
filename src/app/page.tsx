import Link from 'next/link';
import { getAllPosts, getCategories } from '@/lib/posts';
import { PostCard } from '@/components/PostCard';
import { AdSlot } from '@/components/AdSlot';
import { site } from '@/lib/site';
import { LiveTime } from '@/components/LiveTime';
import { OfficialStrip, SourceColumn } from '@/components/SourceBoard';
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
      {/* 한 줄로 줄였다. 설명 문단이 55px 을 먹고 그만큼 판을 접힘선 밖으로 밀어냈다.
          사이트가 뭘 하는 곳인지는 판 자체가 보여 준다 — 세 커뮤니티 이름이 그대로 떠 있으니.
          긴 소개는 메타 설명과 /소개 가 맡는다. */}
      <section className="hero hero-tight">
        <h1>지금 AI 판에서 가장 뜨거운 것</h1>
        <p className="meta hero-stamp">
          세 커뮤니티를 동시에 지켜봅니다
          {latest && (
            <>
              {' · 마지막 수집 '}
              <LiveTime iso={latest.date} />
            </>
          )}
          {` · 기사 ${posts.length}건`}
        </p>
      </section>

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
          {/* 세 판을 한 화면에 나란히. 이게 첫 화면의 본체다.
              Hacker News → Reddit → GeekNews 순 — 속보가 가장 먼저 뜨는 곳부터,
              국내 독자에게 바로 닿는 곳이 마지막이다. */}
          <div className="board">
            {SOURCE_GROUPS.map((g) => (
              <SourceColumn key={g.key} group={g.key} posts={grouped[g.key]} />
            ))}
          </div>

          <OfficialStrip posts={grouped.official} />

          {/* 광고를 판 아래로 내렸다. 상단에 두면 세 판이 접힘선 밑으로 밀려
              "한 화면에 다 보인다"는 이 페이지의 유일한 강점이 사라진다. */}
          <AdSlot slot="top" />

          <h2 className="page-title" style={{ fontSize: '1.1rem' }}>
            최신순 전체
          </h2>
          <ul className="post-list">
            {posts.slice(0, 40).map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </ul>

          <AdSlot slot="bottom" />
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
