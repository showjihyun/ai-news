import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

/*
  날조는 한 건도 내보내지 않는다.

  이 사이트는 광고로 먹고사는 뉴스 사이트라, 없는 숫자를 지어낸 기사가 한 건이라도
  발각되면 사이트 전체를 의심하게 만든다. 점수가 낮은 기사와는 성격이 다르다 —
  그건 읽다 말면 그만이지만 날조는 신뢰를 통째로 깎는다.

  그래서 이 규칙은 코드가 아니라 계약으로 본다. 파이프라인 어느 단계에서
  격리를 빼거나 순서를 바꾸면 여기서 걸린다.
*/

const cli = fs.readFileSync(path.join(process.cwd(), 'pipeline/cli.ts'), 'utf8');
const wf = fs.readFileSync(path.join(process.cwd(), '.github/workflows/publish.yml'), 'utf8');

test('발행 실행(run)이 끝나기 전에 격리를 돌린다', () => {
  assert.ok(cli.includes('quarantineFabrications()'), 'cli 가 격리를 부르지 않는다');
});

test('격리가 일간 브리핑 생성보다 먼저다 — 내려간 기사가 브리핑에 링크로 남으면 안 된다', () => {
  const q = cli.indexOf('quarantineFabrications();');
  const d = cli.indexOf('buildDigest(snapshot)');
  assert.ok(q > 0 && d > 0, '두 호출을 찾지 못했다');
  assert.ok(q < d, `격리(${q})가 브리핑(${d})보다 뒤에 있다`);
});

test('개정 명령도 끝나고 격리를 돌린다 — 개정으로 못 살린 건 내려가야 한다', () => {
  const improveBlock = cli.slice(cli.indexOf("command === 'improve'"), cli.indexOf("command === 'status'"));
  assert.ok(improveBlock.includes('quarantineFabrications()'), 'improve 가 격리를 부르지 않는다');
});

test('자동 발행 워크플로가 평가 뒤에 개정을 돌린다 — 평가만 하면 미달 기사가 그대로 남는다', () => {
  const e = wf.indexOf('cli.ts evaluate');
  const i = wf.indexOf('cli.ts improve');
  assert.ok(e > 0, '워크플로에 evaluate 가 없다');
  assert.ok(i > 0, '워크플로에 improve 가 없다');
  assert.ok(e < i, '개정이 평가보다 먼저 온다');
});

test('격리한 기사는 발행 디렉터리 밖으로 나간다 — 정적 내보내기가 다시 집어가면 안 된다', () => {
  const q = fs.readFileSync(path.join(process.cwd(), 'pipeline/quarantine.ts'), 'utf8');
  assert.ok(q.includes("'content', 'quarantine'"), '격리 대상 경로가 content/quarantine 이 아니다');
  assert.ok(!q.includes('unlinkSync'), '지우지 말고 옮겨야 한다 — 평가가 틀렸을 때 되돌릴 수 있어야 한다');
});

test('점수가 아니라 근거 없는 주장 유무로 판단한다', () => {
  const q = fs.readFileSync(path.join(process.cwd(), 'pipeline/quarantine.ts'), 'utf8');
  assert.match(q, /unsupported\?\.length \?\? 0\) > 0/, '판단 기준이 unsupported 가 아니다');
});
