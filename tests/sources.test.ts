import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceGroupOf, groupPosts, topBuzz, SOURCE_GROUPS } from '../src/lib/sources.js';
import type { PostMeta, PostSource } from '../src/lib/posts.js';

function post(slug: string, sources: PostSource[]): PostMeta {
  return {
    slug, title: slug, description: '', oneLiner: '', date: '2026-08-20T00:00:00.000Z',
    category: '뉴스', desk: '편집팀', tags: [], heat: 0, originUrl: '', originTitle: '',
    sources, readingMinutes: 1,
  };
}
const src = (origin: string, score = 0, comments = 0): PostSource => ({ origin, title: '', url: '', score, comments });

test('한 기사가 여러 판에 떠 있으면 희소한 쪽을 남긴다 — 해커뉴스는 거의 모든 기사에 붙어 있다', () => {
  assert.equal(sourceGroupOf(post('a', [src('Hacker News'), src('r/LocalLLaMA')])), 'reddit');
  assert.equal(sourceGroupOf(post('b', [src('Hacker News'), src('GeekNews')])), 'geeknews');
  assert.equal(sourceGroupOf(post('c', [src('Hacker News')])), 'hackernews');
});

test('커뮤니티에 안 뜬 기업 발표는 공식으로 간다', () => {
  assert.equal(sourceGroupOf(post('d', [src('Anthropic 뉴스')])), 'official');
  assert.equal(sourceGroupOf(post('e', [])), 'official');
});

test('상황판에 세우는 세 칸은 전부 커뮤니티다 — 공식 발표가 섞이면 "어디서 뜨나"라는 축이 무너진다', () => {
  assert.deepEqual(SOURCE_GROUPS.map((g) => g.key), ['hackernews', 'reddit', 'geeknews']);
});

test('어떤 기사도 분류에서 새지 않는다', () => {
  const posts = [
    post('a', [src('r/OpenAI')]), post('b', [src('GeekNews')]),
    post('c', [src('Hacker News')]), post('d', [src('TechCrunch AI')]),
  ];
  const g = groupPosts(posts);
  assert.equal(Object.values(g).flat().length, posts.length);
  assert.deepEqual(Object.values(g).flat().map((p) => p.slug).sort(), ['a', 'b', 'c', 'd']);
});

test('댓글에 3배 가중 — 업보트는 "봤다"지만 댓글은 "반응했다"다', () => {
  // 500점 0댓글(=500) 보다 100점 200댓글(=700) 이 더 뜨겁다
  const p = post('x', [src('r/A', 500, 0), src('r/B', 100, 200)]);
  assert.equal(topBuzz(p)?.origin, 'r/B');
});

test('수치가 하나도 없으면 null — 없는 걸 "새 소식" 같은 걸로 채우면 거짓말이 된다', () => {
  assert.equal(topBuzz(post('y', [src('Hacker News')])), null);
  assert.equal(topBuzz(post('z', [])), null);
});

/*
  화면이 "지켜보는 곳"이라고 말하는 목록은 실제 수집 대상과 같아야 한다.

  파이프라인에서 직접 가져오지 못하는 사정이 있어(webpack 이 `./feeds.js` 를 못 푼다)
  프론트에 다시 적어 두었다. 그러면 서브를 하나 추가하고 화면 쪽을 안 고치는 순간
  사이트가 독자에게 거짓말을 한다. 그 어긋남을 여기서 잡는다.
*/
test('레딧 칸이 말하는 감시 목록이 실제 수집 대상과 같다', async () => {
  const { REDDIT_SUBS } = await import('../pipeline/config.js');
  // aiOnly 로 거르면 안 된다. 그건 키워드 필터를 걸지 말지일 뿐, 수집 대상은
  // 목록 전체다. 실제로 r/singularity 는 aiOnly 가 아닌데도 기사 3건을 냈다 —
  // 처음에는 aiOnly 만 비교해서, 이 테스트가 어긋남을 잡는 대신 굳혀 놓고 있었다.
  const actual = REDDIT_SUBS.map((s) => `r/${s.name}`).sort();
  const shown = [...(SOURCE_GROUPS.find((g) => g.key === 'reddit')?.watching ?? [])].sort();
  assert.deepEqual(shown, actual,
    'pipeline/config.ts 의 REDDIT_SUBS 전체와 src/lib/sources.ts 의 watching 이 다르다');
});
