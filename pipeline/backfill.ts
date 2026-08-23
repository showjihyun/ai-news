import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { extractArticle } from './extract.js';
import { fetchHnTopComments } from './sources/hackernews.js';
import { fetchRedditTopComments } from './sources/reddit.js';
import { domainOf, mapLimit, isDiscussionUrl } from './util.js';
import { saveEvidenceRaw, type StoredEvidence } from './publish.js';

const POSTS_DIR = path.join(process.cwd(), 'content', 'posts');


/**
 * 이미 발행된 기사의 근거 자료를 뒤늦게 채운다.
 *
 * 왜 필요한가: saveEvidence 를 붙이기 전에 발행된 기사는 근거가 남아 있지 않다.
 * 그러면 평가는 "자료 없음" 상태로 이뤄지고, 개정 루프는 고칠 재료가 없어서
 * 같은 자리를 맴돈다. 실제로 안나스 아카이브 기사가 그랬다 —
 * 4.0 을 넘기는 판은 전부 근거 없는 주장을 되살렸고, 정직한 판은 3.93 에 머물렀다.
 *
 * 정직하게 밝힐 점: 여기서 받아 오는 것은 발행 당시가 아니라 지금의 페이지다.
 * 업보트 수는 그때와 다르고 원문이 수정됐을 수도 있다. 그래서 evidenceExact 는
 * 계속 false 로 두어, 심사원이 못 찾은 인용을 '날조'가 아니라 '확인 불가'로 다루게 한다.
 */
export async function backfillEvidence(file: string): Promise<StoredEvidence | null> {
  const slug = file.replace(/\.md$/, '');
  const { data } = matter(fs.readFileSync(path.join(POSTS_DIR, file), 'utf8'));

  const originUrl = String(data.originUrl ?? '');
  const sources = Array.isArray(data.sources)
    ? data.sources.map((s: Record<string, unknown>) => ({
        origin: String(s.origin ?? ''),
        title: String(s.title ?? ''),
        url: String(s.url ?? ''),
      }))
    : [];

  // ── 본문: 원문 주소 + 토론이 아닌 출처들 ──────────────────────
  const seen = new Set<string>();
  const targets: { url: string; origin: string }[] = [];
  for (const { url, origin } of [{ url: originUrl, origin: '원문' }, ...sources]) {
    if (!url || isDiscussionUrl(url)) continue;
    const host = domainOf(url);
    if (!host || seen.has(host)) continue;
    seen.add(host);
    targets.push({ url, origin });
    if (targets.length >= 3) break;
  }

  const texts = await mapLimit(targets, 3, async ({ url, origin }) => {
    const text = await extractArticle(url, 5000);
    return text.length > 300 ? `[${origin} — ${domainOf(url)}]\n${text}` : '';
  });

  // ── 반응: 출처 permalink 에서 직접 ────────────────────────────
  const reactions: string[] = [];
  for (const s of sources) {
    const hnId = s.url.match(/news\.ycombinator\.com\/item\?id=(\d+)/)?.[1];
    if (hnId) {
      reactions.push(...(await fetchHnTopComments(hnId, 6)).map((c) => `[Hacker News] ${c}`));
      continue;
    }
    if (/reddit\.com\/r\/[^/]+\/comments\//.test(s.url)) {
      reactions.push(...(await fetchRedditTopComments(s.url, 6)).map((c) => `[${s.origin}] ${c}`));
    }
  }

  const articleText = texts.filter(Boolean).join('\n\n---\n\n');
  if (!articleText && reactions.length === 0) return null;

  const evidence: StoredEvidence = {
    articleText,
    reactions: reactions.slice(0, 12),
    // 발행 당시 점수는 남아 있지 않다. 0 으로 두면 심사원이 "댓글 0개인데 논쟁이라 했다"고
    // 잘못 지적하므로, 알 수 없다는 뜻을 -1 로 표시하고 프롬프트에서 그렇게 읽게 한다.
    items: sources.map((s) => ({ ...s, score: -1, commentCount: -1 })),
  };

  saveEvidenceRaw(slug, evidence);
  return evidence;
}

export function articlesMissingEvidence(): string[] {
  if (!fs.existsSync(POSTS_DIR)) return [];
  const evidenceDir = path.join(process.cwd(), 'data', 'evidence');
  return fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => {
      const { data } = matter(fs.readFileSync(path.join(POSTS_DIR, f), 'utf8'));
      return String(data.category ?? '') !== '데일리';
    })
    .filter((f) => !fs.existsSync(path.join(evidenceDir, `${f.replace(/\.md$/, '')}.json`)));
}
