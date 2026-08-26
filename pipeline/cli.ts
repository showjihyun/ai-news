import { loadEnv } from './env.js';

// 다른 모듈이 process.env 를 읽기 전에 먼저 불러야 한다.
loadEnv();

import { collect, loadSnapshot, printTrending } from './collect.js';
import { gatherEvidence } from './extract.js';
import { classify, writePost } from './writer.js';
import { publishPost } from './publish.js';
import { isAlreadyPublished, publishedCount } from './state.js';
import { TUNING } from './config.js';
import { buildDigest } from './digest.js';
import { printStatus } from './status.js';
import { evaluatePost, pendingPosts, allPosts, printReport, loadReviews, saveReview } from './evaluate.js';
import { dimensionName } from './rubric.js';
import { improveToTarget } from './revise.js';
import type { Review } from './reviews.js';
import { hasFabrication } from './reviews.js';
import { backfillEvidence, articlesMissingEvidence } from './backfill.js';
import { quarantineFabrications } from './quarantine.js';
import { rebuildAfterTakedown, restoreQuarantined, prune } from './takedown.js';
import { mapLimit } from './util.js';
import type { Cluster } from './types.js';

/**
 * LLM 호출 동시 실행 수.
 *
 * 기사들은 서로 독립적이라 병렬로 처리해도 결과가 달라지지 않는다.
 * CLI 백엔드는 호출마다 Claude Code 프로세스를 새로 띄우므로(기동만 5초)
 * 메모리를 고려해 보수적으로 잡는다. API 백엔드는 프로세스가 없어 더 올릴 수 있다.
 */
const CONCURRENCY = Number(process.env.LLM_CONCURRENCY) ||
  ((process.env.LLM_BACKEND || 'api').toLowerCase() === 'cli' ? 4 : 6);

function flag(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : 'true';
}
const has = (name: string) => process.argv.includes(`--${name}`);

/** 사용량 한도로 실패했는지. 이러면 남은 작업을 계속해 봐야 전부 같은 이유로 실패한다. */
function isRateLimit(err: unknown): boolean {
  return Boolean((err as { rateLimited?: boolean })?.rateLimited);
}

class RateLimitStop extends Error {}

/**
 * 숫자 플래그. Number('3 ') 는 3 이지만 Number('three') 나 Number('true') 는 NaN 이고,
 * `candidates.length >= NaN` 은 항상 false 라서 한도가 조용히 사라진다. 그러면 한 번 실행에
 * 수십 건을 쓰게 되고 그대로 API 비용이 된다. 이상한 값이면 기본값으로 되돌린다.
 */
function numFlag(name: string, fallback: number): number {
  const raw = flag(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    console.warn(`  ! --${name} 값이 올바르지 않습니다(${raw}). 기본값 ${fallback} 사용.`);
    return fallback;
  }
  return n;
}

/**
 * 한 클러스터를 기사로 만든다.
 * @returns 발행한 파일명(`slug.md`). 건너뛰었거나 dry-run 이면 null.
 *          검수 대상을 '이번에 낸 것'으로 한정하는 데 쓴다.
 */
