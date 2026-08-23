import fs from 'node:fs';
import path from 'node:path';
import type { RawItem } from '../types.js';
import { fetchText, canonicalUrl, sleep } from '../util.js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const CACHE_PATH = path.join(process.cwd(), 'data', 'geeknews-links.json');

/**
 * 토픽 ID → 원문 URL 캐시.
 *
 * news.hada.io 는 IP 단위로 공격적인 레이트리밋을 건다(연속 십여 건이면 403).
 * 한 번 알아낸 원문 주소는 바뀌지 않으므로 디스크에 남겨 두고 다시는 요청하지 않는다.
 * 실패한 것도 기록해서(빈 문자열) 매 실행마다 같은 벽에 부딪히지 않게 한다.
 */
function loadCache(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

function saveCache(cache: Record<string, string>) {
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n', 'utf8');
}

/**
 * GeekNews 항목의 원문(대개 영문) 주소를 찾아 채워 넣는다.
 *
 * 왜 필요한가: GeekNews RSS 는 link 로 news.hada.io/topic?id=... 만 준다. 그러면
 * 같은 사건의 영문 기사(Hacker News, TechCrunch 등)와 URL 이 달라서 별개 이슈로 갈린다.
 * 실제로 "AI companies destroy physical books" 와 그 한국어 번역판이 각각 4위·5위에
 * 따로 올라왔다 — 같은 뉴스를 두 번 발행할 뻔한 상황이다.
 *
 * 토픽 페이지의 제목 링크(class="topic-title-link")가 원문 주소라서, 그것만 뽑아
 * item.url 로 바꿔 주면 URL 일치만으로 영·한 클러스터가 자동으로 합쳐진다.
 * permalink 는 GeekNews 주소 그대로 둬서 출처 표기와 토론 링크를 잃지 않는다.
 */
export async function enrichGeekNews(items: RawItem[]): Promise<void> {
  const targets = items.filter(
    (i) => i.source === 'geeknews' && i.url.includes('news.hada.io/topic'),
  );
  if (targets.length === 0) return;

  const cache = loadCache();
  let fromCache = 0;
  let fetched = 0;
  let blocked = 0;
  let unparsed = 0;   // 마크업이 바뀌어 못 읽은 건수. 캐시에 굳히지 않고 다음에 재시도한다.
  let dirty = false;

  // 의도적으로 순차 처리한다. 병렬로 던지면 레이트리밋에 걸려 전부 403 이 된다.
  for (const item of targets) {
    const topicId = item.url.match(/id=(\d+)/)?.[1];
    if (!topicId) continue;

    if (topicId in cache) {
      const cached = cache[topicId];
      if (cached) {
        item.url = cached;
        fromCache++;
      }
      continue;
    }

    const html = await fetchText(item.url, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
      },
    });

    if (!html) {
      // 차단당한 것이므로 캐시에 negative 를 남기지 않는다. 다음 실행에서 다시 시도할 값어치가 있다.
      blocked++;
      await sleep(3000);
      continue;
    }

    /**
     * 원문 링크를 뽑는다. 속성 순서가 바뀌어도 잡히도록 두 가지로 본다.
     * (예전에는 href 가 class 보다 앞에 오는 형태 하나만 봤다)
     */
    const original =
      html.match(/<a\s+[^>]*href=['"]([^'"]+)['"][^>]*class=['"][^'"]*topic-title-link/i)?.[1] ??
      html.match(/<a\s+[^>]*class=['"][^'"]*topic-title-link[^'"]*['"][^>]*href=['"]([^'"]+)['"]/i)?.[1];

    if (original && /^https?:\/\//i.test(original) && !original.includes('news.hada.io')) {
      cache[topicId] = canonicalUrl(original);
      item.url = cache[topicId];
      fetched++;
      dirty = true;
    } else if (/topic-title-link/i.test(html)) {
      // 링크 자리는 있는데 주소가 없다 = GeekNews 자체 글(Show GN 등). 원문이 없는 게 맞다.
      // 이런 것만 영구 캐시에 남겨 재시도를 막는다.
      cache[topicId] = '';
      dirty = true;
    } else {
      /**
       * 마크업이 통째로 달라져서 못 읽은 경우다. 여기서 빈 값을 캐시에 굳히면
       * (파일은 커밋되어 CI 실행 간에도 살아남는다) 다시는 시도하지 않게 되어
       * 원문 URL 보강이 영영 꺼진다. 그러면 한국어/영어 클러스터가 안 붙어
       * 같은 뉴스를 두 번 발행하게 된다 — 이 모듈이 막으려던 바로 그 문제다.
       * 캐시에 남기지 않고 다음 실행에서 다시 시도한다.
       */
      unparsed++;
    }
    await sleep(1500); // 레이트리밋 회피
  }

  if (dirty) saveCache(cache);
  console.log(
    `  · GeekNews 원문 링크: 캐시 ${fromCache}건, 신규 ${fetched}건` +
      (blocked ? `, 차단 ${blocked}건(다음 실행에 재시도)` : '') +
      // 이게 계속 찍히면 topic-title-link 마크업이 바뀐 것이다. 조용히 죽지 않도록 알린다.
      (unparsed ? `, ⚠ 링크를 못 읽음 ${unparsed}건(마크업 변경 의심 — 다음 실행에 재시도)` : ''),
  );
}
