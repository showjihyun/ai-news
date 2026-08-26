import type { PostMeta } from './posts';

/**
 * 첫 화면 상황판의 규칙.
 *
 * 이 사이트의 첫 화면이 하는 일은 하나다 — 스크롤 없이 "지금 뭐가 뜨는지" 보여 주기.
 * 그래서 한 칸에 몇 건을 넣느냐는 취향이 아니라 계산이다. 아래 상수는 1366×768
 * (노트북에서 가장 흔한 해상도) 브라우저에서 실제로 잰 값이고, foldBudget() 이
 * 그 값으로 판 아래끝을 계산한다. 테스트가 이 계산을 지킨다.
 */

/**
 * 브라우저에서 실측한 높이(px). 1366×768 크롬 기준이다.
 *
 * 다시 재는 법: 개발 서버를 띄우고 콘솔에서
 *   getBoundingClientRect().height 를 .site-header / .hero / .board-lead / .board-rest 에 대해 찍는다.
 * 레이아웃을 건드렸으면 반드시 다시 재고 여기를 고친다. 안 그러면 아래 테스트가
 * 지키는 게 실제 화면이 아니라 옛날 숫자가 된다.
 *
 * 합계는 실측 판 아래끝과 3px 안쪽에서 맞는다(줄 높이 반올림 때문).
 */
const H = {
  header: 61,
  /** 제목 한 줄 + 한 줄짜리 부제 */
  hero: 104,
  boardMarginTop: 16,
  /** 칸 자체의 위아래 안쪽 여백 (칸에 배경 틴트가 생기면서 붙었다) */
  colPadding: 30,
  /** 소스 이름 + 밑줄 + 목록까지의 여백 */
  boardHead: 58,
  /** 1위: 수치 셀 + 제목 2줄 + 요약 2줄 + 시각 */
  lead: 126,
  /** 2위: 수치 셀 + 제목 2줄 + 요약 1줄 */
  second: 85,
  /** 3위 아래 한 건: 제목 2줄 */
  rest: 56,
  /**
   * 짧은 칸 마감 줄. 글자 두 줄짜리다.
   *
   * 한때 여기에 서브레딧 칩 11개가 들어가 160px 이었는데, 그러면
   * `column(SPARSE_AT) + note` 가 꽉 찬 칸을 넘어 판 전체를 밀어냈다.
   * 빈 자리를 메우려고 만든 것이 더 큰 빈 자리를 만드는 셈이라 칩은 /소개 로 옮겼다.
   */
  note: 60,
  /** 반올림 오차를 흡수할 여유 */
  slack: 5,
} as const;

/**
 * 한 칸에 보여 줄 최대 건수.
 *
 * 6 인 이유는 아래 foldBudget 계산 때문이다. 7 로 올리면 1280×720 에서 마지막 줄이
 * 접힘선을 넘는다. 데이터가 아니라 화면이 정한 숫자이고, 테스트가 그걸 지킨다.
 */
export const BOARD_LIMIT = 6;

/**
 * 마감 줄을 붙일 기준. 이보다 적으면 붙는다.
 *
 * BOARD_LIMIT 에서 빼서 정한다. 마감 줄의 존재 이유가 "빈 슬롯이 남아 구멍으로
 * 보이는 것"이라 기준이 슬롯 수와 무관하면 엉뚱한 곳에서 뜬다. 실제로 처음에는
 * 4 라는 상수를 그냥 박아 뒀는데, limit 을 바꾸면 조용히 어긋나는 값이었다.
 *
 * 2 를 빼는 건 높이 때문이다 — 마감 줄이 60px 이라 빈 슬롯 2칸(112px)이면
 * 그 칸이 꽉 찬 칸보다 길어지지 않는다. foldBudget 이 그 둘을 비교해 지킨다.
 */
export const SPARSE_AT = BOARD_LIMIT - 2;

