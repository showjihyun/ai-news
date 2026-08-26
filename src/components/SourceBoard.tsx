import Link from 'next/link';
import type { PostMeta } from '@/lib/posts';
import { groupMeta, OFFICIAL_GROUP, topBuzz, type SourceGroup } from '@/lib/sources';
import { BOARD_LIMIT, boardRanking } from '@/lib/board';
import { LiveTime } from './LiveTime';

/**
 * 소스 상황판.
 *
 * 이 사이트가 파는 것은 "어디서 지금 뭐가 뜨는가"다. 그래서 홈은 잡지 그리드가 아니라
 * 전광판에 가깝다 — 세 판(Hacker News / Reddit / GeekNews)을 한 화면에 나란히 놓고
 * 각 판에서 가장 뜨거운 것부터 보여 준다.
 *
 * 이미지를 쓰지 않는다. 원문 사이트의 og:image 를 끌어오는 게 흔한 방법이지만,
 * 광고로 수익을 내는 사이트에서 남의 이미지를 핫링크하는 건 저작권 문제가 된다.
 * 대신 이 사이트가 실제로 가진 재료 — 댓글 수와 점수 — 를 시각 요소로 쓴다.
 */

/**
 * 반응 수치를 큰 자리에.
 *
 * 예전에는 이 자리가 순위 숫자였다. 2.7rem 짜리 '1' 이 이미지의 시각적 무게를
 * 대신했는데, 순서는 위치가 이미 말하고 있어서 화면에서 가장 큰 요소가 가장 적은
 * 정보를 나르는 상태였다. 같은 자리에 반응 수치를 넣으면 크기가 곧 뜨거움이 된다.
 *
 * 덤으로 하나 고쳐진다. 예전에는 수치를 제목 문단 끝에 붙였는데, 제목이 두 줄을
 * 다 채우면 클램프에 잘려 "댓글 510" 이 통째로 사라졌다. 이 사이트가 가진 가장 강한
 * 재료가 제목 길이에 따라 있다 없다 했다.
 *
 * 수치가 없으면 '—' 를 쓰되 작고 흐리게 물린다. 자리를 비우면 제목 시작점이 어긋나
 * 목록이 흔들리고, 그렇다고 '새 소식' 같은 걸 채우면 3일 지난 글에 새것 딱지가 붙어
 * 거짓말이 된다. 크기를 그대로 두는 것도 안 된다 — 화면에서 가장 큰 자리가
 * "아무 수치도 없음"을 외치게 되어, 이 배치를 만든 이유가 무너진다.
 */
function Heat({ post, size = 'lead' }: { post: PostMeta; size?: 'lead' | 'second' }) {
  const buzz = topBuzz(post);
  const value = !buzz ? '—' : (buzz.comments > 0 ? buzz.comments : buzz.score).toLocaleString();
  const label = !buzz ? '집계 전' : buzz.comments > 0 ? '댓글' : '점수';

  return (
    <span className={`heat heat-${size}${buzz ? '' : ' heat-none'}`}>
      <b>{value}</b>
      <i>{label}</i>
    </span>
  );
}

function LeadItem({ post }: { post: PostMeta }) {
  return (
    <li className="board-lead">
      <Heat post={post} />
      <div className="board-body">
        <h3>
          <Link href={`/posts/${post.slug}/`}>{post.title}</Link>
        </h3>
        <p>{post.oneLiner || post.description}</p>
        <LiveTime iso={post.date} className="board-when" />
      </div>
    </li>
  );
}

/**
 * 2위 항목.
 *
 * 1위(139px)와 3위 아래(60px) 사이에 중간이 없어서 목록이 각주처럼 읽히고
 * 클릭이 1위로만 몰렸다. 2위에만 요약 한 줄을 주어 세 단계로 만든다.
 */
