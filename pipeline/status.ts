import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import matter from 'gray-matter';
import { RSS_FEEDS, REDDIT_SUBS } from './config.js';
import { seoulDateStamp } from './util.js';
import { loadReviews, recentWeaknesses } from './reviews.js';


/**
 * 발행 준비 상태 점검.
 *
 * 며칠에 걸쳐 반복 실행하는 작업이라, 매번 "지금 뭐가 설정돼 있고 뭐가 빠졌는지"를
 * 빠르게 확인할 수 있어야 한다. 특히 LLM 인증이 안 잡힌 상태로 돌리면 수집만 하고
 * 전부 실패하는데, 로그를 끝까지 봐야 알 수 있다. 그 전에 여기서 걸러 준다.
 */

const OK = '✓';
const NO = '✗';
const WARN = '·';

/** 애드센스 심사에서 '콘텐츠 부족'으로 반려되지 않으려면 대략 이 정도는 필요하다. */
const ADSENSE_TARGET_POSTS = 25;

type LlmAuth = 'ok' | 'no-cli' | 'no-credentials' | 'unknown';

/**
 * CLI 백엔드 인증 상태.
 *
 * 세 가지를 구분해서 돌려준다. 예전에는 boolean 하나였고 맥에서는 항상 true 였는데,
 * 그러면 한 번도 로그인하지 않은 사용자에게 '✓ 준비됨' 이라고 알려 준 뒤
 * "이제 npm run run 을 돌리세요" 라고 안내하게 된다. 그 실행은 수집을 다 마치고
 * 기사마다 전부 실패한다 — 이 점검이 막으려던 바로 그 상황이다.
 *
 * 맥은 자격증명을 파일이 아니라 키체인에 두므로 '없다'고 단정할 수 없다.
 * 그건 'unknown' 으로 정직하게 말한다.
 */
function claudeAuthState(): LlmAuth {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return 'ok';
  try {
    execFileSync('claude', ['--version'], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    });
  } catch {
    return 'no-cli';
  }
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  if (fs.existsSync(path.join(configDir, '.credentials.json'))) return 'ok';
  // 맥은 키체인에 저장한다. 파일이 없다고 로그인 안 한 것은 아니다.
  return process.platform === 'darwin' ? 'unknown' : 'no-credentials';
}

interface PostStat {
  date: string;
  category: string;
}

function readPosts(): PostStat[] {
  const dir = path.join(process.cwd(), 'content', 'posts');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { data } = matter(fs.readFileSync(path.join(dir, f), 'utf8'));
      const raw = data.date;
      const iso = raw instanceof Date ? raw.toISOString() : String(raw ?? '');
      return { date: iso, category: String(data.category ?? '') };
    });
}

