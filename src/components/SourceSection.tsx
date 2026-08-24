import Link from 'next/link';
import type { PostMeta } from '@/lib/posts';
import { categoryColor } from '@/lib/site';
import { groupMeta, topBuzz, type SourceGroup } from '@/lib/sources';
import { LiveTime, BreakingBadge } from './LiveTime';

/**
 * 소스별 카드 섹션.
 *
 * 기본 목록(post-item)은 시간순 한 줄 세우기라 "어디서 온 이야기인가"가 안 보인다.
 * 독자가 고르는 기준이 하나 더 있는데 — 개발자 판의 반응이 궁금한 사람과 국내에서
 * 뭐가 회자되는지 궁금한 사람은 서로 다른 글을 찾는다 — 그걸 드러내려고 만들었다.
 *
 * 카드에 반응 수치(점수·댓글)를 같이 보여 주는 이유: "이게 왜 여기 있는지"의 근거다.
 * Reddit 섹션에서 댓글 87개가 붙어 있으면 그 자체가 클릭할 이유가 된다.
 */
function BuzzBadge({ post }: { post: PostMeta }) {
  const buzz = topBuzz(post);
  if (!buzz) return null;

  return (
    <span className="buzz" title={`${buzz.origin} 기준`}>
      {buzz.comments > 0 && <span className="buzz-n">댓글 {buzz.comments}</span>}
      {buzz.score > 0 && <span className="buzz-n">{buzz.score}점</span>}
    </span>
  );
}

function SourceCard({ post }: { post: PostMeta }) {
  return (
    <li className="src-card" style={{ ['--chip-color' as string]: categoryColor(post.category) }}>
      <div className="meta-row">
        <span className="chip">{post.category}</span>
        <BreakingBadge iso={post.date} heat={post.heat} />
        <LiveTime iso={post.date} className="meta" />
      </div>

      <h3>
        <Link href={`/posts/${post.slug}/`}>{post.title}</Link>
      </h3>

      <p className="src-card-summary">{post.oneLiner || post.description}</p>

      <div className="meta-row src-card-foot">
        <BuzzBadge post={post} />
        <span className="meta">{post.readingMinutes}분</span>
      </div>
    </li>
  );
}

export function SourceSection({
  group,
  posts,
  limit = 3,
}: {
  group: SourceGroup;
  posts: PostMeta[];
  limit?: number;
}) {
  if (posts.length === 0) return null;
  const meta = groupMeta(group);

  return (
    <section className="src-section" style={{ ['--src-color' as string]: meta.color }}>
      <div className="src-head">
        <h2>
          <span className="src-dot" aria-hidden="true" />
          {meta.name}
        </h2>
        <p>{meta.tagline}</p>
      </div>

      <ul className="src-grid">
        {posts.slice(0, limit).map((p) => (
          <SourceCard key={p.slug} post={p} />
        ))}
      </ul>
    </section>
  );
}
