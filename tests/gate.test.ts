import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyBeforePublish } from '../pipeline/gate.js';
import type { Review } from '../pipeline/reviews.js';

/*
  발행 전 게이트.

  이 사이트는 광고로 먹고사는 뉴스 사이트라, 없는 숫자를 지어낸 기사가 한 건이라도
  발각되면 사이트 전체를 의심하게 만든다.

  오랫동안 순서가 반대였다 — 발행하고 나서 평가하고, 문제가 있으면 고치고, 못 고치면
  내렸다. 그 순서에는 구조적인 구멍이 있어서, 고치는 데 실패하거나 그 단계가 시간
  제한에 걸리면 날조가 그대로 남았다. 실제로 라이브에 4건이 있었고 넷 다 개정 0회였다.
  그중 하나는 제목에 "13조 원"이라고 썼는데 원문은 129억 달러(약 18조 원)였다.

  이제 게이트가 발행 자체를 막는다. 그 약속을 여기서 지킨다.
*/

const cluster = {
  key: 'k', title: 'T', primaryUrl: 'https://example.com/a', heat: 20,
  origins: ['Hacker News'], items: [], createdAt: '2026-08-29T00:00:00.000Z',
  lastActivityAt: '2026-08-29T00:00:00.000Z', lang: 'en' as const,
} as never;

const draft = {
  title: '제목', description: '설명', oneLiner: '한 줄', tags: ['t'],
  body: '본문', category: '뉴스', desk: '편집팀', angle: '각도',
} as never;

const evidence = { articleText: '원문', reactions: [] };

function review(over: Partial<Review> = {}): Review {
  return {
    slug: 's', title: '제목', category: '뉴스', desk: '편집팀',
    publishedAt: '2026-08-29T00:00:00.000Z', reviewedAt: '2026-08-29T00:00:00.000Z',
    scores: { clarity: 5 }, overall: 4.6, notes: {}, fix: '',
    unsupported: [], unverifiable: [], evidenceExact: true, ...over,
  };
}

const noRevise = async () => { throw new Error('개정을 부르면 안 되는 경우다'); };

test('날조가 없으면 통과한다', async () => {
  const res = await verifyBeforePublish(cluster, draft, evidence, 3, {
    judge: async () => review(),
    revise: noRevise as never,
  });
  assert.equal(res.ok, true);
});

test('점수만 낮은 건 막지 않는다 — 낮은 점수와 날조는 다르게 다룬다', async () => {
  const res = await verifyBeforePublish(cluster, draft, evidence, 3, {
    judge: async () => review({ overall: 3.2 }),
    revise: noRevise as never,
  });
  assert.equal(res.ok, true, '점수가 낮다고 발행을 막으면 기사가 거의 안 나온다');
});

test('끝내 못 고친 날조는 발행을 막는다', async () => {
  let calls = 0;
  const res = await verifyBeforePublish(cluster, draft, evidence, 3, {
    judge: async () => { calls++; return review({ unsupported: ['없는 수치'] }); },
    revise: async () => ({ title: 'T2', description: 'D', oneLiner: 'O', tags: [], body: 'B', changelog: '' }) as never,
  });
  assert.equal(res.ok, false, '날조가 남았는데 발행을 허용했다');
  assert.ok(calls > 1, '한 번도 다시 심사하지 않았다');
});

test('고쳐지면 통과한다', async () => {
  let n = 0;
  const res = await verifyBeforePublish(cluster, draft, evidence, 3, {
    judge: async () => (++n === 1 ? review({ unsupported: ['없는 수치'] }) : review()),
    revise: async () => ({ title: '고친 제목', description: 'D', oneLiner: 'O', tags: [], body: '고친 본문', changelog: '' }) as never,
  });
  assert.equal(res.ok, true);
  assert.equal(res.draft.title, '고친 제목', '고친 원고가 아니라 원본을 발행하려 한다');
});

/*
  개정은 점수를 올리려다 새 주장을 지어내는 일이 있다. 점수만 보고 고르면
  "4.6점인데 없는 수치가 둘"인 판을 채택하게 된다.
*/
test('수정본이 날조를 늘리면 되돌린다 — 여기서 지키는 건 점수가 아니라 사실이다', async () => {
  let n = 0;
  const res = await verifyBeforePublish(cluster, draft, evidence, 3, {
    judge: async () => {
      n++;
      if (n === 1) return review({ overall: 3.0, unsupported: ['하나'] });
      return review({ overall: 4.8, unsupported: ['하나', '둘'] });   // 점수는 올랐지만 날조가 늘었다
    },
    revise: async () => ({ title: '점수만 높은 판', description: 'D', oneLiner: 'O', tags: [], body: 'B', changelog: '' }) as never,
  });
  assert.equal(res.ok, false);
  assert.equal(res.review.unsupported.length, 1, '날조가 늘어난 판을 채택했다');
  assert.notEqual(res.draft.title, '점수만 높은 판', '되돌리지 않았다');
});

test('시도 횟수를 지킨다 — 무한히 고치려 들면 실행이 시간 제한에 걸린다', async () => {
  let revises = 0;
  await verifyBeforePublish(cluster, draft, evidence, 2, {
    judge: async () => review({ unsupported: ['없는 수치'] }),
    revise: async () => { revises++; return { title: 'T', description: 'D', oneLiner: 'O', tags: [], body: 'B', changelog: '' } as never; },
  });
  assert.equal(revises, 2, `${revises}회 시도했다 (한도 2)`);
});
