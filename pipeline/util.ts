import { AI_KEYWORDS } from './config.js';

export const UA =
  process.env.REDDIT_USER_AGENT || 'web:ai-news-kr:v1.0 (news aggregator)';

/** 로그에 남으면 안 되는 쿼리 파라미터. 값을 통째로 가린다. */
const SECRET_PARAMS =
  /^(access_token|token|api_?key|key|client_secret|secret|password|passwd|pwd|bearer|auth|signature|sig)$/i;

/**
 * 로그에 URL 을 찍기 전에 반드시 통과시킨다.
 *
 * 실패 응답과 타임아웃은 그대로 stdout 에 나가고, GitHub Actions 에서는 그게 실행 로그가
 * 된다. 토큰을 쿼리로 붙여 보낸 요청이 하나라도 있으면 그 로그에 토큰이 평문으로 남는다
 * (Secret 마스킹은 등록된 값 그대로일 때만 동작하므로 URL 인코딩된 형태는 걸러지지 않는다).
 */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    let touched = false;
    for (const key of [...u.searchParams.keys()]) {
      if (!SECRET_PARAMS.test(key)) continue;
      u.searchParams.set(key, '***');
      touched = true;
    }
    return touched ? u.toString() : raw;
  } catch {
    // URL 로 파싱되지 않으면 토큰처럼 보이는 부분만 지운다.
    return raw.replace(
      /([?&](?:access_token|token|api_?key|key|client_secret|secret|password|bearer|auth|signature|sig)=)[^&\s]*/gi,
      '$1***',
    );
  }
}

/**
 * 헤더 수신 + 본문 읽기까지 전부 타임아웃 안에서 처리한다.
 *
 * safeFetch 는 응답 헤더가 오는 순간 타이머를 해제한다. 그래서 그것만 쓰면
 * "200 을 준 뒤 본문을 흘려보내지 않는" 서버(안티봇 페이지에서 흔하다)를 만났을 때
 * await res.text() 가 무한정 매달린다. 30분 주기 작업에서 이러면 25분 타임아웃을
 * 통째로 태우고 실행이 죽는다. 그래서 본문 읽기를 같은 AbortController 아래에 둔다.
 */