async function writeOne(cluster: Cluster, dryRun: boolean, force: boolean): Promise<string | null> {
  console.log(`\n▶ ${cluster.title.slice(0, 70)}`);
  console.log(`  화제성 ${cluster.heat.toFixed(0)} · 소스 ${cluster.origins.join(', ')}`);

  const evidence = await gatherEvidence(cluster);
  console.log(`  · 원문 ${evidence.articleText.length}자, 커뮤니티 반응 ${evidence.reactions.length}건`);

  /**
   * 근거가 없으면 쓰지 않는다.
   *
   * 원문 추출이 실패하고 커뮤니티 반응도 없으면 LLM 에게 남는 재료는 제목뿐이다.
   * 그렇게 나간 기사는 제목이 스스로 실토한다 — "네 매체 제목엔 금액도 날짜도 없다",
   * "확인된 건 제목뿐". 독자에게 값어치가 없고 애드센스 심사에도 불리하다.
   * (구글뉴스 RSS 처럼 링크가 리다이렉트 껍데기인 소스에서 특히 자주 생긴다.)
   *
   * --force 로는 넘길 수 있게 둔다. 판단은 사람이 한다.
   */
  if (evidence.articleText.length < TUNING.minArticleTextChars && evidence.reactions.length === 0 && !force) {
    console.log(
      `  – 건너뜀: 쓸 근거가 없음 (원문 ${evidence.articleText.length}자 < 기준 ${TUNING.minArticleTextChars}, 반응 0건)`,
    );
    return null;
  }

  // 1단계: 카테고리 판정. 어떤 데스크의 목소리로 쓸지가 여기서 정해진다.
  const verdict = await classify(cluster, evidence);
  console.log(`  · 분류 ${verdict.category} (독자가치 ${verdict.readerValue}/10) — ${verdict.reason}`);

  if (verdict.adRisk === 'high' && TUNING.skipAdRiskHigh && !force) {
    console.log(`  – 건너뜀: 애드센스 정책 위험 — ${verdict.adRiskReason}`);
    return null;
  }
  if (verdict.adRisk === 'low') {
    console.log(`  ! 광고 정책 주의: ${verdict.adRiskReason}`);
  }

  if (verdict.readerValue < TUNING.minReaderValue && !force) {
    console.log(`  – 건너뜀: 일반 독자에게 가치가 낮음 (기준 ${TUNING.minReaderValue})`);
    return null;
  }

  // 2단계: 해당 데스크 페르소나를 입혀 집필.
  const draft = await writePost(cluster, evidence, verdict.category);

  if (dryRun) {
    console.log(`  [초안] ${draft.title}`);
    console.log(`  [데스크] ${draft.desk}`);
    console.log(`  [요약] ${draft.oneLiner}`);
    console.log(`  [차별점] ${draft.angle}`);
    console.log(`  [본문] ${draft.body.length}자 · 태그: ${draft.tags.join(', ')}`);
    console.log('  (--dry-run 이므로 저장하지 않음)');
    return null;
  }

  const slug = publishPost(cluster, draft, evidence);
  console.log(`  ✓ 발행: content/posts/${slug}.md`);
  return `${slug}.md`;
}

