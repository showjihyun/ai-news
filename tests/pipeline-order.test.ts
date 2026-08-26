import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
  파이프라인 단계 순서 계약.

  동작 자체는 quarantine.test.ts 가 실제로 돌려서 확인한다. 여기서 보는 건
  순서다 — 순서는 함수 하나를 봐서는 알 수 없고, 어긋나도 조용히 잘못된 결과만
  남기기 때문에 따로 못 박는다.

  소스를 읽는 방식이라 리팩터링에 약하다. 그래서 "이 글자가 있나"가 아니라
  "A 가 B 보다 앞인가"만 본다.
*/

function read(rel: string): string {
  const p = path.join(process.cwd(), rel);
  // 체크아웃에 .github 가 없을 수 있다. 그때 파일 전체가 죽으면
  // 워크플로의 '테스트' 단계가 발행 작업까지 통째로 멈춘다.
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

const cli = read('pipeline/cli.ts');

/** run 명령 블록만 잘라 본다. improve 블록에도 같은 호출이 있어서, 파일 전체에서 찾으면 엉뚱한 걸 잡는다. */
function runBlock(): string {
  const start = cli.indexOf('const snapshot = command');
  return start > 0 ? cli.slice(start) : cli;
}

test('발행 실행이 격리를 부른다', () => {
  assert.match(runBlock(), /quarantineFabrications\(/, 'run 이 격리를 부르지 않는다');
});

test('격리가 일간 브리핑 생성보다 먼저다 — 내려간 기사가 브리핑에 링크로 남으면 404 가 된다', () => {
  const block = runBlock();
  const q = block.indexOf('quarantineFabrications(');
  const d = block.indexOf('buildDigest(snapshot)');
  assert.ok(q > 0, 'run 블록에서 격리 호출을 찾지 못했다');
  assert.ok(d > 0, 'run 블록에서 브리핑 생성을 찾지 못했다');
  assert.ok(q < d, `격리(${q})가 브리핑(${d})보다 뒤에 있다`);
});

test('개정 명령도 끝나고 격리를 돌린다', () => {
  const improve = cli.slice(cli.indexOf("command === 'improve'"), cli.indexOf("command === 'quarantine'"));
  assert.match(improve, /quarantineFabrications\(/, 'improve 가 격리를 부르지 않는다');
});

test('격리는 시도한 기사 집합을 반드시 받는다 — 인자 없이 부르면 손도 못 대 본 기사까지 내려간다', () => {
  const calls = [...cli.matchAll(/quarantineFabrications\(([^)]*)\)/g)].map((m) => m[1].trim());
  assert.ok(calls.length > 0, '호출을 찾지 못했다');
  for (const arg of calls) assert.notEqual(arg, '', '인자 없이 부르는 곳이 있다');
});

const wf = read('.github/workflows/publish.yml');

test('자동 발행 워크플로가 평가 뒤에 개정을 돌린다 — 평가만 하면 미달 기사가 그대로 남는다', () => {
  if (!wf) return; // .github 가 없는 체크아웃
  const e = wf.indexOf('cli.ts evaluate');
  const i = wf.indexOf('cli.ts improve');
  assert.ok(e > 0, '워크플로에 evaluate 가 없다');
  assert.ok(i > 0, '워크플로에 improve 가 없다');
  assert.ok(e < i, '개정이 평가보다 먼저 온다');
});

test('워크플로가 격리함을 커밋한다 — 빠뜨리면 CI 에서 격리가 곧 영구 삭제다', () => {
  if (!wf) return;
  assert.match(wf, /git add[^\n]*content\/quarantine/,
    'content/quarantine 을 커밋하지 않아 옮긴 파일이 러너와 함께 사라진다');
});
