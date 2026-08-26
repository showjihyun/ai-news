import fs from 'node:fs';
import path from 'node:path';
import { unmarkQuarantined } from './reviews.js';
import { publishedSlugs, unpublish } from './state.js';

/**
 * 기사를 내린 뒤 뒷정리.
 *
 * 정적 내보내기라 없는 경로는 그냥 404 다. 리다이렉트도 못 쓴다(export 모드에서
 * next.config 의 redirects 가 동작하지 않는다). 그래서 링크를 남겨 두면
 * 독자에게는 깨진 링크, 구글에는 끊어진 내부 링크로 잡힌다 — 이 사이트가
 * 신경 쓰는 SEO 에 그대로 손해다.
 *
 * 링크는 두 군데에 생긴다.
 *   · 일간 브리핑: 그날 발행분을 목록으로 건다.
 *   · 기사 본문: archive.ts 가 집필기에게 예전 기사를 내부 링크로 걸라고 지시한다.
 */
const POSTS_DIR = path.join(process.cwd(), 'content', 'posts');
const QUARANTINE_DIR = path.join(process.cwd(), 'content', 'quarantine');

/** 마크다운 링크 `[텍스트](/posts/슬러그/)` 를 텍스트만 남기고 푼다. */
function unlink(md: string, slug: string): string {
  const escaped = slug.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&');
  const pattern = new RegExp(`\\[([^\\]]*)\\]\\(/posts/${escaped}/?\\)`, 'g');
  return md.replace(pattern, '$1');
}

/**
 * 내려간 기사를 가리키는 링크를 전부 푼다.
 *
 * 링크만 벗기고 글자는 남긴다. 문장 한가운데를 들어내면 문맥이 깨지기 때문이다.
 * 브리핑 항목처럼 링크가 곧 항목인 경우에도, 제목이 남아 있는 편이
 * 아무것도 없는 것보다 읽는 사람에게 낫다.
 */
export function rebuildAfterTakedown(slugs: string[]): number {
  if (slugs.length === 0) return 0;
  let touched = 0;

  for (const file of fs.readdirSync(POSTS_DIR)) {
    if (!file.endsWith('.md')) continue;
    const p = path.join(POSTS_DIR, file);
    const before = fs.readFileSync(p, 'utf8');
    let after = before;
    for (const slug of slugs) after = unlink(after, slug);
    if (after !== before) {
      fs.writeFileSync(p, after, 'utf8');
      touched++;
    }
  }

  if (touched) console.log(`  · 내려간 기사를 가리키던 링크를 ${touched}개 파일에서 풀었습니다.`);
  return touched;
}

/** 격리를 되돌린다. 평가가 틀렸다고 사람이 판단했을 때. */
export function restoreQuarantined(slug: string) {
  const from = path.join(QUARANTINE_DIR, `${slug}.md`);
  const to = path.join(POSTS_DIR, `${slug}.md`);

  if (!fs.existsSync(from)) {
    console.error(`격리함에 없습니다: ${slug}`);
    console.error(`  content/quarantine/ 안의 파일 이름을 확인하세요.`);
    return;
  }
  if (fs.existsSync(to)) {
    console.error(`이미 발행 목록에 같은 이름이 있습니다: ${slug}`);
    return;
  }

  fs.renameSync(from, to);
  unmarkQuarantined(slug);
  console.log(`되돌렸습니다: ${slug}`);
  console.log(`  · 평가 기록의 격리 표시를 지웠습니다. \`npm run evaluate\` 로 다시 평가하세요.`);
  console.log(`  · 이 기사를 가리키던 링크는 자동으로 복구되지 않습니다(글자만 남아 있습니다).`);
}

/**
 * 사이트에 없는데 기록에만 남은 기사를 정리한다.
 *
 * 사람이 기사 파일을 손으로 지우면 published.json 기록은 그대로 남는다. 그러면
 * 중복 방지가 그 주제를 90일간 막아, 지운 기사를 제대로 다시 쓸 기회가 사라진다.
 * 그 기사를 가리키던 내부 링크도 그대로 남아 정적 사이트에서 404 가 된다.
 *
 * 격리 경로는 이걸 자동으로 하지만, 손으로 지운 경우까지 막을 수는 없어서
 * 따로 돌릴 수 있게 둔다.
 */
export function prune(): { removed: string[]; relinked: number } {
  const live = new Set(
    fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)),
  );
  const orphans = publishedSlugs().filter((slug) => !live.has(slug));

  if (orphans.length === 0) {
    console.log('사이트에 없는데 기록에만 남은 기사가 없습니다.');
    return { removed: [], relinked: 0 };
  }

  console.log(`[정리] 사이트에 없는 기록 ${orphans.length}건을 뺍니다.`);
  for (const slug of orphans) {
    console.log(`  · ${slug.slice(0, 60)}`);
    unpublish(slug);
  }
  const relinked = rebuildAfterTakedown(orphans);
  return { removed: orphans, relinked };
}
