import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { Cluster } from './types.js';
import { titleTokens, jaccard } from './util.js';

const POSTS_DIR = path.join(process.cwd(), 'content', 'posts');

export interface ArchiveEntry {
  slug: string;
  title: string;
  oneLiner: string;
  date: string;
  category: string;
  tags: string[];
  daysAgo: number;
}

/**
 * 우리가 전에 쓴 관련 기사.
 *
 * 차별성을 올리는 가장 확실한 방법이다. 경쟁 매체는 우리 아카이브를 모른다.
 * "지난주 우리가 다룬 A 때와 비교하면 이번엔 B가 다르다" 같은 문장은
 * 원문 요약으로는 절대 나올 수 없고, 다른 곳이 베낄 수도 없다.
 *
 * 게다가 이건 글이 쌓일수록 강해진다. 25건일 때보다 200건일 때 훨씬 잘 걸린다.
 * 내부 링크가 늘어 체류 시간과 SEO 에도 같이 도움이 된다.
 */
export function relatedArchive(cluster: Cluster, limit = 3): ArchiveEntry[] {
  if (!fs.existsSync(POSTS_DIR)) return [];

  // 아이템 제목을 전부 이어 붙이면 토큰 집합이 커져서 Jaccard 가 눌린다.
  // 소스가 많은 이슈일수록 오히려 아카이브를 못 찾는 역효과가 났다.
  // 제목별로 따로 재고 그중 가장 잘 맞는 값을 쓴다.
  const candidateTokenSets = [
    titleTokens(cluster.title),
    ...cluster.items.slice(0, 5).map((i) => titleTokens(i.title)),
  ];
  const allTokens = new Set(candidateTokenSets.flatMap((s) => [...s]));
  const now = Date.now();

  const scored: { entry: ArchiveEntry; score: number }[] = [];

  for (const file of fs.readdirSync(POSTS_DIR)) {
    if (!file.endsWith('.md')) continue;
    const { data } = matter(fs.readFileSync(path.join(POSTS_DIR, file), 'utf8'));
    if (String(data.category ?? '') === '데일리') continue; // 브리핑은 참조 대상이 아니다

    const title = String(data.title ?? '');
    const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
    const rawDate = data.date;
    const iso = rawDate instanceof Date ? rawDate.toISOString() : String(rawDate ?? '');
    const daysAgo = iso ? (now - new Date(iso).getTime()) / 86_400_000 : 999;

    // 제목 토큰 유사도 + 태그 일치. 태그는 LLM 이 주제로 고른 것이라 신호가 정확하다.
    const postTokens = titleTokens(`${title} ${tags.join(' ')}`);
    const titleSim = Math.max(...candidateTokenSets.map((set) => jaccard(set, postTokens)));

    const lowerTitles = [cluster.title, ...cluster.items.map((i) => i.title)]
      .join(' ')
      .toLowerCase();
    const tagHits = tags.filter(
      (t) => allTokens.has(t.toLowerCase()) || lowerTitles.includes(t.toLowerCase()),
    ).length;

    const score = titleSim * 2 + tagHits * 0.5;
    if (score < 0.25) continue;

    scored.push({
      entry: {
        slug: file.replace(/\.md$/, ''),
        title,
        oneLiner: String(data.oneLiner ?? data.description ?? ''),
        date: iso,
        category: String(data.category ?? ''),
        tags,
        daysAgo: Math.round(daysAgo),
      },
      score,
    });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
}

/** 집필 프롬프트에 넣을 아카이브 블록. 없으면 빈 문자열. */
export function archiveBlock(entries: ArchiveEntry[]): string {
  if (entries.length === 0) return '';

  return [
    '',
    '■ 본지가 전에 다룬 관련 기사 — 여기가 차별성의 핵심입니다',
    '',
    ...entries.map(
      (e) =>
        `- ${e.daysAgo === 0 ? '오늘' : `${e.daysAgo}일 전`} · [${e.category}] ${e.title}\n` +
        `  요지: ${e.oneLiner}\n` +
        `  링크: /posts/${e.slug}/`,
    ),
    '',
    '이 기사들과 이어지는 대목이 있으면 본문에서 언급하고 링크하세요.',
    '예: "본지가 3일 전 다룬 OO 때는 A였는데, 이번에는 B라는 점이 다릅니다."',
    '마크다운 링크 형식은 [기사 제목](/posts/슬러그/) 입니다.',
    '',
    '주의: 억지로 연결하지 마세요. 실제로 이어지는 대목이 없으면 언급하지 않는 편이 낫습니다.',
    '연결할 때는 그 기사에 실제로 쓴 내용만 근거로 삼으세요(위 요지 범위 안에서).',
  ].join('\n');
}
