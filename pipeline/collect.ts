import fs from 'node:fs';
import path from 'node:path';
import type { Cluster, RawItem } from './types.js';
import { TUNING } from './config.js';
import { clusterItems, rankClusters } from './cluster.js';
import { fetchHackerNews } from './sources/hackernews.js';
import { fetchReddit } from './sources/reddit.js';
import { fetchRssFeeds } from './sources/rss.js';
import { fetchNaver } from './sources/naver.js';
import { fetchX } from './sources/x.js';
import { fetchFacebook } from './sources/facebook.js';
import { enrichGeekNews } from './sources/geeknews.js';

export interface TrendSnapshot {
  generatedAt: string;
  totalItems: number;
  clusters: Cluster[];
}

/**
 * 모든 소스를 병렬로 긁고, 묶고, 줄 세운다.
 * 소스 하나가 실패해도(키 없음, 429, 타임아웃) 나머지로 계속 간다 —
 * 매시간 도는 자동화라 한 곳 때문에 전체가 멈추면 안 된다.
 */
export async function collect(sinceHours = TUNING.maxAgeHours): Promise<TrendSnapshot> {
  console.log(`\n[수집] 최근 ${sinceHours}시간 …`);

  const settled = await Promise.allSettled([
    fetchHackerNews(sinceHours),
    fetchReddit(sinceHours),
    fetchRssFeeds(sinceHours),
    fetchNaver(sinceHours),
    fetchX(sinceHours),
    fetchFacebook(sinceHours),
  ]);

  const items: RawItem[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') items.push(...r.value);
    else console.warn(`  ! 소스 실패: ${r.reason}`);
  }

  console.log(`[수집] 총 ${items.length}건`);

  // 클러스터링 전에 해야 한다. GeekNews 항목이 원문 URL 을 갖게 되어야
  // 같은 사건의 영문 기사와 URL 로 붙는다.
  await enrichGeekNews(items);

  const clusters = rankClusters(clusterItems(items));
  console.log(`[분석] ${clusters.length}개 이슈로 묶음`);

  const snapshot: TrendSnapshot = {
    generatedAt: new Date().toISOString(),
    totalItems: items.length,
    clusters,
  };

  const out = path.join(process.cwd(), 'data', 'trending.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
  return snapshot;
}

export function loadSnapshot(): TrendSnapshot | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'data', 'trending.json'), 'utf8'),
    ) as TrendSnapshot;
  } catch {
    return null;
  }
}

export function printTrending(snapshot: TrendSnapshot, limit = 15) {
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`지금 가장 뜨는 AI 이슈  (${new Date(snapshot.generatedAt).toLocaleString('ko-KR')})`);
  console.log('─'.repeat(72));
  snapshot.clusters.slice(0, limit).forEach((c, i) => {
    const age = ((Date.now() - new Date(c.lastActivityAt).getTime()) / 3_600_000).toFixed(1);
    console.log(
      `${String(i + 1).padStart(2)}. [${c.heat.toFixed(0).padStart(4)}] ${c.title.slice(0, 68)}`,
    );
    console.log(
      `      ${c.origins.slice(0, 4).join(', ')}${c.origins.length > 4 ? ` 외 ${c.origins.length - 4}` : ''}` +
        `  ·  ${age}시간 전  ·  소스 ${c.items.length}건`,
    );
  });
  console.log('─'.repeat(72) + '\n');
}
