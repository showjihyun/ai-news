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

/**
 * 발행 기록 캐시.
 *
 * isAlreadyPublished 는 클러스터마다 불린다(보통 40~80회, digest 에서 또 한 번).
 * 매번 파일을 읽고 JSON 을 파싱하고 저장된 제목 전부를 다시 토큰화하면
 * 한 번 실행에 파일 읽기 수백 번, 토큰화 수만 번이 된다.
 * 파일은 이 프로세스만 건드리므로 한 번 읽어 두고, 쓸 때만 무효화한다.
 */
let cached: State | null = null;
let cachedTokens: Set<string>[] | null = null;

function load(): State {
  if (cached) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')) as State;
  } catch {
    cached = { records: [] };
  }
  cachedTokens = null;
  return cached;
}

/** 저장된 제목의 토큰 집합. 한 번만 만들어 재사용한다. */
function recordTokens(state: State): Set<string>[] {
  if (!cachedTokens || cachedTokens.length !== state.records.length) {
    cachedTokens = state.records.map((r) => titleTokens(r.title));
  }
  return cachedTokens;
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
  const recTokens = recordTokens(state);
  const urlSet = new Set(urls);
  const tokens = titleTokens(title);

  for (let i = 0; i < state.records.length; i++) {
    const rec = state.records[i];
    if (rec.urls.some((u) => urlSet.has(u))) return rec;
    if (jaccard(recTokens[i], tokens) >= 0.55) return rec;
  }
  return null;
}

export function markPublished(rec: PublishedRecord) {
  const state = load();
  state.records.unshift(rec);
  save(state);
  cachedTokens = null;   // 목록이 바뀌었으니 토큰도 다시 만든다
}

export function publishedCount(): number {
  return load().records.length;
}
