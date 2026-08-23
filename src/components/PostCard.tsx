import Link from 'next/link';
import type { PostMeta } from '@/lib/posts';
import { categoryColor } from '@/lib/site';
import { LiveTime, BreakingBadge } from './LiveTime';

export function PostCard({ post, lead = false }: { post: PostMeta; lead?: boolean }) {
  const color = categoryColor(post.category);

  return (
    <li
      className={`post-item${lead ? ' lead-item' : ''}`}
      style={{ ['--chip-color' as string]: color }}
    >
      <div className="post-rail" aria-hidden="true" />
      <div>
        <div className="meta-row">
          <span className="chip">{post.category}</span>
          <BreakingBadge iso={post.date} heat={post.heat} />
          <LiveTime iso={post.date} className="meta" />
          <span className="meta meta-sep">·</span>
          <span className="meta">{post.readingMinutes}분 읽기</span>
        </div>

        <h2>
          <Link href={`/posts/${post.slug}/`}>{post.title}</Link>
        </h2>

        <p className="summary">{post.oneLiner || post.description}</p>

        <div className="meta-row">
          <span className="meta">{post.desk}</span>
          {post.tags.slice(0, 3).map((tag) => (
            <Link key={tag} className="tag" href={`/tag/${encodeURIComponent(tag)}/`}>
              {tag}
            </Link>
          ))}
        </div>
      </div>
    </li>
  );
}
