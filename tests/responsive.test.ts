import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { boardColumns, BOARD_BREAKPOINTS } from '../src/lib/board.js';

/*
  기기별로 판이 몇 칸이어야 하는가.

  폭만 보면 휴대폰과 노트북을 구분할 수 없다. 아이폰 16 프로맥스를 가로로 눕히면
  932px 인데, 이건 노트북 폭이 아니라 손에 든 전화기다. 그래서 폭·높이·포인터를
  같이 본다 — 손가락으로 만지는 기기가 납작하게 누웠으면 휴대폰이다.
*/
const DEVICES = [
  { name: '아이폰 세로',        width: 390,  height: 844,  coarse: true,  cols: 1 },
  { name: '갤럭시 세로',        width: 360,  height: 800,  coarse: true,  cols: 1 },
  { name: '폴더블 펼친 세로',   width: 673,  height: 841,  coarse: true,  cols: 1 },
  { name: '아이폰 가로',        width: 844,  height: 390,  coarse: true,  cols: 2 },
  // 좁고 납작한 구형 휴대폰. 폭만 보면 1칸 구간인데, CSS 에서는 휴대폰 가로 규칙이
  // 뒤에 와서 2칸이 이긴다. 모델이 1칸이라고 하면 화면과 어긋난다.
  { name: '아이폰 SE 가로',     width: 667,  height: 375,  coarse: true,  cols: 2 },
  { name: '아이폰 프로맥스 가로', width: 932, height: 430,  coarse: true,  cols: 2 },
  { name: '아이패드 세로',      width: 820,  height: 1180, coarse: true,  cols: 2 },
  { name: '아이패드 가로',      width: 1180, height: 820,  coarse: true,  cols: 3 },
  { name: '노트북',             width: 1366, height: 768,  coarse: false, cols: 3 },
  { name: '데스크톱',           width: 1920, height: 1080, coarse: false, cols: 3 },
  { name: '좁은 브라우저 창',   width: 900,  height: 900,  coarse: false, cols: 2 },
];

for (const d of DEVICES) {
  test(`${d.name} (${d.width}×${d.height}) → ${d.cols}칸`, () => {
    assert.equal(boardColumns(d), d.cols);
  });
}

test('휴대폰은 어떤 방향으로도 3칸이 되지 않는다', () => {
  const phones = DEVICES.filter((d) => d.name.includes('아이폰') || d.name.includes('갤럭시') || d.name.includes('폴더블'));
  for (const p of phones) {
    assert.notEqual(boardColumns(p), 3, `${p.name} 이 3칸으로 뜬다`);
    // 방향을 돌려도 마찬가지여야 한다
    assert.notEqual(boardColumns({ ...p, width: p.height, height: p.width }), 3, `${p.name} 을 돌리면 3칸이 된다`);
  }
});

/*
  위 판정은 TypeScript 에 있지만 실제로 화면을 나누는 건 CSS 다. 둘이 어긋나면
  테스트는 초록인데 화면은 틀린, 가장 나쁜 상태가 된다. 그래서 CSS 를 직접 읽어
  같은 숫자를 쓰고 있는지 확인한다.
*/
test('CSS 미디어쿼리가 같은 경계값을 쓴다', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8');
  const b = BOARD_BREAKPOINTS;
  // 정규식 대신 문자열 포함으로 본다. 템플릿 리터럴 안에서 괄호를 이스케이프하려다
  // 오히려 그룹으로 해석되는 함정이 있었다.
  const has = (q: string) => assert.ok(css.includes(q), `CSS 에 없다: ${q}`);
  has(`@media (max-width: ${b.threeColumnMin - 1}px)`);
  has(`@media (max-width: ${b.twoColumnMin - 1}px)`);
  has(`@media (pointer: coarse) and (max-height: ${b.phoneLandscapeMaxHeight}px)`);
});
