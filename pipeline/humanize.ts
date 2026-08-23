/**
 * "사람이 쓴 글 같은가" 기계 측정.
 *
 * AI 티는 상투구보다 **구조**에서 난다. 실제로 이 사이트 기사들을 재 보니
 * 금지어는 이미 거의 없는데도 글이 균질했다. 원인은 이런 것들이다.
 *
 *   - 모든 문장이 비슷한 길이 (사람은 툭 던지는 짧은 문장을 섞는다)
 *   - 종결어미가 '~습니다' 하나로 통일
 *   - 모든 문단이 같은 부피
 *   - 기자의 판단이 없고 정보만 나열
 *
 * 아이러니하지만, 가독성 규칙(문단 2~3문장, 불릿, 강조)을 강하게 걸수록
 * 이 균질함이 심해진다. 두 목표가 충돌하므로 둘 다 재서 균형을 잡아야 한다.
 */

import { splitSentences } from './util.js';

export interface HumanMetrics {
  sentenceCount: number;
  /** 문장 길이 표준편차. 낮을수록 기계적이다. */
  lengthStdev: number;
  /** 20자 이하 짧은 문장 비율. 사람 글에는 리듬을 끊는 짧은 문장이 있다. */
  shortSentenceRatio: number;
  /** 서로 다른 종결어미 종류 수. */
  endingVariety: number;
  /** 가장 많이 쓰인 종결어미의 점유율. 0.9 면 거의 한 가지로만 끝난다는 뜻. */
  dominantEndingRatio: number;
  /** 문단 길이 표준편차. */
  paragraphStdev: number;
  /** 전체 줄 대비 불릿 비율. 너무 높으면 기사가 아니라 목록처럼 읽힌다. */
  bulletRatio: number;
  /** 발견된 AI 상투구. */
  cliches: string[];
}

/**
 * AI 글에서 유독 자주 나오는 표현들.
 *
 * 하나하나는 정상적인 한국어지만, 뭉쳐 나오면 특유의 '보고서 톤'을 만든다.
 * 특히 '이는 ~', '것으로 보입니다', '~할 필요가 있습니다' 세 개가 문단마다 나오면
 * 사람이 쓴 글로 읽히지 않는다.
 */
const CLICHES = [
  '라고 할 수 있습니다', '할 수 있을 것입니다', '주목할 필요가', '주목받고 있',
  '살펴보겠습니다', '정리하자면', '요약하자면', '다양한 ', '여러 가지',
  '중요한 것은', '셈입니다', '전망입니다', '기대를 모으', '귀추가 주목',
  '것으로 보입니다', '필요가 있습니다', '시사합니다', '의미가 있습니다',
  '눈길을 끌', '화제를 모으', '~에 대한 관심이', '평가받고 있',
];

