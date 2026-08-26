import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/*
  날조는 한 건도 내보내지 않는다.

  이 사이트는 광고로 먹고사는 뉴스 사이트라, 없는 숫자를 지어낸 기사가 한 건이라도
  발각되면 사이트 전체를 의심하게 만든다. 점수가 낮은 기사와는 성격이 다르다 —
  그건 읽다 말면 그만이지만 날조는 신뢰를 통째로 깎는다.

  이 파일은 콘텐츠를 내리는 함수를 다룬다. 그래서 소스에 그런 글자가 있는지가 아니라
  **실제로 무슨 일이 벌어지는지**를 본다. 임시 디렉터리에 진짜 파일을 만들고,
  함수를 돌리고, 어느 파일이 어디로 갔는지 확인한다.
  (이전 판은 소스 문자열만 검사해서, 정작 격리 호출을 지워도 초록이었다.)

  주의: 파이프라인 모듈들은 process.cwd() 를 모듈 상수로 굳힌다. 그래서 디렉터리는
  파일 전체에서 하나만 쓰고, 테스트마다 슬러그를 다르게 해서 서로 안 섞이게 한다.
  픽스처도 파일을 직접 쓰지 않고 모듈 자신의 API 로 만든다 — state.ts 는 메모리에
  캐시를 들고 있어서, 파일만 갈아치우면 캐시가 옛것을 그대로 들고 있다.
*/

const ORIGINAL_CWD = process.cwd();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quarantine-'));

let q: typeof import('../pipeline/quarantine.js');
let t: typeof import('../pipeline/takedown.js');
let state: typeof import('../pipeline/state.js');
let reviews: typeof import('../pipeline/reviews.js');

