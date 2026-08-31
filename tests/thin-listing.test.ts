import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCategories, getTags, isThinListing, MIN_LISTING_POSTS } from '../src/lib/posts.js';
import sitemap from '../src/app/sitemap.js';
import { site } from '../src/lib/site.js';

/*
  기사 한두 건짜리 태그 페이지는 광고도 색인도 받지 않는다.

  한때 태그 253개 중 204개가 기사 1건짜리였는데, 그 페이지들이 전부 사이트맵에 들어가고
  위아래로 광고를 달고 있었다. 색인 대상 341개 중 3/4 이 "링크 하나 + 광고 둘" 이었던
  셈이다. 애드센스가 금지하는 형태이고, 심사 거절 사유 1위인 '가치 없는 콘텐츠' 다.

  30분마다 새 기사가 붙으면서 태그도 계속 늘어난다. 사람이 눈으로 잡을 수 있는 종류의
  회귀가 아니라서 여기서 잠근다.
*/

test('사이트맵의 목록 페이지는 모두 기준치를 넘는다', () => {
  const urls = new Set(sitemap().map((e) => e.url));

  for (const c of getCategories()) {
    const url = `${site.url}/category/${encodeURIComponent(c.name)}/`;
    assert.equal(
      urls.has(url),
      !isThinListing(c.count),
      `카테고리 '${c.name}'(${c.count}건) 의 사이트맵 포함 여부가 기준과 다르다`,
    );
  }

  for (const t of getTags()) {
    const url = `${site.url}/tag/${encodeURIComponent(t.name)}/`;
    assert.equal(
      urls.has(url),
      !isThinListing(t.count),
      `태그 '${t.name}'(${t.count}건) 의 사이트맵 포함 여부가 기준과 다르다`,
    );
  }
});

test('기준치를 1 로 낮추면 안 된다 — 그러면 원래 문제로 돌아간다', () => {
  assert.ok(MIN_LISTING_POSTS >= 2, `MIN_LISTING_POSTS 가 ${MIN_LISTING_POSTS} 다`);
  assert.equal(isThinListing(1), true);
  assert.equal(isThinListing(MIN_LISTING_POSTS), false);
});