/** 문장 끝에서 종결어미를 뽑아낸다. */
function endingOf(sentence: string): string {
  const trimmed = sentence.trim();
  // 물음표 판정은 문장부호를 떼어 내기 '전에' 해야 한다.
  // 예전에는 replace 로 ?를 먼저 지운 뒤 endsWith('?') 를 봐서 이 분기가 절대 안 걸렸고,
  // 의문형이 전부 '체언'으로 세어졌다. 그래서 종결어미 다양성이 실제보다 낮게 나오고,
  // 글쓴이가 이미 의문형을 썼는데도 "물을 땐 의문형을 쓰세요" 지적이 계속 붙었다.
  if (/\?["')\]]*$/.test(trimmed)) return '의문';
  const t = trimmed.replace(/[.!?"')\]]+$/, '');
  const tail = t.slice(-4);
  for (const e of ['습니다', '입니다', '됩니다', '합니다', '했다', '이다', '한다', '있다', '없다']) {
    if (tail.endsWith(e)) return e;
  }
  // 체언으로 끝나면(명사 종결) 사람 글에서 리듬을 바꾸는 장치로 자주 쓰인다.
  return /[가-힣]$/.test(t) ? '체언' : '기타';
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

export function measureHuman(body: string): HumanMetrics {
  const lines = body.split('\n');
  const bulletLines = lines.filter((l) => /^\s*([-*+]|\d+\.)\s/.test(l)).length;
  const contentLines = lines.filter((l) => l.trim() && !/^#{1,6}\s/.test(l)).length;

  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !/^#{1,6}\s/.test(p) && !/^\s*([-*+]|\d+\.)\s/.test(p));

  const sentences = paragraphs.flatMap(splitSentences);
  const lengths = sentences.map((s) => s.replace(/\s/g, '').length);

  const endings = sentences.map(endingOf);
  const endingCounts = new Map<string, number>();
  for (const e of endings) endingCounts.set(e, (endingCounts.get(e) ?? 0) + 1);
  const dominant = Math.max(0, ...endingCounts.values());

  const lower = body.toLowerCase();
  const cliches = CLICHES.filter((c) => lower.includes(c.replace('~', '')));

  return {
    sentenceCount: sentences.length,
    lengthStdev: Math.round(stdev(lengths) * 10) / 10,
    shortSentenceRatio: sentences.length ? lengths.filter((n) => n <= 20).length / sentences.length : 0,
    endingVariety: endingCounts.size,
    dominantEndingRatio: sentences.length ? dominant / sentences.length : 0,
    paragraphStdev: Math.round(stdev(paragraphs.map((p) => p.replace(/\s/g, '').length)) * 10) / 10,
    bulletRatio: contentLines ? bulletLines / contentLines : 0,
    cliches,
  };
}

/** 사람 글처럼 보이지 않게 만드는 지점들. */
export function humanIssues(m: HumanMetrics): string[] {
  const issues: string[] = [];

  if (m.dominantEndingRatio > 0.75) {
    issues.push(
      `문장의 ${Math.round(m.dominantEndingRatio * 100)}%가 같은 어미로 끝납니다. ` +
        '단정할 땐 "~다", 물을 땐 의문형, 짚을 땐 체언 종결을 섞으세요.',
    );
  }
  if (m.endingVariety <= 2 && m.sentenceCount > 8) {
    issues.push(`종결어미가 ${m.endingVariety}종류뿐입니다. 최소 4종류는 섞이는 게 자연스럽습니다.`);
  }
  if (m.lengthStdev < 18 && m.sentenceCount > 8) {
    issues.push(
      `문장 길이가 지나치게 고릅니다(표준편차 ${m.lengthStdev}). ` +
        '긴 설명 뒤에 짧은 한 문장을 툭 놓아 리듬을 끊으세요.',
    );
  }
  if (m.shortSentenceRatio < 0.12 && m.sentenceCount > 8) {
    issues.push(
      `20자 이하 짧은 문장이 ${Math.round(m.shortSentenceRatio * 100)}%뿐입니다. ` +
        '핵심을 짧게 못 박는 문장이 있어야 사람이 쓴 글로 읽힙니다.',
    );
  }
  if (m.bulletRatio > 0.35) {
    issues.push(
      `본문의 ${Math.round(m.bulletRatio * 100)}%가 불릿입니다. 기사가 아니라 목록처럼 읽힙니다. ` +
        '설명이 필요한 대목은 문장으로 풀어 쓰세요.',
    );
  }
  if (m.cliches.length >= 3) {
    issues.push(`AI 글에 흔한 표현이 겹칩니다: ${m.cliches.slice(0, 5).join(', ')}. 다른 말로 바꾸세요.`);
  }

  return issues;
}

export function humanSummary(m: HumanMetrics): string {
  return (
    `문장 ${m.sentenceCount}개 · 길이 편차 ${m.lengthStdev} · ` +
    `짧은문장 ${Math.round(m.shortSentenceRatio * 100)}% · ` +
    `종결어미 ${m.endingVariety}종(최다 ${Math.round(m.dominantEndingRatio * 100)}%) · ` +
    `문단 편차 ${m.paragraphStdev} · 불릿 ${Math.round(m.bulletRatio * 100)}%` +
    (m.cliches.length ? ` · 상투구 ${m.cliches.length}종` : '')
  );
}