async function main() {
  const command = process.argv[2] || 'run';
  const limit = numFlag('limit', TUNING.defaultWriteLimit);
  const hours = numFlag('hours', TUNING.maxAgeHours);
  const dryRun = has('dry-run');
  const force = has('force');

  if (command === 'report') {
    printReport(loadReviews());
    return;
  }

  if (command === 'backfill') {
    const missing = articlesMissingEvidence();
    if (missing.length === 0) {
      console.log('모든 기사에 근거 자료가 있습니다.');
      return;
    }
    console.log(`
[근거 보강] ${missing.length}건 — 원문과 커뮤니티 반응을 다시 받아옵니다.`);
    for (const file of missing) {
      const ev = await backfillEvidence(file);
      console.log(
        ev
          ? `  ✓ ${file.slice(0, 46)}  원문 ${ev.articleText.length}자, 반응 ${ev.reactions.length}건`
          : `  – ${file.slice(0, 46)}  자료를 찾지 못함`,
      );
    }
    console.log('\n이제 `npm run evaluate -- --all` 로 재평가하면 정확하게 채점됩니다.');
    return;
  }

  if (command === 'evaluate') {
    const files = has('all') ? allPosts() : pendingPosts();
    if (files.length === 0) {
      console.log('평가할 새 기사가 없습니다. (--all 로 전체 재평가)');
      printReport(loadReviews());
      return;
    }
    // --limit 을 안 준 경우에만 전부 평가한다.
    // 예전에는 `limit === TUNING.defaultWriteLimit` 를 "안 줬음" 신호로 썼는데,
    // 그러면 기본값과 같은 수(`--limit 3`)를 명시한 사용자가 전체 평가를 받게 되고,
    // 기본값을 바꾸는 순간 어떤 값이 마법값인지도 조용히 바뀐다.
    const targets = flag('limit') === undefined ? files : files.slice(0, limit);
    console.log(`
[평가] ${targets.length}건 (동시 ${CONCURRENCY}건)`);

    // 평가는 기사끼리 완전히 독립적이라 병렬이 안전하다.
    const results = await mapLimit(targets, CONCURRENCY, async (file) => {
      try {
        const review = await evaluatePost(file);
        const weakest = Object.entries(review.scores).sort((a, b) => a[1] - b[1])[0];
        console.log(
          `  ${review.overall.toFixed(2)}  ${review.title.slice(0, 42).padEnd(44)}` +
            `약점: ${dimensionName(weakest[0])} ${weakest[1]}점` +
            (hasFabrication(review) ? `  ⚠ 근거없는 주장 ${review.unsupported.length}건` : ''),
        );
        return review;
      } catch (err) {
        console.error(`  ✗ ${file}: ${(err as Error).message}`);
        return null;
      }
    });

    // 저장은 순차로. saveReview 가 읽기→수정→쓰기라 병렬로 부르면 서로 덮어쓴다.
    for (const r of results) if (r) saveReview(r);

    printReport(loadReviews());
    return;
  }

  if (command === 'improve') {
    // numFlag 를 써야 한다. Number(flag('target')) 은 `--target`(값 없음)에서 'true' 를 받아
    // NaN 이 되고, `r.overall < NaN` 은 항상 false 라 점수 기준이 통째로 사라진다.
    const target = numFlag('target', TUNING.minQuality);
    const reviews = loadReviews();
    /*
      점수 미달뿐 아니라 근거 없는 주장이 있는 기사도 개정 대상이다.

      hasFabrication 을 쓴다. 예전에는 `r.unsupported.length` 로 바로 읽었는데,
      스키마가 나중에 붙은 필드라 옛 기록에는 없을 수 있다. 하나만 그래도
      개정 명령 전체가 TypeError 로 죽고, 워크플로에서는 그 단계가
      continue-on-error 라 아무 일 없다는 듯 커밋까지 진행했다 —
      날조 안전망이 조용히 꺼진 채로.

      한 번에 다루는 수는 제한한다. 기록 전체를 대상으로 두면 4.4 에서
      더 안 오르는 기사가 영원히 목록에 남아, 30분마다 같은 기사를 다시 쓰느라
      호출만 태우고 작업 시간 제한(25분)까지 위협한다.
    */
    const below = reviews
      .filter((r) => r.overall < target || hasFabrication(r))
      .sort((a, b) => Number(hasFabrication(b)) - Number(hasFabrication(a)) || a.overall - b.overall)
      .slice(0, numFlag('limit', 4));

    if (below.length === 0) {
      console.log(
        `
모든 기사가 ${target.toFixed(1)}점 이상이고 근거 없는 주장도 없습니다. (평가 ${reviews.length}건)`,
      );
      printReport(loadReviews());
      return;
    }

    console.log(
      `
[개정] ${below.length}건이 기준 미달입니다. (동시 ${CONCURRENCY}건, 기사당 최대 ${TUNING.maxReviseAttempts}회)`,
    );
    for (const r of below) {
      console.log(
        `  · ${r.title.slice(0, 50)} — ${r.overall.toFixed(2)}점` +
          (r.unsupported.length ? `, 근거없는 주장 ${r.unsupported.length}건` : ''),
      );
    }
    console.log('');

    // 기사마다 파일이 다르고 서로를 읽지 않으므로 병렬이 안전하다.
    // 다만 한 기사 안의 개정→재평가는 앞 결과에 의존하므로 순차를 유지한다.
    // 끝난 것부터 바로 담아 둔다.
    // mapLimit 은 내부적으로 Promise.all 이라 하나가 던지면 반환값이 통째로 날아간다.
    // 예전에는 그 반환값만 저장해서, 한도로 중단됐을 때 "여기까지 저장합니다" 라고
    // 출력해 놓고 실제로는 아무것도 저장하지 않았다. 파일은 이미 고쳐졌는데
    // reviews.json 은 옛 점수 그대로라, 다음 실행이 같은 기사를 또 개정했다.
    const improved: Review[] = [];
    /*
      개정을 실제로 끝까지 시도한 기사만 담는다.

      격리는 이 집합만 대상으로 한다. 예전에는 기록 전체를 훑어서 내렸는데,
      그러면 레이트리밋에 걸려 손도 못 대 본 기사까지 같이 내려갔다.
      한도가 풀린 뒤 다시 돌려도 이미 내려간 뒤여서, 일시적인 장애가
      영구 삭제로 굳었다. 네트워크 오류로 한 번 실패한 경우도 마찬가지다 —
      그건 "세 번 고쳐도 안 됐다"와 전혀 다른 상태다.
    */
    const attempted = new Set<string>();
    try {
      await mapLimit(below, CONCURRENCY, async (r) => {
        try {
          const result = await improveToTarget(
            `${r.slug}.md`,
            r,
            target,
            numFlag('attempts', TUNING.maxReviseAttempts),
          );
          attempted.add(r.slug);
          if (result.review) improved.push(result.review);
          console.log(
            `  ${result.before.toFixed(2)} → ${result.after.toFixed(2)}` +
              (result.reachedTarget ? '  ✓ 통과' : '  · 미달') +
              `  ${r.title.slice(0, 40)}`,
          );
          return result.review;
        } catch (err) {
          if (isRateLimit(err)) throw new RateLimitStop((err as Error).message);
          console.error(`  ✗ 개정 실패 (${r.slug}): ${(err as Error).message}`);
          return null;
        }
      });
    } catch (err) {
      if (err instanceof RateLimitStop) {
        console.error(`
  ! ${err.message}`);
        console.error(
          `  · 완료된 ${improved.length}건은 저장합니다. 한도 회복 후 \`npm run improve\` 를 다시 실행하세요.`,
        );
      } else {
        throw err;
      }
    }

    for (const rev of improved) saveReview(rev);

    const { moved } = quarantineFabrications(attempted);
    // 내린 기사를 브리핑이 링크하고 있으면 정적 사이트에서 404 가 된다.
    if (moved.length) rebuildAfterTakedown(moved);
    printReport(loadReviews());
    return;
  }

  if (command === 'quarantine') {
    /*
      손으로 부를 때는 기록에 있는 것 전부를 시도한 것으로 본다.
      사람이 상태를 보고 직접 내리는 명령이라, 자동 실행과 달리
      "시도했는가"를 따질 대상이 없다.
    */
    const { moved } = quarantineFabrications(loadReviews().map((r) => r.slug));
    if (moved.length) rebuildAfterTakedown(moved);
    return;
  }

  if (command === 'prune') {
    prune();
    return;
  }

  if (command === 'restore') {
    const slug = (process.argv[3] || '').replace(/\.md$/, '');
    if (!slug) return console.error('사용법: npm run restore -- <슬러그>');
    restoreQuarantined(slug);
    return;
  }

  if (command === 'status') {
    printStatus();
    return;
  }

  if (command === 'collect') {
    const snap = await collect(hours);
    printTrending(snap, numFlag('show', 20));
    return;
  }

  if (command === 'digest') {
    const snap = loadSnapshot() ?? (await collect(hours));
    buildDigest(snap);
    return;
  }

  if (command === 'trend') {
    const snap = loadSnapshot();
    if (!snap) return console.error('data/trending.json 이 없습니다. 먼저 `npm run collect` 을 실행하세요.');
    printTrending(snap, numFlag('show', 20));
    return;
  }

  // write: 이미 수집된 스냅샷으로 글만 쓴다 (수집 재실행 없이 반복 시도할 때 유용)
  // run:   수집 → 글쓰기 → 발행까지 한 번에 (자동화에서 쓰는 명령)
  const snapshot = command === 'write' ? loadSnapshot() ?? (await collect(hours)) : await collect(hours);
  printTrending(snapshot, 12);

  // 화제성·중복 기준을 통과한 후보를 순위대로 모아 둔다. 여기서 개수를 자르지 않는다.
  const candidates: Cluster[] = [];
  for (const cluster of snapshot.clusters) {
    if (cluster.heat < TUNING.minHeat && !force) continue;

    const dup = isAlreadyPublished(cluster.items.map((i) => i.url), cluster.title);
    if (dup && !force) {
      console.log(`  – 건너뜀 (이미 발행: ${dup.slug}): ${cluster.title.slice(0, 50)}`);
      continue;
    }
    candidates.push(cluster);
  }

  if (candidates.length === 0) {
    console.log('\n새로 쓸 만한 이슈가 없습니다. (모두 발행했거나 화제성이 기준 미달)');
    console.log(`기준: heat >= ${TUNING.minHeat}. --force 로 무시할 수 있습니다.`);
    return;
  }

  /*
    --limit 은 '발행 성공 건수'를 뜻한다. 후보 개수가 아니다.

    예전에는 후보를 limit 개만 뽑아 놓고 시작했다. 그런데 독자가치 게이트에서 탈락하는
    후보가 섞이면(개인 질문글, 개발자 전용 공지 등) 4건을 요청해도 1건만 나오고 끝났다.
    순위 10위에 멀쩡한 기사가 있어도 손도 대지 않았다.

    대신 검토 횟수에 상한을 둔다. 분류는 저비용(effort low)이고 집필은 게이트를 통과한
    것만 하므로, 후보를 더 들여다보는 비용은 작다. 그래도 화제성이 낮은 날 수십 건을
    긁는 건 낭비라 limit 의 5배에서 멈춘다.
  */
  const reviewBudget = Math.min(candidates.length, Math.max(limit * 5, limit + 6));
  console.log(
    `\n[작성] 목표 ${limit}건 · 후보 ${candidates.length}건 중 최대 ${reviewBudget}건 검토` +
      ` (백엔드: ${process.env.LLM_BACKEND || 'api'}, 모델: ${process.env.LLM_MODEL || 'claude-opus-5'})`,
  );

  let ok = 0;
  // 날조로 내린 기사. 마지막 '완료 N건'에서 빼야 커밋 메시지가 거짓말을 안 한다.
  let takenDown: string[] = [];
  let reviewed = 0;
  let stoppedByRateLimit = false;
  const publishedThisRun: string[] = [];
  for (const cluster of candidates) {
    if (ok >= limit || reviewed >= reviewBudget) break;
    reviewed++;
    try {
      const published = await writeOne(cluster, dryRun, force);
      if (published) {
        publishedThisRun.push(published);
        ok++;
      }
    } catch (err) {
      // 사용량 한도면 남은 후보도 전부 같은 이유로 실패한다.
      // 계속 돌면 후보마다 claude 프로세스를 띄웠다 죽이며 25분 워크플로 시간을
      // 통째로 태우고, 정작 발행한 기사를 커밋할 시간이 남지 않는다.
      if (isRateLimit(err)) {
        console.error(`
  ! ${(err as Error).message}`);
        console.error('  · 남은 후보는 건너뜁니다. 한도 회복 후 다시 실행하세요.');
        stoppedByRateLimit = true;
        break;
      }
      console.error(`  ✗ 실패: ${(err as Error).message}`);
    }
  }

  if (ok < limit) {
    console.log(
      `\n  (${reviewed}건 검토 후 ${ok}건 발행. 나머지는 독자가치 기준 미달로 걸렀습니다 — ` +
        '기사 수보다 품질이 먼저입니다.)',
    );
  }

  // 발행한 기사를 바로 평가하고, 기준 미달이면 그 자리에서 고쳐 쓴다.
  // "쌓기만 하고 나중에 손보자"는 실제로는 영원히 안 하게 된다.
  if (ok > 0 && !dryRun && !has('no-improve') && !stoppedByRateLimit) {
    /**
     * 방금 낸 기사만 검수한다.
     *
     * 예전에는 pendingPosts()(=평가 이력이 없는 모든 기사)를 넘겼다. 평가 단계가 한 번이라도
     * 실패하면(워크플로에서 continue-on-error 다) 백로그가 30분마다 쌓이고, 어느 순간
     * 한 번 실행에서 12건을 평가하고 각각 최대 3회 개정하게 된다. 기사 1건 평가에만
     * 2~3분이 걸리므로 25분 타임아웃을 넘겨 잡이 죽고, 그러면 '변경 사항 커밋' 단계까지
     * 못 가서 방금 쓴 기사가 통째로 사라진다.
     */
    const justPublished = new Set(publishedThisRun);
    const toReview = pendingPosts().filter((f) => justPublished.has(f));
    console.log(
      `
[검수] ${toReview.length}건 평가 후 ${TUNING.minQuality.toFixed(1)}점 미만은 개정합니다. (동시 ${CONCURRENCY}건)`,
    );

    // 검수를 끝까지 마친 기사만 격리 대상이 된다 — quarantine.ts 주석 참고.
    const reviewed = new Set<string>();
    const checked = await mapLimit(toReview, CONCURRENCY, async (file) => {
      try {
        const review = await evaluatePost(file);
        reviewed.add(review.slug);
        const weakest = Object.entries(review.scores).sort((a, b) => a[1] - b[1])[0];
        console.log(
          `  ${review.overall.toFixed(2)}  ${review.title.slice(0, 40).padEnd(42)}약점: ${dimensionName(weakest[0])} ${weakest[1]}점`,
        );

        if (review.overall < TUNING.minQuality || hasFabrication(review)) {
          const result = await improveToTarget(file, review, TUNING.minQuality, TUNING.maxReviseAttempts);
          console.log(
            `    개정 ${result.before.toFixed(2)} → ${result.after.toFixed(2)}` +
              (result.reachedTarget ? '  ✓' : '  · 목표 미달'),
          );
          return result.review;
        }
        return review;
      } catch (err) {
        console.error(`  ✗ 검수 실패 (${file}): ${(err as Error).message}`);
        return null;
      }
    });

    for (const rev of checked) if (rev) saveReview(rev);

    /*
      개정으로도 못 살린 날조는 여기서 내린다.

      이 순서가 중요하다. 격리를 브리핑보다 **먼저** 돌려야 내려간 기사가
      브리핑에 링크로 남지 않고, 커밋보다 먼저라 사이트에 아예 도달하지 않는다.
      점수가 낮은 건 남겨 두지만 없는 숫자를 지어낸 건 한 건도 내보내지 않는다 —
      낮은 점수는 읽다 말면 그만이고, 날조는 한 건만 발각돼도 사이트 전체를
      의심하게 만든다.
    */
    const result = quarantineFabrications(reviewed);
    takenDown = result.moved;
    if (takenDown.length) rebuildAfterTakedown(takenDown);
  }

  // 기사를 새로 냈으면 일간 브리핑도 갱신한다. 발행분을 재조합하는 것이라 LLM 을 다시 부르지 않는다.
  // (이게 빠져 있으면 브리핑은 손으로 `digest` 를 칠 때만 생긴다 — 자동화에서는 영원히 안 생긴다.)
  //
  // 격리보다 **뒤**에 와야 한다. 브리핑은 그날 발행분을 목록으로 거는데,
  // 내려간 기사가 그 목록에 남으면 정적 사이트에서 그대로 404 가 된다.
  if (ok > 0 && !dryRun) buildDigest(snapshot);

  const live = ok - takenDown.length;
  console.log(
    `\n완료: ${live}/${candidates.length}건 발행` +
      (takenDown.length ? ` (${takenDown.length}건은 날조로 내림)` : '') +
      `. 누적 발행 ${publishedCount()}건.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