/**
 * 가장 긴 칸이 어디서 끝나는지.
 *
 * 판 높이는 가장 긴 칸이 정한다(그리드라서). 그래서 최악의 경우 —
 * 한 칸이 BOARD_LIMIT 만큼 꽉 찬 경우 — 를 기준으로 잰다.
 */
export function foldBudget(viewportHeight: number, limit: number = BOARD_LIMIT) {
  const boardTop = H.header + H.hero + H.boardMarginTop;
  /*
    가장 긴 칸 = 안쪽 여백 + 머리 + 1위 + 2위 + 나머지.

    1위와 2위가 따로 있는 이유는 세 단계 위계 때문이다 — 예전에는 1위 하나만
    크고 나머지가 전부 같아서, 목록이 각주처럼 읽히고 클릭이 1위로만 몰렸다.
  */
  const column = (items: number) =>
    H.colPadding +
    H.boardHead +
    H.lead +
    (items >= 2 ? H.second : 0) +
    Math.max(0, items - 2) * H.rest;

  /*
    가장 긴 칸은 두 가지 중 하나다.

    (a) 슬롯을 꽉 채운 칸 — 마감 줄은 안 붙는다.
    (b) 글이 적어 마감 줄이 붙은 칸 — 항목은 적지만 마감 줄이 길다.

    (b) 를 빼먹으면 안 된다. 마감 줄이 최대 160px 이라, 항목 수가 적어도
    꽉 찬 칸보다 길어질 수 있다.
  */
  const tallestColumn = Math.max(column(limit), column(SPARSE_AT) + H.note);
  const boardBottom = boardTop + tallestColumn + H.slack;

  return {
    boardTop,
    boardBottom,
    fits: boardBottom <= viewportHeight,
    /** 접힘선 위에 들어오는 제목 수(칸이 셋 다 꽉 찼을 때) */
    headlines: limit * 3,
  };
}

/**
 * 판이 몇 칸으로 갈라지는 경계.
 *
 * 여기가 이 값들의 원본이고, CSS 미디어쿼리는 이 숫자를 그대로 쓴다.
 * 둘이 어긋나면 테스트는 초록인데 화면은 틀린 상태가 되므로,
 * responsive.test.ts 가 CSS 를 직접 읽어 같은 숫자인지 확인한다.
 */
export const BOARD_BREAKPOINTS = {
  /*
    3칸에 필요한 최소 폭.

    한국어 제목이 읽히려면 한 칸이 300px 은 돼야 한다. 3×300 에 칸 사이 여백과
    본문 좌우 여백을 더하면 1000px 을 넘는다. 예전 경계는 900px 이었는데,
    901px 에서 한 칸이 260px 로 눌려 제목이 두 글자씩 끊겼다.
  */
  threeColumnMin: 1001,
  /*
    2칸에 필요한 최소 폭.

    폴더블을 펼친 세로(673~717px)까지 한 칸으로 내린다. 그 폭에서 2칸이면
    한 칸이 300px 아래로 떨어져 3칸일 때와 같은 문제가 생긴다.
  */
  twoColumnMin: 761,
  /*
    "손가락으로 만지는데 납작하게 누웠다" = 휴대폰 가로.

    폭만으로는 판단할 수 없다. 아이폰 프로맥스를 눕히면 932px 이라 노트북과
    구분이 안 된다. 반면 태블릿은 가로로 눕혀도 높이가 800px 대라 걸리지 않고,
    터치 노트북도 높이가 충분해 걸리지 않는다.
  */
  phoneLandscapeMaxHeight: 600,
} as const;

export interface Viewport {
  width: number;
  height: number;
  /** 손가락·펜처럼 정밀하지 않은 포인터. CSS 의 `pointer: coarse` 와 같다. */
  coarse: boolean;
}

