import fs from 'node:fs';
import path from 'node:path';
import { titleTokens, jaccard } from './util.js';

const STATE_PATH = path.join(process.cwd(), 'data', 'published.json');

export interface PublishedRecord {
  slug: string;
  title: string;
  urls: string[];
  publishedAt: string;
}

interface State {
  records: PublishedRecord[];
}

function load(): State {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as State;
  } catch {
    return { records: [] };
  }
}

function save(state: State) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  // 90일 넘은 기록은 버린다 — 무한정 커지면 비교 비용이 늘고, 그쯤이면 재발행해도 무방하다.
  const cutoff = Date.now() - 90 * 24 * 3_600_000;
  state.records = state.records.filter((r) => new Date(r.publishedAt).getTime() > cutoff);
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

/**
 * 이미 쓴 뉴스인지 판정. 같은 사건을 두 번 발행하면 독자도 떠나고
 * 구글은 중복 콘텐츠로 보고 색인에서 뺀다 — 애드센스 수익에 직결되는 문제.
 */
export function isAlreadyPublished(urls: string[], title: string): PublishedRecord | null {
  const state = load();
  const urlSet = new Set(urls);
  const tokens = titleTokens(title);

  for (const rec of state.records) {
    if (rec.urls.some((u) => urlSet.has(u))) return rec;
    if (jaccard(titleTokens(rec.title), tokens) >= 0.55) return rec;
  }
  return null;
}

export function markPublished(rec: PublishedRecord) {
  const state = load();
  state.records.unshift(rec);
  save(state);
}

export function publishedCount(): number {
  return load().records.length;
}