function bar(done: number, total: number, width = 28): string {
  const filled = Math.min(width, Math.round((done / total) * width));
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export function printStatus() {
  const line = '─'.repeat(66);
  console.log(`\n${line}\n발행 준비 상태\n${line}`);

  // ── 1. LLM 인증 ──────────────────────────────────────────────
  const backend = (process.env.LLM_BACKEND || 'api').toLowerCase();
  const model = process.env.LLM_MODEL || 'claude-opus-5';
  console.log('\n[1] 글쓰기 엔진');

  let llmReady = false;
  if (backend === 'cli') {
    const auth = claudeAuthState();
    llmReady = auth !== 'no-cli' && auth !== 'no-credentials';
    const mark = auth === 'ok' ? OK : auth === 'unknown' ? WARN : NO;
    console.log(`  ${mark} 백엔드 cli (Claude 구독, 추가 과금 없음) · 모델 ${model}`);

    if (auth === 'no-cli') {
      console.log('      → `claude` 를 찾지 못했습니다. `npm i -g @anthropic-ai/claude-code` 로 설치하세요.');
    } else if (auth === 'no-credentials') {
      console.log('      → 로그인되어 있지 않습니다. `claude` 를 한 번 실행해 로그인하세요.');
    } else if (auth === 'unknown') {
      console.log('      로그인 여부는 확인하지 못했습니다(맥은 자격증명을 키체인에 둡니다).');
      console.log('      → 처음이라면 `claude` 를 한 번 실행해 로그인되어 있는지 확인하세요.');
    } else if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
      console.log('      CLAUDE_CODE_OAUTH_TOKEN 사용 중 (CI 겸용)');
    }
  } else {
    llmReady = Boolean(process.env.ANTHROPIC_API_KEY);
    console.log(`  ${llmReady ? OK : NO} 백엔드 api (Anthropic API) · 모델 ${model}`);
    if (!llmReady) {
      console.log('      → ANTHROPIC_API_KEY 가 없습니다.');
      console.log('      → 과금 없이 쓰려면 .env 에 LLM_BACKEND=cli 로 바꾸세요 (Claude 구독 사용).');
    }
  }

  // ── 2. 소스 ─────────────────────────────────────────────────
  console.log('\n[2] 수집 소스');
  console.log(`  ${OK} Hacker News · 키 불필요`);
  console.log(`  ${OK} RSS ${RSS_FEEDS.length}개 피드 (OpenAI·DeepMind·GeekNews 등) · 키 불필요`);

  const redditKeyed = Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
  console.log(
    `  ${redditKeyed ? OK : WARN} Reddit ${REDDIT_SUBS.length}개 서브 · ` +
      (redditKeyed ? 'OAuth' : 'RSS 폴백 (점수 정보 없음, 앱 키 넣으면 개선)'),
  );

  const naver = Boolean(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
  console.log(`  ${naver ? OK : WARN} Naver · ${naver ? '설정됨' : '미설정 (무료 발급 가능)'}`);
  console.log(
    `  ${process.env.X_BEARER_TOKEN ? OK : WARN} X · ` +
      (process.env.X_BEARER_TOKEN ? '설정됨' : '미설정 (유료 API — HN/Reddit 이 대체 커버)'),
  );
  console.log(
    `  ${process.env.FACEBOOK_PAGE_TOKEN ? OK : WARN} Facebook · ` +
      (process.env.FACEBOOK_PAGE_TOKEN ? '설정됨' : '미설정 (공개 검색 API 폐지됨)'),
  );

  // ── 3. 사이트 ───────────────────────────────────────────────
  console.log('\n[3] 사이트 설정');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
  const realDomain = siteUrl && !siteUrl.includes('example.com') && !siteUrl.includes('localhost');
  console.log(
    `  ${realDomain ? OK : NO} 도메인 · ${siteUrl || '(미설정)'}` +
      (realDomain ? '' : '  → 애드센스 신청 전에 실제 도메인으로 바꾸고 배포해야 합니다'),
  );
  const adsense = Boolean(process.env.NEXT_PUBLIC_ADSENSE_CLIENT);
  console.log(
    `  ${adsense ? OK : WARN} 애드센스 · ${adsense ? process.env.NEXT_PUBLIC_ADSENSE_CLIENT : '미설정 (승인 후 입력)'}`,
  );

  // ── 4. 콘텐츠 진행도 ─────────────────────────────────────────
  const posts = readPosts();
  const articles = posts.filter((p) => p.category !== '데일리');
  const digests = posts.length - articles.length;

  const byDay = new Map<string, number>();
  for (const p of articles) {
    if (!p.date) continue;
    const day = seoulDateStamp(new Date(p.date));
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  console.log('\n[4] 애드센스 신청 준비');
  console.log(
    `  기사 ${articles.length}건 / 목표 ${ADSENSE_TARGET_POSTS}건  ${bar(articles.length, ADSENSE_TARGET_POSTS)}`,
  );
  console.log(`  일간 브리핑 ${digests}건 · 발행일 ${byDay.size}일`);

  if (byDay.size > 0) {
    const recent = [...byDay.entries()].sort().slice(-5);
    console.log('  최근 발행: ' + recent.map(([d, n]) => `${d.slice(5)} ${n}건`).join(' · '));
  }

  // ── 5. 품질 ─────────────────────────────────────────────────
  const reviews = loadReviews();
  console.log('\n[5] 기사 품질');
  if (reviews.length === 0) {
    console.log('  · 아직 평가하지 않음 — `npm run evaluate` 로 루브릭 채점을 돌리세요');
  } else {
    const overall = reviews.reduce((s, r) => s + r.overall, 0) / reviews.length;
    const flagged = reviews.filter((r) => r.unsupported.length > 0).length;
    console.log(`  ${overall >= 4 ? OK : WARN} 종합 ${overall.toFixed(2)} / 5.00 (${reviews.length}건 평가)`);
    if (flagged) console.log(`  ${WARN} 근거 없는 주장이 지적된 기사 ${flagged}건 — \`npm run report\` 로 확인`);
    const weak = recentWeaknesses();
    if (weak.length) {
      console.log(`  · 다음 기사에 자동 반영될 보완 항목: ${weak.map((w) => w.name).join(', ')}`);
    }
  }

  // ── 다음 할 일 ──────────────────────────────────────────────
  console.log(`\n${line}\n다음 할 일\n${line}`);

  if (!llmReady) {
    console.log('  1. 글쓰기 엔진부터 연결하세요 (위 [1] 참고). 이게 없으면 수집만 되고 기사는 안 나옵니다.');
  } else if (articles.length < ADSENSE_TARGET_POSTS) {
    const remaining = ADSENSE_TARGET_POSTS - articles.length;
    const days = Math.ceil(remaining / 4);
    console.log(`  1. \`npm run run -- --limit 4\` 를 하루 1~2회, 약 ${days}일 더 실행하세요.`);
    console.log(`     (${remaining}건 남음. 화제성이 낮은 날은 4건이 안 나올 수 있습니다 — 정상입니다.)`);
    console.log('  2. 발행된 글을 직접 읽어 보세요. 사실 오류가 있으면 그 파일을 지우거나 고치세요.');
    if (!realDomain) console.log('  3. 그동안 도메인을 준비해 NEXT_PUBLIC_SITE_URL 에 넣고 배포해 두세요.');
  } else {
    console.log('  1. 기사 수는 충분합니다. 이제 애드센스를 신청하세요.');
    console.log('  2. Search Console 에 사이트맵 제출: ' + `${siteUrl || '<도메인>'}/sitemap.xml`);
    if (!adsense) console.log('  3. 승인되면 NEXT_PUBLIC_ADSENSE_* 값을 채우고 다시 배포하세요.');
  }
  console.log('');
}
