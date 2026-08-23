/**
 * 가독성 기계 측정.
 *
 * 왜 LLM 에만 맡기지 않는가: "읽기 편한가"의 상당 부분은 세어 보면 알 수 있다.
 * 문단이 몇 줄인지, 한 문장이 몇 글자인지, 소제목 간격이 얼마나 되는지는 객관적 수치다.
 * 이걸 코드로 재면 (a) 비용이 0이고 (b) 매번 같은 기준으로 나오며
 * (c) LLM 심사원에게 "이 글은 평균 문장이 78자입니다" 같은 근거를 쥐여 줄 수 있다.
 *
 * 기준값은 한국어 모바일 읽기를 전제로 잡았다. 대부분 휴대폰에서 읽는다.
 */

import { splitSentences } from './util.js';

export interface ReadabilityMetrics {
  /** 공백 제외 본문 길이 */
  charCount: number;
  sectionCount: number;
  paragraphCount: number;
  sentenceCount: number;
  avgSentenceChars: number;
  longestSentenceChars: number;
  /** 4문장 이상인 문단 수 — 모바일에서 벽처럼 보인다 */
  wallParagraphs: number;
  /** 120자 넘는 문장 수 — 한 번에 못 읽는다 */
  longSentences: number;
  /** 목록·표를 쓴 횟수. 비교·나열은 문단보다 목록이 낫다 */
  listBlocks: number;
  /** 강조(**) 사용 횟수 — 아예 없으면 훑어보기가 어렵다 */
  emphasisCount: number;
  /** 소제목 사이 평균 글자 수 — 너무 길면 중간에 놓친다 */
  avgSectionChars: number;
}

const LIMITS = {
  sentenceChars: 120,
  paragraphSentences: 4,
  sectionChars: 900,
};

export function measure(body: string): ReadabilityMetrics {
  const lines = body.split('\n');

  const sectionCount = lines.filter((l) => /^##\s/.test(l)).length;
  const listBlocks = lines.filter((l) => /^\s*([-*+]|\d+\.)\s/.test(l)).length;
  const emphasisCount = (body.match(/\*\*[^*]+\*\*/g) || []).length;

  // 문단 = 빈 줄로 구분된 덩어리 중 소제목·목록·인용이 아닌 것
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p && !/^#{1,6}\s/.test(p) && !/^\s*([-*+]|\d+\.)\s/.test(p) && !/^>/.test(p));

  const sentences = paragraphs.flatMap(splitSentences);
  const sentenceLengths = sentences.map((s) => s.replace(/\s/g, '').length);
  const charCount = body.replace(/\s/g, '').length;

  return {
    charCount,
    sectionCount,
    paragraphCount: paragraphs.length,
    sentenceCount: sentences.length,
    avgSentenceChars: sentences.length
      ? Math.round(sentenceLengths.reduce((a, b) => a + b, 0) / sentences.length)
      : 0,
    longestSentenceChars: sentenceLengths.length ? Math.max(...sentenceLengths) : 0,
    wallParagraphs: paragraphs.filter((p) => splitSentences(p).length > LIMITS.paragraphSentences)
      .length,
    longSentences: sentenceLengths.filter((n) => n > LIMITS.sentenceChars).length,
    listBlocks,
    emphasisCount,
    avgSectionChars: sectionCount ? Math.round(charCount / sectionCount) : charCount,
  };
}

/**
 * 사람이 읽기 불편한 지점들. 재작성 프롬프트에 그대로 넣는다.
 * 빈 배열이면 기계적으로는 문제가 없다는 뜻 (문체까지 좋다는 뜻은 아니다).
 */
export function readabilityIssues(m: ReadabilityMetrics): string[] {
  const issues: string[] = [];

  if (m.wallParagraphs > 0) {
    issues.push(
      `${m.wallParagraphs}개 문단이 ${LIMITS.paragraphSentences}문장을 넘습니다. ` +
        '휴대폰에서 글자 벽으로 보입니다. 한 문단은 2~3문장으로 끊으세요.',
    );
  }
  if (m.longSentences > 0) {
    issues.push(
      `${m.longSentences}개 문장이 ${LIMITS.sentenceChars}자를 넘습니다(가장 긴 문장 ${m.longestSentenceChars}자). ` +
        '접속사에서 끊어 두 문장으로 나누세요.',
    );
  }
  if (m.avgSentenceChars > 70) {
    issues.push(`평균 문장 길이가 ${m.avgSentenceChars}자로 깁니다. 50~60자를 목표로 줄이세요.`);
  }
  if (m.avgSectionChars > LIMITS.sectionChars) {
    issues.push(
      `소제목 사이 분량이 평균 ${m.avgSectionChars}자로 깁니다. 소제목을 더 넣어 호흡을 끊으세요.`,
    );
  }
  if (m.sectionCount < 4) {
    issues.push(`소제목이 ${m.sectionCount}개뿐입니다. 4~7개가 훑어보기 좋습니다.`);
  }
  if (m.listBlocks === 0 && m.charCount > 1500) {
    issues.push(
      '목록이 하나도 없습니다. 비교·나열·조건이 나오는 대목은 문단보다 불릿이 훨씬 읽기 쉽습니다.',
    );
  }
  if (m.emphasisCount === 0) {
    issues.push('굵은 강조가 없습니다. 각 섹션에서 가장 중요한 문구 하나씩만 **강조**하세요.');
  } else if (m.emphasisCount > 12) {
    issues.push(
      `굵은 강조가 ${m.emphasisCount}개로 과합니다. 전부 강조하면 아무것도 강조되지 않습니다.`,
    );
  }

  return issues;
}

/** 심사원에게 넘길 요약 한 줄. */
export function metricsSummary(m: ReadabilityMetrics): string {
  return (
    `본문 ${m.charCount}자 · 소제목 ${m.sectionCount}개 · 문단 ${m.paragraphCount}개 · ` +
    `평균 문장 ${m.avgSentenceChars}자(최장 ${m.longestSentenceChars}자) · ` +
    `4문장 초과 문단 ${m.wallParagraphs}개 · 120자 초과 문장 ${m.longSentences}개 · ` +
    `목록 ${m.listBlocks}줄 · 굵은 강조 ${m.emphasisCount}개`
  );
}
