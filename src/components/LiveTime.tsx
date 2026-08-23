'use client';

import { useEffect, useState } from 'react';
import { formatDate, relativeTime } from '@/lib/site';

/**
 * 상대 시각을 브라우저에서 계산한다.
 *
 * 이 사이트는 완전 정적 내보내기라, 서버에서 relativeTime() 을 부르면 그 결과가
 * HTML 에 그대로 박제된다. 실제로 out/index.html 에 "6분 전" 문자열이 박혀 있었고,
 * 재배포 전까지 며칠이 지나도 계속 "6분 전"이라고 우긴다. '속도'를 내세우는 사이트가
 * 시간 표시를 틀리면 그 자체로 신뢰를 잃는다.
 *
 * 첫 렌더는 절대 날짜로 낸다. 그래야 (a) 서버/클라이언트 결과가 같아 하이드레이션
 * 불일치가 없고, (b) 자바스크립트를 실행하지 않는 크롤러도 정확한 날짜를 읽는다.
 * 마운트 후에 상대 시각으로 바꾼다.
 */
export function LiveTime({ iso, className }: { iso: string; className?: string }) {
  const [label, setLabel] = useState(() => formatDate(iso));

  useEffect(() => {
    const update = () => setLabel(relativeTime(iso));
    update();
    // 1분마다 갱신 — 탭을 열어 둔 채로도 시간이 맞게 흐른다.
    const timer = setInterval(update, 60_000);
    return () => clearInterval(timer);
  }, [iso]);

  return (
    <time className={className} dateTime={iso}>
      {label}
    </time>
  );
}

/**
 * 속보 배지. 신선도가 시간에 따라 변하므로 이것도 브라우저에서 판정해야 한다.
 * 빌드 시점에 정하면 한 번 속보로 찍힌 글이 영원히 속보로 남는다.
 */
const BREAKING_HOURS = 2;
const BREAKING_HEAT = 30;

export function BreakingBadge({ iso, heat }: { iso: string; heat: number }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const check = () =>
      setShow(heat >= BREAKING_HEAT && Date.now() - new Date(iso).getTime() < BREAKING_HOURS * 3_600_000);
    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, [iso, heat]);

  if (!show) return null;
  return <span className="chip breaking-chip">속보</span>;
}
