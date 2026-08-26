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

/*
  휴대폰 가로 규칙이 폭 규칙을 이기려면 소스에서 뒤에 와야 한다.

  둘 다 `.board` 를 겨냥해 특정도가 같으므로(0,1,0), 겹칠 때는 나중에 선언된 쪽이
  이긴다. 아이폰 SE 가로(667×375)가 정확히 겹치는 경우다 — 폭 규칙은 1칸,
  휴대폰 가로 규칙은 2칸이라 순서가 뒤집히면 화면이 boardColumns() 와 어긋난다.

  이 순서는 브라우저로 확인하지 못했다. CDP 의 pointer 미디어 에뮬레이션이 이 크롬
  빌드에서 동작하지 않아 실기기에서만 발동한다. 그래서 소스 순서로 지킨다.
*/
test('휴대폰 가로 규칙이 폭 규칙보다 뒤에 온다 — 특정도가 같아 순서로 이긴다', () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8');
  /*
    여는 중괄호까지 포함해 찾는다.

    압축 규칙을 두 경우가 공유하도록 `@media (max-width: 760px), (pointer: coarse) ...`
    블록을 만들었더니, 접두사가 같아서 indexOf 가 그쪽을 먼저 잡았다. 그 블록에는
    칸 수 선언이 없어서, 진짜 1칸 블록이 뒤로 밀려도 이 검사가 통과해 버린다 —
    잡으라고 만든 회귀를 그대로 놓친다.
  */
  const oneCol = css.indexOf(`@media (max-width: ${BOARD_BREAKPOINTS.twoColumnMin - 1}px) {`);
  const coarse = css.indexOf('@media (pointer: coarse) and (max-height:');
  assert.ok(oneCol > 0, '1칸 규칙을 찾지 못했다');
  assert.ok(coarse > 0, '휴대폰 가로 규칙을 찾지 못했다');
  /*
    그 블록 **안에** 1칸 선언이 있는지 본다.

    앞서는 블록 끝이 아니라 다음 블록 시작까지 잘라서 봤는데, 그러면 사이에 낀
    엉뚱한 규칙이 조건을 채워 줘도 통과한다. 여는 중괄호부터 짝이 맞는 닫는
    중괄호까지만 잘라야 한다.
  */
  const open = css.indexOf('{', oneCol);
  let depth = 0;
  let close = open;
  for (; close < css.length; close++) {
    if (css[close] === '{') depth++;
    else if (css[close] === '}' && --depth === 0) break;
  }
  assert.ok(
    css.slice(open, close).includes('grid-template-columns: 1fr'),
    '찾은 블록 안에 1칸 선언이 없다 — 엉뚱한 블록을 잡았다',
  );
  assert.ok(coarse > oneCol, '휴대폰 가로 규칙이 폭 규칙보다 앞에 있어 무시된다');
});

/*
  수치 없는 '—' 는 어느 화면에서도 커지면 안 된다.

  이건 실제로 한 번 깨졌다. `.heat-none b` 에서 !important 를 떼자, 미디어쿼리 안의
  `.heat-lead b`(같은 특정도, 더 뒤)가 이겨서 휴대폰에서 '—' 가 1.5rem 으로 커졌다.
  화면에서 가장 큰 자리가 "아무 수치도 없음"을 외치는 상태다.

  지금은 `.heat.heat-none b`(0,2,1)로 이기고 있는데, 좁은 화면 블록의
  `.heat-long.heat-lead b` 도 (0,2,1)이라 더 뒤에 있으면 다시 뒤집힌다.
  (오늘은 '—' 가 한 글자라 heat-long 이 안 붙어 안 만나지만, 그건 우연이다.)
*/
test("수치 없음 규칙이 좁은 화면 크기 규칙보다 뒤에 온다", () => {
  const css = fs.readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8');
  const none = css.indexOf('.heat.heat-none b');
  const mobileLong = css.indexOf('.heat-long.heat-lead b', css.indexOf('@media (max-width: 760px)'));
  assert.ok(none > 0, '.heat.heat-none b 규칙을 찾지 못했다');
  if (mobileLong < 0) return;   // 좁은 화면에 그 규칙이 없으면 겨룰 일도 없다
  assert.ok(
    none > mobileLong,
    '같은 특정도(0,2,1)라 뒤에 오는 쪽이 이긴다 — 수치 없음 규칙이 앞에 있으면 눌린다',
  );
});