before(async () => {
  fs.mkdirSync(path.join(dir, 'content/posts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  process.chdir(dir);
  q = await import('../pipeline/quarantine.js');
  t = await import('../pipeline/takedown.js');
  state = await import('../pipeline/state.js');
  reviews = await import('../pipeline/reviews.js');
});
after(() => process.chdir(ORIGINAL_CWD));

/** 기사 하나를 발행된 상태로 만든다. 파일 + 평가 기록 + 발행 기록. */
function publish(slug: string, unsupported: string[] = [], body = '# 본문') {
  fs.writeFileSync(path.join(dir, 'content/posts', `${slug}.md`), body, 'utf8');
  reviews.saveReview({
    slug, title: slug, category: '뉴스', desk: '편집팀',
    publishedAt: '2026-08-26T00:00:00.000Z', reviewedAt: '2026-08-26T01:00:00.000Z',
    scores: { clarity: 5 }, overall: 4.2, notes: {},
    fix: '수치는 자료에 있는 것만 쓸 것',
    unsupported, unverifiable: [], evidenceExact: true,
  });
  state.markPublished({
    slug, title: slug, urls: [`https://example.com/${slug}`],
    publishedAt: '2026-08-26T00:00:00.000Z',
  });
}

const posts = (slug: string) => path.join(dir, 'content/posts', `${slug}.md`);
const quarantined = (slug: string) => path.join(dir, 'content/quarantine', `${slug}.md`);

test('날조가 있고 개정을 시도한 기사는 내려간다', () => {
  publish('a-guilty', ['삼성 300조 투자 — 자료에 없음']);

  const res = q.quarantineFabrications(['a-guilty']);

  assert.deepEqual(res.moved, ['a-guilty']);
  assert.equal(fs.existsSync(posts('a-guilty')), false, '발행 목록에 남아 있다');
  assert.equal(fs.existsSync(quarantined('a-guilty')), true, '격리함에 없다');
});

test('날조가 없는 기사는 건드리지 않는다', () => {
  publish('b-clean');
  publish('b-guilty', ['없는 수치']);

  q.quarantineFabrications(['b-clean', 'b-guilty']);

  assert.equal(fs.existsSync(posts('b-clean')), true, '멀쩡한 기사를 내렸다');
  assert.equal(fs.existsSync(posts('b-guilty')), false);
});

/*
  이 파일에서 가장 중요한 테스트다.

  예전 판은 기록 전체를 훑어서 내렸다. 그러면 레이트리밋이나 네트워크 오류로
  개정을 아예 못 해 본 기사까지 같이 내려갔고, 한도가 풀린 뒤 다시 돌려도
  이미 내려간 뒤라 일시적인 장애가 영구 삭제로 굳었다.
*/
test('개정을 시도하지 못한 기사는 날조가 있어도 보류한다 — 일시적 장애가 영구 삭제가 되면 안 된다', () => {
  publish('c-tried', ['없는 수치']);
  publish('c-never-tried', ['없는 수치']);

  const res = q.quarantineFabrications(['c-tried']);   // 한도에 걸려 두 번째는 손도 못 댐

  assert.ok(res.moved.includes('c-tried'));
  assert.ok(res.deferred.includes('c-never-tried'));
  assert.equal(fs.existsSync(posts('c-never-tried')), true,
    '시도하지 않은 기사를 내렸다 — 한도가 풀려도 되살릴 수 없다');
});

test('지우지 않고 옮긴다 — 평가가 틀렸을 때 되돌릴 수 있어야 한다', () => {
  publish('d-guilty', ['없는 수치']);
  q.quarantineFabrications(['d-guilty']);

  t.restoreQuarantined('d-guilty');

  assert.equal(fs.existsSync(posts('d-guilty')), true, '되돌리지 못했다');
  const rec = reviews.loadReviews().find((r) => r.slug === 'd-guilty');
  assert.equal(rec?.quarantinedAt, undefined, '되돌렸는데 격리 표시가 남아 있다');
});

test('평가 기록은 지우지 않고 표시만 한다 — 지우면 집필기가 배울 사례가 사라지고 평균이 저절로 오른다', () => {
  publish('e-guilty', ['없는 수치']);

  q.quarantineFabrications(['e-guilty']);

  const rec = reviews.loadReviews().find((r) => r.slug === 'e-guilty');
  assert.ok(rec, '기록을 지웠다');
  assert.ok(rec.quarantinedAt, '격리 표시가 없다');
  assert.deepEqual(rec.unsupported, ['없는 수치'], '무엇을 지어냈는지가 사라졌다');
  assert.equal(reviews.livingReviews().some((r) => r.slug === 'e-guilty'), false,
    '살아 있는 기사 목록에 격리된 것이 섞였다');
});

test('발행 기록에서도 뺀다 — 안 빼면 중복 방지가 그 주제를 90일간 막는다', () => {
  publish('f-guilty', ['없는 수치']);
  assert.ok(state.isAlreadyPublished(['https://example.com/f-guilty'], 'f-guilty'));

  q.quarantineFabrications(['f-guilty']);

  assert.equal(state.isAlreadyPublished(['https://example.com/f-guilty'], 'f-guilty'), null,
    '발행 기록에 남아 있어 같은 주제를 다시 쓸 수 없다');
});

test('내려간 기사를 가리키던 링크를 푼다 — 정적 사이트에서는 그대로 404 다', () => {
  publish('g-guilty', ['없는 수치']);
  publish('g-other', [], '앞서 [그 기사](/posts/g-guilty/)에서 다뤘다.');

  const res = q.quarantineFabrications(['g-guilty']);
  t.rebuildAfterTakedown(res.moved);

  const other = fs.readFileSync(posts('g-other'), 'utf8');
  assert.equal(other.includes('/posts/g-guilty/'), false, '죽은 링크가 남았다');
  assert.ok(other.includes('그 기사'), '링크만 벗기고 글자는 남겨야 한다');
});

test('옛 기록에 unsupported 가 없어도 죽지 않는다', () => {
  publish('h-legacy');
  const store = JSON.parse(fs.readFileSync(path.join(dir, 'data/reviews.json'), 'utf8'));
  for (const r of store.reviews) if (r.slug === 'h-legacy') delete r.unsupported;
  fs.writeFileSync(path.join(dir, 'data/reviews.json'), JSON.stringify(store), 'utf8');

  assert.doesNotThrow(() => q.quarantineFabrications(['h-legacy']));
  assert.equal(fs.existsSync(posts('h-legacy')), true, '날조가 없는데 내렸다');
});
