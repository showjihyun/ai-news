import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardRanking, BOARD_LIMIT, foldBudget, stackedFoldBudget } from '../src/lib/board.js';
import type { PostMeta } from '../src/lib/posts.js';

function post(over: Partial<PostMeta> & { slug: string }): PostMeta {
  return {
    title: over.slug, description: '', oneLiner: '', date: '2026-08-20T00:00:00.000Z',
    category: '뉴스', desk: '편집팀', tags: [], heat: 0, originUrl: '', originTitle: '',
    sources: [], readingMinutes: 1, ...over,
  };
}

test('화제순으로 정렬한다 — 칸 제목이 "뜨는 곳"인데 1번이 최신 글이면 말이 안 맞는다', () => {
  const out = boardRanking([
    post({ slug: 'a', heat: 10 }),
    post({ slug: 'b', heat: 50 }),
    post({ slug: 'c', heat: 30 }),
  ]);
  assert.deepEqual(out.map((p) => p.slug), ['b', 'c', 'a']);
});

test('화제도가 같으면 최신 글이 앞선다', () => {
  const out = boardRanking([
    post({ slug: 'old', heat: 20, date: '2026-08-01T00:00:00.000Z' }),
    post({ slug: 'new', heat: 20, date: '2026-08-20T00:00:00.000Z' }),
  ]);
  assert.deepEqual(out.map((p) => p.slug), ['new', 'old']);
});

test('limit 을 넘겨 주지 않는다', () => {
  const many = Array.from({ length: 20 }, (_, i) => post({ slug: `p${i}`, heat: i }));
  assert.equal(boardRanking(many).length, BOARD_LIMIT);
  assert.equal(boardRanking(many, 3).length, 3);
});

test('입력 배열을 건드리지 않는다 — 같은 배열을 여러 칸이 나눠 쓴다', () => {
  const input = [post({ slug: 'a', heat: 1 }), post({ slug: 'b', heat: 9 })];
  const before = input.map((p) => p.slug);
  boardRanking(input);
  assert.deepEqual(input.map((p) => p.slug), before);
});

test('빈 칸도 터지지 않는다', () => {
  assert.deepEqual(boardRanking([]), []);
});

/*
  첫 화면 예산.

  이 사이트의 첫 화면이 하는 일은 "지금 뭐가 뜨는지"를 스크롤 없이 보여 주는 것이다.
  그래서 판의 최대 높이는 취향이 아니라 지켜야 할 수치다 — 노트북에서 가장 흔한
  1366×768 에서 판 아래끝이 접힘선을 넘으면 안 된다.

  높이 상수는 브라우저에서 실제로 잰 값이다(측정 방법은 board.ts 주석 참고).
  누가 limit 을 올리거나 여백을 키우면 이 테스트가 먼저 깨진다.
*/
test('가장 긴 칸이 1366×768 접힘선 안에 들어온다', () => {
  const b = foldBudget(768);
  assert.ok(b.boardBottom <= 768, `판 아래끝 ${b.boardBottom}px 가 접힘선 768px 을 넘는다`);
});

test('1280×720 노트북에서도 들어온다', () => {
  const b = foldBudget(720);
  assert.ok(b.boardBottom <= 720, `판 아래끝 ${b.boardBottom}px 가 접힘선 720px 을 넘는다`);
});

test('BOARD_LIMIT 은 취향이 아니라 제약이다 — 하나만 더 넣어도 720 에서 넘친다', () => {
  assert.equal(foldBudget(720, BOARD_LIMIT).fits, true);
  assert.equal(foldBudget(720, BOARD_LIMIT + 1).fits, false);
});

test('칸이 다 차면 접힘선 위에 제목 18개', () => {
  assert.equal(foldBudget(768).headlines, 18);
});

/*
  휴대폰.

  세 칸이 세로로 쌓이므로 데스크톱처럼 다 담을 수는 없다. 대신 지켜야 할 최소선이
  있다 — **세 소스 이름이 다 보여야 한다**. 하나라도 접힘선 밑에 있으면 독자는
  이 사이트가 한 군데만 본다고 오해한다. 세 곳을 동시에 본다는 게 이 사이트의 값이다.
*/
test('휴대폰 390×844 에서 세 소스가 모두 접힘선 위에 있다', () => {
  const b = stackedFoldBudget(844);
  assert.equal(b.sourcesVisible, 3, `소스 ${b.sourcesVisible}개만 보인다`);
});

test('작은 휴대폰 375×667 에서도 최소 두 소스는 보인다', () => {
  assert.ok(stackedFoldBudget(667).sourcesVisible >= 2);
});
