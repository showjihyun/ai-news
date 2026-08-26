import fs from 'node:fs';
import path from 'node:path';
import { loadReviews, removeReview } from './reviews.js';

/**
 * 날조가 남은 기사를 사이트에서 내린다.
 *
 * 이 파이프라인은 발행한 **뒤에** 평가한다. 개정 루프가 세 번 안에 못 살리면
 * 그 기사는 낮은 점수와 근거 없는 주장을 단 채 그대로 사이트에 남았다.
 * 실제로 자동 발행이 며칠 돌자 없는 수치를 지어낸 기사가 셋 쌓였다 —
 * "삼성 300조·SK 100조 투자", "엔비디아 2분기 실적 8월 말 발표",
 * "AI 인재 몸값 수억 원대". 전부 자료에 없는 숫자다.
 *
 * 광고를 붙여 먹고사는 사이트에서 이건 품질 문제가 아니라 신뢰 문제다.
 * 점수가 낮은 기사는 읽다 말면 그만이지만, 없는 숫자를 지어낸 기사는 한 건이라도
 * 발각되면 사이트 전체를 의심하게 만든다. 그래서 여기서는 점수를 보지 않는다 —
 * 근거 없는 주장이 하나라도 남아 있으면 내린다.
 *
 * 지우지 않고 옮기는 이유: 평가자도 틀릴 수 있다. 예전에 실제로 판정이 잘못돼
 * 진짜 커뮤니티 인용을 날조로 몰았던 적이 있다(그때 data/evidence 를 도입했다).
 * 파일이 남아 있어야 사람이 열어 보고 되돌릴 수 있다.
 */
const POSTS_DIR = path.join(process.cwd(), 'content', 'posts');
const QUARANTINE_DIR = path.join(process.cwd(), 'content', 'quarantine');

export function quarantineFabrications(): string[] {
  const reviews = loadReviews();
  const guilty = reviews.filter((r) => (r.unsupported?.length ?? 0) > 0);

  if (guilty.length === 0) {
    console.log('\n[격리] 근거 없는 주장이 남은 기사가 없습니다.');
    return [];
  }

  fs.mkdirSync(QUARANTINE_DIR, { recursive: true });
  console.log(`\n[격리] 근거 없는 주장이 남은 기사 ${guilty.length}건을 사이트에서 내립니다.`);

  const moved: string[] = [];
  for (const r of guilty) {
    const from = path.join(POSTS_DIR, `${r.slug}.md`);
    const to = path.join(QUARANTINE_DIR, `${r.slug}.md`);

    if (fs.existsSync(from)) {
      fs.renameSync(from, to);
    } else if (!fs.existsSync(to)) {
      // 발행 목록에도 격리함에도 없다 — 사람이 이미 지웠다. 기록만 정리한다.
      removeReview(r.slug);
      continue;
    }
    // 평가 기록도 지운다. 남겨 두면 다음 improve 가 사이트에 없는 파일을 고치려다 실패한다.
    removeReview(r.slug);
    moved.push(r.slug);
    console.log(`  · ${r.title.slice(0, 46)} (${r.overall.toFixed(2)}점)`);
    for (const claim of r.unsupported.slice(0, 3)) {
      console.log(`      ↳ ${String(claim).slice(0, 96)}`);
    }
  }

  if (moved.length) {
    console.log(
      `\n  content/quarantine/ 으로 옮겼습니다. 사이트에서는 즉시 내려갑니다.`,
    );
    console.log(
      `  평가가 틀렸다고 판단되면 파일을 content/posts/ 로 되돌리고 \`npm run evaluate\` 를 다시 실행하세요.`,
    );
  }
  return moved;
}
