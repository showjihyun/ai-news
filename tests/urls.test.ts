import { test } from 'node:test';
import assert from 'node:assert/strict';
import { postUrl } from '../src/lib/site.js';

/*
  한글 슬러그는 절대 주소에서 퍼센트 인코딩돼야 한다.

  안 하면 sitemap 과 RSS 에 원시 UTF-8 바이트가 그대로 들어간다. sitemap 규약은
  URL 인코딩을 요구하고, 브라우저는 알아서 인코딩해 주지만 크롤러와 피드 리더는
  그렇지 않을 수 있다. 그러면 기사 60개가 색인에서 통째로 빠진다.

  반대 방향의 사고도 있었다. 예전에 generateStaticParams 에서 인코딩했다가
  `%EB%85%BC%EC%9F%81` 같은 이름의 디렉터리가 생겨 카테고리·태그 페이지가 전부
  404 가 됐다. 인코딩은 **절대 주소를 만들 때만** 한다.
*/
test('한글 슬러그를 퍼센트 인코딩한다', () => {
  const url = postUrl('2026-08-29-ai-뉴스-총정리');
  assert.ok(!/[^\x00-\x7F]/.test(url), `주소에 원시 비ASCII 가 남았다: ${url}`);
  assert.match(url, /%EB%89%B4%EC%8A%A4/, '한글이 인코딩되지 않았다');
});

test('ASCII 슬러그는 그대로 둔다 — 불필요한 인코딩은 주소를 바꾼다', () => {
  assert.match(postUrl('2026-08-29-gpt-5-release'), /\/posts\/2026-08-29-gpt-5-release\/$/);
});

test('슬래시로 끝난다 — trailingSlash: true 와 맞아야 리다이렉트가 안 생긴다', () => {
  assert.ok(postUrl('abc').endsWith('/'));
});
