import Link from 'next/link';
import type { PostMeta } from '@/lib/posts';
import { groupMeta, OFFICIAL_GROUP, topBuzz, type SourceGroup } from '@/lib/sources';
import { BOARD_LIMIT, boardRanking } from '@/lib/board';
import { LiveTime } from './LiveTime';

/**
 * 소스 상황판.
 *
 * 이 사이트가 파는 것은 "어디서 지금 뭐가 뜨는가"다. 그래서 홈은 잡지 그리드가 아니라
 * 전광판에 가깝다 — 세 판(공식·매체 / Reddit / GeekNews)을 한 화면에 나란히 놓고,
 * 각 판에서 가장 뜨거운 것부터 순위와 함께 보여 준다.
 *
 * 이미지를 쓰지 않는다. 원문 사이트의 og:image 를 끌어오는 게 흔한 방법이지만,
 * 광고로 수익을 내는 사이트에서 남의 이미지를 핫링크하는 건 저작권 문제가 된다.
 * 대신 이 사이트가 실제로 가진 재료 — 순위·댓글 수 — 를 시각 요소로 쓴다.
 * 큰 순위 숫자가 이미지가 했을 시각적 무게를 대신한다.
 */

/**
 * 커뮤니티 반응을 한 조각으로.
 *
 * 처음엔 로그 척도 막대를 그렸는데, 5점부터 500점까지가 전부 비슷한 길이로 눌려서
 * 정보가 되지 못하고 구분선처럼 보였다. 숫자 자체가 더 정확하고 더 자극적이다 —
 * "댓글 510" 은 막대 하나보다 훨씬 강하게 클릭을 부른다.
 */
function Buzz({ post }: { post: PostMeta }) {
  const buzz = topBuzz(post);
  // 수치가 없으면 아무것도 쓰지 않는다. 초기 기사에는 점수를 저장하지 않았는데,
  // 여기에 '새 소식' 같은 걸 채우면 3일 지난 글에 새것 딱지가 붙어 거짓말이 된다.
  if (!buzz) return null;

  return (
    <span className="buzz">
      {buzz.comments > 0 ? (
        <>
          댓글 <b>{buzz.comments.toLocaleString()}</b>
        </>
      ) : (
        <>
          점수 <b>{buzz.score.toLocaleString()}</b>
        </>
      )}
    </span>
  );
}

function LeadItem({ post }: { post: PostMeta }) {
  return (
    <li className="board-lead">
      <span className="board-rank">1</span>
      <h3>
        <Link href={`/posts/${post.slug}/`}>{post.title}</Link>
      </h3>
      <p>{post.oneLiner || post.description}</p>
      <div className="board-foot">
        <Buzz post={post} />
        <LiveTime iso={post.date} className="board-when" />
      </div>
    </li>
  );
}

/*
  2위 아래 항목.

  수치를 제목 아래 별도 줄로 두었더니 한 건이 88px 이었다. 그 줄 하나 때문에
  칸마다 두 건씩 접힘선 밖으로 밀려났다. 제목 끝에 붙이니 58px 이 된다 —
  같은 화면에 제목이 두 개 더 들어온다. 시각을 뺀 것도 같은 이유다.
  여기서 알고 싶은 건 "얼마나 시끄러운가"이지 "언제 올라왔나"가 아니다.
*/
function RestItem({ post, rank }: { post: PostMeta; rank: number }) {
  return (
    <li className="board-rest">
      <span className="board-rank board-rank-sm">{rank}</span>
      <p>
        <Link href={`/posts/${post.slug}/`}>{post.title}</Link>
        <Buzz post={post} />
      </p>
    </li>
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
  const [lead, ...rest] = boardRanking(posts, limit);

  return (
    <section className="board-col" style={{ ['--src' as string]: meta.color }}>
      <header className="board-head">
        <h2>{meta.name}</h2>
        <p>{meta.tagline}</p>
      </header>

      {lead ? (
        <ol className="board-list">
          <LeadItem post={lead} />
          {rest.map((p, i) => (
            <RestItem key={p.slug} post={p} rank={i + 2} />
          ))}
        </ol>
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