function SecondItem({ post }: { post: PostMeta }) {
  return (
    <li className="board-second">
      <Heat post={post} size="second" />
      <div className="board-body">
        <h4>
          <Link href={`/posts/${post.slug}/`}>{post.title}</Link>
        </h4>
        <p>{post.oneLiner || post.description}</p>
      </div>
    </li>
  );
}

/** 3위 아래. 수치를 왼쪽 열에 세워 제목과 자리를 다투지 않게 한다. */
function RestItem({ post }: { post: PostMeta }) {
  const buzz = topBuzz(post);
  return (
    <li className="board-rest">
      <span className="board-count">
        {buzz ? (buzz.comments > 0 ? buzz.comments : buzz.score).toLocaleString() : '—'}
      </span>
      <p>
        <Link href={`/posts/${post.slug}/`}>{post.title}</Link>
      </p>
    </li>
  );
}

/**
 * 짧은 칸의 마감.
 *
 * 칸마다 글 수가 달라서 오른쪽 두 칸이 먼저 끝나고 L자 공백이 남았다(실측 241px).
 * 데이터가 적은 게 원인이지만, 아무 말 없이 비워 두면 그게 그냥 구멍으로 읽힌다.
 * "여기까지가 오늘 전부"라고 말해 주면 같은 여백이 정보가 된다.
 *
 * 글이 넉넉한 칸에는 붙이지 않는다 — 할 말이 없는데 자리를 채우는 꼴이 된다.
 */
const SPARSE_AT = 4;

function ColumnNote({ group, count }: { group: SourceGroup; count: number }) {
  const meta = groupMeta(group);
  if (count >= SPARSE_AT || !meta.note) return null;

  return (
    <div className="board-note">
      {meta.watching && meta.watching.length > 0 && (
        <>
          <p className="board-note-label">지금 지켜보는 곳</p>
          <div className="board-chips">
            {meta.watching.map((name) => (
              <span key={name} className="board-chip">
                {name}
              </span>
            ))}
          </div>
        </>
      )}
      <p className="board-note-text">{meta.note}</p>
    </div>
  );
}

export function SourceColumn({
  group,
  posts,
  limit = BOARD_LIMIT,
}: {
  group: SourceGroup;
  posts: PostMeta[];
  limit?: number;
}) {
  const meta = groupMeta(group);
  const [lead, second, ...rest] = boardRanking(posts, limit);

  return (
    <section className="board-col" style={{ ['--src' as string]: meta.color }}>
      <header className="board-head">
        <h2>{meta.name}</h2>
        <span className="board-tally">{posts.length}건</span>
      </header>

      {lead ? (
        <>
          <ol className="board-list">
            <LeadItem post={lead} />
            {second && <SecondItem post={second} />}
            {rest.map((p) => (
              <RestItem key={p.slug} post={p} />
            ))}
          </ol>
          <ColumnNote group={group} count={posts.length} />
        </>
      ) : (
        <p className="board-empty">아직 이 판에서 건진 소식이 없습니다.</p>
      )}
    </section>
  );
}

/**
 * 공식 발표 줄.
 *
 * 상황판 세 칸과 같은 무게로 세우면 "어디서 뜨고 있나"라는 축이 흐려지지만,
 * 기업이 직접 낸 소식은 가장 빠른 정보라 빼 버릴 수도 없다. 그래서 한 줄로 눕힌다 —
 * 세로 길이는 거의 안 먹으면서 제목은 그대로 노출된다.
 */
export function OfficialStrip({ posts, limit = 3 }: { posts: PostMeta[]; limit?: number }) {
  if (posts.length === 0) return null;

  return (
    <section className="strip" style={{ ['--src' as string]: OFFICIAL_GROUP.color }}>
      <h2>{OFFICIAL_GROUP.name}</h2>
      <ul>
        {boardRanking(posts, limit).map((p) => (
          <li key={p.slug}>
            <Link href={`/posts/${p.slug}/`}>{p.title}</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
