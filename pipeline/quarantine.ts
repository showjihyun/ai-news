import fs from 'node:fs';
import path from 'node:path';
import { loadReviews, markQuarantined, hasFabrication } from './reviews.js';
import { unpublish } from './state.js';

/**
 * 날조가 남은 기사를 사이트에서 내린다.
 *
 * 이 파이프라인은 발행한 **뒤에** 평가한다. 개정 루프가 세 번 안에 못 살리면
 * 그 기사는 근거 없는 주장을 단 채 그대로 사이트에 남았다. 실제로 자동 발행이
 * 며칠 돌자 없는 수치를 지어낸 기사가 셋 쌓였다 — "삼성 300조·SK 100조 투자",
 * "엔비디아 2분기 실적 8월 말 발표", "AI 인재 몸값 수억 원대".
 *
 * 광고로 먹고사는 뉴스 사이트에서 이건 품질 문제가 아니라 신뢰 문제다. 점수가
 * 낮은 기사는 읽다 말면 그만이지만, 없는 숫자를 지어낸 기사는 한 건만 발각돼도
 * 사이트 전체를 의심하게 만든다. 그래서 점수와 무관하게 다룬다.
 *
 * ⚠ 이 함수는 콘텐츠를 내린다. 그래서 두 가지를 지킨다.
 *
 * 1) **시도한 것만 내린다.** attempted 를 반드시 받는다. 예전에는 기록 전체를
 *    훑어서 내렸는데, 그러면 레이트리밋이나 네트워크 오류로 개정을 아예 못 해 본
 *    기사까지 같이 내려갔다. 한도가 풀린 뒤 다시 돌려도 이미 내려간 뒤라
 *    일시적인 장애가 영구 삭제로 굳었다.
 *
 * 2) **지우지 않고 옮긴다.** 평가자도 틀린다 — 예전에 판정 오류로 진짜 커뮤니티
 *    인용을 날조로 몬 적이 있고 그때 data/evidence 를 도입했다. 파일이 남아 있어야
 *    사람이 열어 보고 되돌릴 수 있다. 다만 옮기기만 해서는 안 되고 워크플로가
 *    content/quarantine 을 반드시 커밋해야 한다 — 안 그러면 CI 에서는 러너와 함께
 *    사라져서 '옮겼다'는 말이 거짓이 된다.
 */
const POSTS_DIR = path.join(process.cwd(), 'content', 'posts');
const QUARANTINE_DIR = path.join(process.cwd(), 'content', 'quarantine');

export interface QuarantineResult {
  moved: string[];
  /** 날조가 남았지만 이번에 개정을 시도하지 못해 보류한 것 */
  deferred: string[];
}

export function quarantineFabrications(attempted: Iterable<string>): QuarantineResult {
  const tried = new Set(attempted);
  const guilty = loadReviews().filter((r) => !r.quarantinedAt && hasFabrication(r));

  const targets = guilty.filter((r) => tried.has(r.slug));
  const deferred = guilty.filter((r) => !tried.has(r.slug)).map((r) => r.slug);

  if (deferred.length) {
    console.log(
      `\n[격리] ${deferred.length}건은 이번에 개정을 시도하지 못해 보류합니다 — 시도해 본 것만 내립니다.`,
    );
  }
  if (targets.length === 0) {
    if (!deferred.length) console.log('\n[격리] 근거 없는 주장이 남은 기사가 없습니다.');
    return { moved: [], deferred };
  }

  fs.mkdirSync(QUARANTINE_DIR, { recursive: true });
  console.log(`\n[격리] 개정으로도 못 살린 ${targets.length}건을 사이트에서 내립니다.`);

  // 파일을 먼저 다 옮기고, 기록은 마지막에 한 번만 쓴다.
  // 중간에 죽으면 옮긴 파일과 기록이 어긋나기 때문이다.
  const moved: string[] = [];
  for (const r of targets) {
    const from = path.join(POSTS_DIR, `${r.slug}.md`);
    const to = path.join(QUARANTINE_DIR, `${r.slug}.md`);
    if (fs.existsSync(from)) fs.renameSync(from, to);
    else if (!fs.existsSync(to)) continue; // 사람이 이미 지웠다
    moved.push(r.slug);

    // 로그 필드는 방어적으로 읽는다. 여기서 터지면 파일은 이미 옮겨진 뒤라
    // 기록만 안 찍힌 어중간한 상태로 죽는다.
    const score = Number.isFinite(r.overall) ? r.overall.toFixed(2) : '?';
    console.log(`  · ${(r.title ?? r.slug).slice(0, 46)} (${score}점)`);
    for (const claim of (r.unsupported ?? []).slice(0, 3)) {
      console.log(`      ↳ ${String(claim).slice(0, 96)}`);
    }
  }

  markQuarantined(moved);
  // 발행 기록에서도 뺀다. 안 빼면 중복 방지가 그 주제를 90일간 막아서,
  // 방금 내린 기사를 제대로 다시 쓸 기회 자체가 사라진다.
  for (const slug of moved) unpublish(slug);

  console.log(
    `\n  content/quarantine/ 으로 옮겼습니다. 사이트에서는 즉시 내려갑니다.`,
  );
  console.log(
    `  평가가 틀렸다고 판단되면 \`npm run restore -- <슬러그>\` 로 되돌리세요.`,
  );
  return { moved, deferred };
}