/** 주어진 화면에서 판이 몇 칸인가. CSS 미디어쿼리와 같은 판정을 TypeScript 로 쓴 것. */
export function boardColumns({ width, height, coarse }: Viewport): 1 | 2 | 3 {
  /*
    휴대폰 가로를 폭보다 먼저 본다.

    CSS 에서 이 규칙이 폭 규칙들보다 뒤에 오고 특정도가 같아서, 겹치면 이쪽이 이긴다.
    여기서 폭을 먼저 보면 아이폰 SE 가로(667×375)에서 모델은 1칸이라고 하는데
    화면은 2칸이 된다 — 테스트는 초록인데 화면은 다른, 가장 나쁜 어긋남이다.
    순서를 CSS 와 맞춘다.

    2칸인 이유는 이 화면이 폭은 남고 높이가 모자라서다. 1칸이면 한 줄이 너무 길고
    세로로만 늘어난다.
  */
  if (coarse && height <= BOARD_BREAKPOINTS.phoneLandscapeMaxHeight) return 2;
  if (width < BOARD_BREAKPOINTS.twoColumnMin) return 1;
  if (width < BOARD_BREAKPOINTS.threeColumnMin) return 2;
  return 3;
}

/**
 * 휴대폰에서 한 칸에 남기는 건수.
 *
 * CSS 의 `.board-rest:nth-of-type(n + 4)` 규칙과 짝이다 — 1위 + 2건 = 3건.
 * 한쪽만 고치면 아래 계산이 조용히 거짓말을 하게 되므로 같이 고쳐야 한다.
 */
export const MOBILE_ITEMS = 3;

/** 휴대폰(390×844) 실측 높이(px). 데스크톱과 값이 달라 따로 잰다. */
const M = {
  header: 61,
  hero: 103,
  boardMarginTop: 16,
  /**
   * 칸 위쪽 안쪽 여백. 아래 boardHead 는 칸 맨 위부터 목록 시작까지라
   * 이미 이 값을 품고 있다 — 칸 높이를 더할 때 또 더하면 이중 계산이다.
   */
  colPadTop: 12,
  /** 칸 아래쪽 안쪽 여백 */
  colPadBottom: 12,
  /** 칸 맨 위부터 목록 시작까지 (위 여백 + 소스 이름 + 밑줄 + 아래 여백) */
  boardHead: 50,
  /** 소스 이름 자체의 높이 — "이 소스가 보이나"를 판정하는 기준 */
  headText: 31,
  /** 요약을 한 줄로 줄인 1위 */
  lead: 107,
  /** 요약을 접은 2위 */
  second: 67,
  rest: 56,
  rowGap: 14,
  slack: 3,
} as const;

/**
 * 휴대폰에서 몇 번째 소스까지 보이는가.
 *
 * 세 칸이 세로로 쌓이므로 데스크톱처럼 다 담을 수는 없다. 대신 지켜야 할 최소선이
 * 있다 — 세 소스 이름이 다 보여야 한다. 하나라도 접힘선 밑에 있으면 독자는 이 사이트가
 * 한 군데만 본다고 오해한다. 세 곳을 동시에 본다는 게 이 사이트가 파는 값이다.
 *
 * 이 선은 실제로 한 번 깨졌다. 칸에 배경 틴트와 안쪽 여백이 붙고 2위에 요약이
 * 생기면서 칸이 282 → 318px 이 됐고, 세 번째 소스 이름이 847px 에 걸려
 * 844px 화면을 3px 넘었다. 휴대폰에서 2위 요약을 접고 행 간격을 줄여 되돌렸다.
 *
 * 칸마다 글 수가 다르지만 계산은 최악의 경우(모든 칸이 꽉 찬 경우)로 한다.
 * 데이터가 늘면 칸이 길어지고, 그때 깨지면 늦다.
 */
