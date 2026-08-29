import type { Cluster, DraftPost } from './types.js';
import { toStoredEvidence } from './publish.js';
import { judgeDraft, type JudgeTarget } from './evaluate.js';
import { reviseDraft } from './revise.js';
import { hasFabrication, type Review } from './reviews.js';
import { TUNING } from './config.js';
import { slugify } from './util.js';

/**
 * 발행 전 검증.
 *
 * 이 파이프라인은 오랫동안 **발행하고 나서** 검증했다. 기사를 파일로 쓴 다음
 * 평가하고, 문제가 있으면 고치고, 끝내 못 고치면 격리했다. 그 순서에는 구조적인
 * 구멍이 있다 — 고치는 데 실패하거나 그 단계가 시간 제한에 걸리면, 날조가 있는
 * 기사가 그대로 사이트에 남는다.
 *
 * 실제로 그렇게 됐다. 라이브에 날조 4건이 있었고 넷 다 개정 시도 0회였다.
 * 그중 하나는 제목에 "엔비디아, 허깅페이스 13조 원 인수"라고 썼는데 원문은
 * 129억 달러(약 18조 원)였다 — 제목에서 5조원이 틀렸다.
 * CI 로그를 보면 개정 단계가 매 실행 5분 제한에 정확히 걸리고 있었다
 * (5:12, 5:13, 5:13). 사후 수리는 시간에 쫓기면 그냥 안 일어난다.
 *
 * 그래서 순서를 뒤집는다. 집필 → **검증** → 발행. 날조가 남아 있으면 발행하지
 * 않는다. 사이트에 올라간 뒤 내리는 것과, 애초에 안 올리는 것은 다르다 —
 * 전자는 그사이 누가 읽고 인용할 수 있고, 검색엔진이 색인할 수도 있다.
 *
 * 비용은 늘지 않는다. 어차피 발행 후에 하던 평가를 앞으로 당긴 것뿐이고,
 * 오히려 집필 당시 자료가 메모리에 그대로 있어 심사가 더 정확하다
 * (evidenceExact 가 항상 true 다).
 */

export interface GateResult {
  ok: boolean;
  /** 통과했다면 발행할 원고(개정됐을 수 있다) */
  draft: DraftPost;
  /** 마지막 심사 결과. 통과했으면 그대로 저장해 재평가를 아낀다. */
  review: Review;
  /** 사람에게 보여 줄 한 줄 */
  reason: string;
}

/** 심사원이 볼 수 있게 초안을 기사 모양으로 맞춘다. */
function asTarget(cluster: Cluster, draft: DraftPost): JudgeTarget {
  return {
    slug: slugify(draft.title),
    title: draft.title,
    oneLiner: draft.oneLiner,
    category: draft.category,
    desk: draft.desk,
    originUrl: cluster.primaryUrl,
    publishedAt: new Date().toISOString(),
    sources: cluster.items.map((i) => ({ origin: i.origin, title: i.title, url: i.url })),
    body: draft.body,
  };
}

/**
 * 날조가 없을 때까지 고친다. 못 고치면 발행을 막는다.
 *
 * 점수 미달은 막지 않는다. 낮은 점수는 읽다 말면 그만이지만 날조는 한 건만
 * 발각돼도 사이트 전체를 의심하게 만든다 — 둘은 다르게 다뤄야 한다.
 * 점수만 낮은 기사는 발행하고, 나중에 개정 명령이 천천히 손본다.
 */
/**
 * 심사와 개정을 주입받는다.
 *
 * 기본값은 실제 LLM 호출이고, 테스트는 가짜를 넣어 게이트의 판단만 검사한다.
 * 이걸 안 하면 게이트에 테스트를 붙일 수 없고, 그러면 "날조를 막는다"는 이 파일의
 * 유일한 약속을 아무도 지키지 않게 된다 — 이 프로젝트에서 이미 두 번 그랬다.
 */
export interface GateDeps {
  judge: typeof judgeDraft;
  revise: typeof reviseDraft;
  /**
   * 진행 상황 출력. 테스트는 조용한 함수를 넣는다.
   *
   * 안 그러면 게이트가 무엇을 했는지 찍는 줄들이 테스트 출력에 섞여, CI 로그에서
   * 진짜 발행 기록과 구분이 안 된다(실제로 워크플로 로그를 읽다가 테스트가 찍은
   * 줄을 실제 발행으로 착각했다).
   */
  log?: (line: string) => void;
}

export async function verifyBeforePublish(
  cluster: Cluster,
  draft: DraftPost,
  raw: { articleText: string; reactions: string[] },
  maxAttempts = TUNING.maxReviseAttempts,
  deps: GateDeps = { judge: judgeDraft, revise: reviseDraft },
): Promise<GateResult> {
  const log = deps.log ?? ((line: string) => console.log(line));
  // 저장본과 같은 함수로 조립한다. 모양이 다르면 발행 전 심사와 발행 후 재심사가
  // 서로 다른 자료를 보게 되어 같은 기사가 두 번 다르게 판정된다.
  const evidence = toStoredEvidence(cluster, raw);

  let current = draft;
  // 집필에 쓴 자료가 그대로 메모리에 있다. 그래서 exact = true 다.
  let review = await deps.judge(asTarget(cluster, current), evidence, true);

  for (let attempt = 1; hasFabrication(review) && attempt <= maxAttempts; attempt++) {
    log(`  · 발행 전 검증: 근거 없는 주장 ${review.unsupported.length}건 — ${attempt}차 수정`);
    for (const claim of review.unsupported.slice(0, 2)) {
      log(`      ↳ ${String(claim).slice(0, 92)}`);
    }

    let revised;
    try {
      revised = await deps.revise(current, review, evidence, TUNING.minQuality);
    } catch (err) {
      log(`      수정 실패: ${(err as Error).message}`);
      break;
    }

    const candidate: DraftPost = {
      ...current,
      title: revised.title,
      description: revised.description,
      oneLiner: revised.oneLiner,
      tags: revised.tags,
      body: revised.body,
    };
    const next = await deps.judge(asTarget(cluster, candidate), evidence, true);

    /*
      되돌리는 조건이 점수가 아니라 날조 수다.

      개정은 점수를 올리려다 새 주장을 지어내는 일이 있다. 점수만 보고 고르면
      "4.6점인데 없는 수치가 둘"인 판을 채택하게 된다. 여기서 지키는 것은
      점수가 아니라 사실이므로, 날조가 늘면 이전 판을 유지한다.
    */
    if (next.unsupported.length <= review.unsupported.length) {
      current = candidate;
      review = next;
    } else {
      log(`      되돌림: 수정본이 근거 없는 주장을 ${next.unsupported.length}건으로 늘렸다`);
      break;
    }
  }

  if (hasFabrication(review)) {
    return {
      ok: false,
      draft: current,
      review,
      reason: `근거 없는 주장 ${review.unsupported.length}건을 못 고쳤습니다 — 발행하지 않습니다`,
    };
  }

  return {
    ok: true,
    draft: current,
    review,
    reason: `검증 통과 (${review.overall.toFixed(2)}점)`,
  };
}