async function fetchWithBody<T>(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  read: (res: Response) => Promise<T>,
): Promise<T | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ac.signal,
      headers: {
        'User-Agent': UA,
        Accept: '*/*',
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!res.ok) {
      console.warn(`  ! ${res.status} ${res.statusText} — ${redactUrl(url)}`);
      return null;
    }
    return await read(res);
  } catch (err) {
    const msg = (err as Error).name === 'AbortError' ? `타임아웃 ${timeoutMs}ms` : (err as Error).message;
    console.warn(`  ! fetch 실패 — ${redactUrl(url)}: ${msg}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<T | null> {
  return fetchWithBody(url, init, timeoutMs, (res) => res.json() as Promise<T>);
}

export function fetchText(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<string | null> {
  return fetchWithBody(url, init, timeoutMs, (res) => res.text());
}

/**
 * 없애도 되는 추적용 쿼리 파라미터.
 *
 * `utm_` 는 접두사로 봐야 한다. `^(utm_|...)$` 로 두면 정확히 "utm_" 이라는 이름만
 * 걸리고 정작 utm_source/utm_medium/utm_campaign 은 그대로 남는다. 그러면 같은 기사가
 * 한 피드에서는 UTM 을 달고, 다른 피드에서는 깨끗하게 들어와 서로 다른 URL 로 취급되어
 * 중복 발행 방어선(cluster 의 sameUrl, state 의 urlSet)이 그대로 뚫린다.
 *
 * 반대로 `s` 와 `t` 는 빼야 한다. 너무 흔한 이름이라 유튜브 `?t=1200`(재생 위치)이나
 * 워드프레스 `?s=`(검색어) 처럼 의미 있는 값까지 지워 버린다. 그 망가진 URL 이
 * 기사 하단 출처 링크와 JSON-LD citation 에 그대로 실려 독자가 클릭하게 된다.
 */
const TRACKING_PARAMS =
  /^(utm_[a-z_]*|fbclid|gclid|igshid|mc_cid|mc_eid|msclkid|yclid|ref|ref_src|ref_url)$/i;

/** 같은 기사를 가리키는 URL 을 한 형태로 모은다. 중복 발행 방지의 1차 방어선. */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
    }
    u.hostname = u.hostname.replace(/^www\./, '');
    u.protocol = 'https:';
    let path = u.pathname.replace(/\/+$/, '');
    if (path === '') path = '/';
    u.pathname = path;
    return u.toString();
  } catch {
    return raw;
  }
}

/**
 * "원문이 아닌" 링크들. 대표 링크로 골라서도 안 되고 본문 추출 대상이어서도 안 된다.
 *
 * 두 종류가 있다.
 *   · 토론 페이지 — 레딧·HN·X·긱뉴스. 원문이 아니라 반응이 모이는 곳이다.
 *   · 뉴스 수집기 — news.google.com/rss/articles/... 는 실제 기사가 아니라
 *     자바스크립트 중간 페이지다. 받아 봐야 헤드라인 목록만 나온다(실측 161~281자).
 *     그 상태로 기사를 쓰면 제목만 보고 쓴 글이 된다.
 *
 * 한 곳에서만 정의한다. 예전에 cluster.ts 가 이보다 좁은 목록을 따로 갖고 있어서
 * twitter.com 글이 primaryUrl 로 뽑혔고, extract 는 그 URL 을 건너뛰어
 * 본문이 빈 채로 기사가 발행된 적이 있다.
 */
export const NON_ORIGINAL_HOSTS =
  /reddit\.com|news\.ycombinator\.com|x\.com|twitter\.com|news\.hada\.io|news\.google\.com/;

export function isNonOriginalUrl(url: string): boolean {
  return NON_ORIGINAL_HOSTS.test(url || '');
}

export function domainOf(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with', 'is',
  'are', 'was', 'were', 'be', 'by', 'at', 'from', 'as', 'it', 'its', 'this',
  'that', 'new', 'now', 'how', 'why', 'what', 'you', 'your', 'we', 'our',
  'show', 'hn', 'ask', 'says', 'said', 'about', 'has', 'have',
]);

/**
 * 한국어 조사를 떼어 낸다.
 *
 * 조사가 붙은 채로 비교하면 같은 단어가 다른 토큰이 된다. 실제 측정:
 *   "딥시크의 새 모델이 공개됐다" vs "딥시크는 새 모델을 공개했다"
 *   조사 제거 전 유사도 0.00 → 제거 후 0.50
 * 한국어가 주 언어인 사이트라 클러스터링과 아카이브 매칭 양쪽에 효과가 있다.
 *
 * 형태소 분석기를 쓰지 않는 이유: 의존성이 무겁고 제목 매칭에는 과하다.
 *
 * 어간이 2글자 이상 남을 때만 떼어 낸다. "가치"를 "가"로 자르는 사고를 막기 위해서다.
 * 대신 "글을"→"글" 같은 1음절 어간은 처리되지 않는데, 그런 단어(글·말·값)는
 * 너무 일반적이라 매칭 신호로도 쓸모가 없어서 손해가 아니다.
 */
const KO_PARTICLES = [
  '으로써', '으로서', '에서는', '에게서', '이라는', '라는', '으로', '에게', '에서',
  '까지', '부터', '보다', '처럼', '조차', '마저', '한테', '이나', '나마',
  '은', '는', '이', '가', '을', '를', '의', '에', '도', '만', '와', '과', '로',
];

function stripParticle(token: string): string {
  if (!/[가-힣]$/.test(token)) return token;
  for (const p of KO_PARTICLES) {
    if (token.length - p.length >= 2 && token.endsWith(p)) return token.slice(0, -p.length);
  }
  return token;
}

/** 제목을 비교 가능한 토큰 집합으로. 한글은 조사 제거, 영문은 stopword 제거. */
export function titleTokens(title: string): Set<string> {
  const tokens = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stripParticle)
    .filter((t) => t.length > 1);
  return new Set(tokens);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

/**
 * 두 제목이 같은 사건을 가리키는지 판정.
 *
 * Jaccard 만 쓰면 길이가 다른 제목을 못 붙인다. 실제 사례:
 *   A "Nvidia AVO scores 100% on the ARC-AGI-3 interactive reasoning benchmark"
 *   B "NVIDIA AVO got 100% on ARC-AGI-3. It completed all 183 levels across..."
 * 공통 토큰이 nvidia/avo/100/arc/agi 5개나 되는데 B 가 길어서 Jaccard 는 0.29 밖에 안 나온다.
 *
 * 그래서 포함계수(공통 / 짧은 쪽 크기)를 함께 본다. 위 예시는 5/9 = 0.56 으로 잡힌다.
 * 다만 포함계수는 짧은 제목끼리 과하게 붙는 경향이 있어서 "공통 토큰 3개 이상"을
 * 최소 조건으로 건다 — 'OpenAI' 하나만 겹치는 서로 다른 뉴스가 뭉치는 걸 막는다.
 */
export function isSameStory(a: Set<string>, b: Set<string>, minJaccard: number, minOverlap: number): boolean {
  if (a.size === 0 || b.size === 0) return false;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  if (shared < 3) return false;

  const jaccardScore = shared / (a.size + b.size - shared);
  const overlap = shared / Math.min(a.size, b.size);
  return jaccardScore >= minJaccard || overlap >= minOverlap;
}

/**
 * 짧은 영문 키워드는 단어 경계를 강제한다.
 * 안 그러면 "K-agi", "tr-ai-ning", "s-ai-d" 같은 우연한 부분 문자열이 전부 AI 뉴스로 잡힌다.
 * (실제로 "Kagi added a setting…" 이 'agi' 로 걸려 들어왔다.)
 * 한글 키워드는 충분히 길어서 부분 문자열 매칭으로도 안전하다.
 */
export function keywordMatcher(kw: string): (lower: string) => boolean {
  if (/[가-힣]/.test(kw)) return (lower: string) => lower.includes(kw);
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, (m) => `\\${m}`);
  const re = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
  return (lower: string) => re.test(lower);
}

const AI_MATCHERS: ((lower: string) => boolean)[] = AI_KEYWORDS.map(keywordMatcher);

export function isAiRelated(text: string): boolean {
  const lower = text.toLowerCase();
  return AI_MATCHERS.some((match) => match(lower));
}

/**
 * 개인 질문·도움 요청 글인지.
 *
 * 커뮤니티에는 "내 GPU 두 장에서 llama.cpp 가 안 돌아요" 같은 글이 늘 상위권에 있다.
 * 화제성 점수는 뉴스와 구분하지 못하지만, 일반 독자에게는 아무 값어치가 없고
 * 검증된 정보도 없다. 실제로 LLM 독자가치 판정에서 2/10 을 받고 버려졌는데,
 * 그 판정까지 가는 데도 호출 비용이 든다. 제목만 봐도 알 수 있으니 여기서 끊는다.
 */
const HELP_PATTERNS = [
  /^(help|need help|need support|question|advice|noob|beginner)\b/i,
  /^(how (do|can|to)|what('s| is) the best|anyone (else|know|using|tried)|is (it|there)|should i|can i|why (do|does|is|am))\b/i,
  /\b(my setup|my rig|my build|any (recommendations|suggestions|ideas)|looking for (advice|help|recommendations))\b/i,
  /^(request|rant|discussion|weekly|daily) (thread|megathread)/i,
];

export function isHelpRequest(title: string): boolean {
  const t = title.trim();
  if (HELP_PATTERNS.some((re) => re.test(t))) return true;
  // 물음표로 끝나면서 고유명사(모델명·회사명)가 없으면 대개 개인 질문이다.
  // 'Is GPT-5.6 actually cheaper?' 같은 건 뉴스성이 있으므로 살린다.
  return t.endsWith('?') && !/[A-Z][a-zA-Z]*[-.\d]|[A-Z]{2,}/.test(t.replace(/^\w+\s/, ''));
}

export function detectLang(text: string): 'ko' | 'en' | 'other' {
  const hangul = (text.match(/[가-힣]/g) || []).length;
  if (hangul / Math.max(text.length, 1) > 0.15) return 'ko';
  if (/[a-zA-Z]/.test(text)) return 'en';
  return 'other';
}

export function hoursAgo(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** 한국어 제목 → URL 슬러그. 한글은 그대로 두면 SEO 에 유리하다. */
const BACKSLASH = String.fromCharCode(92);

/**
 * 프론트매터에 넣을 값을 큰따옴표로 감싼다.
 *
 * 발행(publish)·다이제스트(digest)·개정(revise) 세 곳이 같은 프론트매터를 쓴다.
 * 규칙이 갈라지면 같은 제목이 파일마다 다르게 인용되어 gray-matter 파싱이 어긋난다.
 * 줄바꿈을 공백으로 바꾸는 건 YAML 한 줄 스칼라를 유지하기 위해서다.
 */
export function yamlEscape(value: string): string {
  const escaped = value
    .split(BACKSLASH).join(BACKSLASH + BACKSLASH)
    .split('"').join(BACKSLASH + '"')
    .split('\n').join(' ')
    .split('\r').join('');
  return `"${escaped}"`;
}

/**
 * 본문을 문장 단위로 자른다.
 *
 * readability(문장 길이)와 humanize(종결어미 다양성)가 같은 본문을 재는데,
 * 예전에는 사본이 갈라져 한쪽만 '。'를 문장 끝으로 인정했다. 두 측정값은 같은
 * 평가 프롬프트에 나란히 들어가므로, 문장 집합이 다르면 심사원에게 서로 어긋나는
 * 수치를 같은 글에 대한 것처럼 내놓게 된다.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 70)
    .replace(/-$/, '');
}

/**
 * 한국 시각 기준 'YYYY-MM-DD'.
 *
 * toISOString() 을 쓰면 안 되는 이유: 그건 UTC 기준이라, 한국 시각 새벽 1시에 쓴 글이
 * 전날 날짜를 달게 된다. 실제로 제목은 "8월 22일"인데 주소는 2026-08-21 로 어긋났다.
 * GitHub Actions 러너는 UTC 로 돌기 때문에 로컬 시각을 그냥 쓰는 것도 답이 아니다.
 * 독자가 한국에 있으므로 서울 시각으로 고정한다. (KST 는 서머타임이 없어 항상 UTC+9)
 */
export function seoulDateStamp(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** 서울 시각 기준 그날 0시의 UTC 타임스탬프. */
export function seoulDayStart(d: Date = new Date()): Date {
  return new Date(`${seoulDateStamp(d)}T00:00:00+09:00`);
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 동시 실행 개수를 제한하며 매핑. 소스 서버에 부담 주지 않기 위함. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  // 객체에 담는다. 지역 변수로 두면 TypeScript 가 클로저 안의 대입을 못 보고
  // 아래에서 타입을 never 로 좁혀 버린다.
  const state: { failed: boolean; err: unknown } = { failed: false, err: null };

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      // 누가 이미 실패했으면 새 작업을 집지 않는다.
      // 사용량 한도로 멈추는 경우, 남은 항목을 계속 처리해 봐야 전부 같은 이유로 실패한다.
      if (state.failed) return;
      const i = cursor++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        if (!state.failed) { state.failed = true; state.err = err; }
        return;
      }
    }
  });

  // 반드시 전원이 끝난 뒤에 던진다.
  // 예전에는 Promise.all 이 첫 실패로 곧장 reject 했는데, 그때 다른 워커들은 아직
  // 돌고 있었다. 호출부는 "여기까지 저장합니다" 하며 결과를 저장했지만 뒤늦게 끝난
  // 워커의 결과는 이미 지나간 저장 루프를 타지 못했다 — 파일은 고쳐졌는데
  // 기록은 옛 값 그대로라, 다음 실행이 같은 기사를 또 손봤다.
  await Promise.all(workers);
  if (state.failed) throw state.err;
  return results;
}