export function stackedFoldBudget(
  viewportHeight: number,
  columns = 3,
  itemsPerColumn: number = MOBILE_ITEMS,
) {
  const boardTop = M.header + M.hero + M.boardMarginTop;
  const columnHeight =
    M.boardHead +
    M.lead +
    (itemsPerColumn >= 2 ? M.second : 0) +
    Math.max(0, itemsPerColumn - 2) * M.rest +
    M.colPadBottom +
    M.slack;

  let sourcesVisible = 0;
  for (let i = 0; i < columns; i++) {
    // 소스 이름은 칸 맨 위 여백 다음에 온다.
    const headBottom =
      boardTop + i * (columnHeight + M.rowGap) + M.colPadTop + M.headText;
    if (headBottom <= viewportHeight) sourcesVisible++;
  }

  return { boardTop, columnHeight, sourcesVisible };
}

/**
 * 휴대폰 가로 높이(px).
 *
 * ⚠ 이 값들만 실측이 아니다. CDP 의 pointer 미디어 에뮬레이션이 이 크롬 빌드에서
 * 동작하지 않아 휴대폰 가로를 브라우저로 재현하지 못했다. 그래서 세로에서 실측한
 * 값(M)을 가져다 쓴다 — 가로도 세로와 같은 압축 규칙을 적용하도록 CSS 를
 * 하나로 묶었기 때문에 부품 높이가 같다. 다른 것은 히어로(더 작게)와
 * 2위 아래를 통째로 감춘다는 점뿐이다.
 *
 * 실기기에서 확인할 기회가 생기면 다시 재고 여기를 고친다.
 */
const L = {
  header: 61,
  /** 가로에서는 히어로를 더 줄인다 (h1 1.2rem, 여백도 최소) */
  hero: 68,
  boardMarginTop: 16,
  colPadTop: 12,
  colPadBottom: 12,
  /** 세로와 같은 머리 압축을 쓴다 */
  boardHead: 50,
  headText: 31,
  /** 요약 한 줄짜리 1위. 가로에서는 2위 아래를 전부 감춘다. */
  lead: 107,
  rowGap: 12,
  slack: 3,
} as const;

/**
 * 휴대폰을 눕혔을 때 몇 번째 소스까지 보이는가.
 *
 * 세로와 배치가 다르다. 가로는 2칸이라 1·2번 소스가 같은 줄에 서고 3번이 다음 줄로 간다.
 * 그래서 세로용 계산(stackedFoldBudget)을 그대로 쓰면 틀린다 — 칸이 셋이니 3단이라고
 * 계산해 버린다.
 *
 * 여기서는 1위만 남긴다. 2건까지 두면 3번 소스 머리가 388px 에 걸려 390px 화면을 넘었다.
 * 390px 높이에서 고를 수 있는 건 "두 소스에서 네 건" 아니면 "세 소스에서 세 건"인데,
 * 세 곳을 동시에 본다는 게 이 사이트가 파는 것이라 후자를 택했다.
 */
export function landscapeFoldBudget(viewportHeight: number, columns = 3) {
  const boardTop = L.header + L.hero + L.boardMarginTop;
  const rowHeight = L.boardHead + L.lead + L.colPadBottom + L.slack;
  // 2칸 그리드: 0·1번은 1행, 2번은 2행.
  const rowOf = (i: number) => Math.floor(i / 2);

  let sourcesVisible = 0;
  for (let i = 0; i < columns; i++) {
    const headBottom =
      boardTop + rowOf(i) * (rowHeight + L.rowGap) + L.colPadTop + L.headText;
    if (headBottom <= viewportHeight) sourcesVisible++;
  }
  return { boardTop, rowHeight, sourcesVisible };
}

/**
 * 칸 안의 순서.
 *
 * 최신순이 아니라 화제순이다. 칸 제목이 "개발자들이 가장 먼저 물어뜯는 곳"인데
 * 1번이 그냥 최근에 쓴 글이면 제목이 거짓말이 된다.
 * 같은 화제도면 최신 글을 앞에 둔다.
 */
export function boardRanking(posts: PostMeta[], limit: number = BOARD_LIMIT): PostMeta[] {
  return [...posts]
    .sort((a, b) => b.heat - a.heat || new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}
