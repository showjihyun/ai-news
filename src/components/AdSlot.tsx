import { site } from '@/lib/site';

type SlotName = keyof typeof site.adsense.slots;

/**
 * 애드센스 광고 자리.
 *
 * 클라이언트 ID 가 없으면 자리표시자를 보여 준다 — 개발 중에 레이아웃이 어떻게
 * 밀리는지 미리 보여야 나중에 CLS(레이아웃 이동) 로 점수를 깎이지 않는다.
 * min-height 를 고정해 두는 것도 같은 이유다.
 */
export function AdSlot({ slot, label = '광고' }: { slot: SlotName; label?: string }) {
  const client = site.adsense.client;
  const slotId = site.adsense.slots[slot];

  /*
    자리표시자는 **개발 중에만** 보여 준다.

    게시자 ID 는 받았는데 광고 단위 ID 가 아직 없는 기간이 있다 — 애드센스 심사가
    도는 동안이 그렇다. 그때 이 회색 상자를 그대로 두면 심사관에게
    ".env 에 NEXT_PUBLIC_ADSENSE_SLOT_TOP 설정 시 노출" 같은 개발용 문구가 보인다.
    "미완성 사이트"로 읽히기 딱 좋다.

    그래서 게시자 ID 가 있으면 조용히 아무것도 그리지 않는다. 광고 단위를 만들어
    슬롯 ID 를 넣으면 그때부터 진짜 광고가 나온다.
  */
  if (!client) {
    return (
      <div className="ad-slot">
        <div className="ad-placeholder">
          광고 자리 ({slot}) — .env 에 NEXT_PUBLIC_ADSENSE_CLIENT / _SLOT_
          {slot.toUpperCase()} 설정 시 노출
        </div>
      </div>
    );
  }
  if (!slotId) return null;

  /*
    자리마다 형식이 다르다.

    넷을 전부 `format="auto"` 로 두면 사이드바에는 가로로 납작한 광고가 들어가
    312px 기둥에서 거의 안 보이고, 본문 중간에는 기사 흐름을 끊는 상자가 박힌다.
    애드센스가 자리별로 다른 형식을 두는 이유가 그것이다.

      가로 띠(목록 위·아래·본문 중간)  auto + 전체폭 반응형
      세로 기둥(사이드바)              vertical — 300×600 같은 세로형만 받는다

    본문 중간은 원래 `fluid + in-article` 이 가장 매끄럽다. 문단 사이에 흐르듯
    들어가서 기사 흐름을 안 끊는다. 그런데 애드센스가 그 형식을 개별 광고 단위에서
    빼고 자동 광고 쪽으로 옮겨서(한국어 UI 의 "콘텐츠 내 자동 삽입 광고 배치하기"는
    단위 생성이 아니라 자동 광고 설정으로 간다), 지금은 디스플레이 단위를 쓴다.

    ⚠ 형식과 단위 종류가 어긋나면 광고가 안 채워진다. 디스플레이 단위에
    `fluid` 를 물리면 요청은 나가는데 응답이 비어서, 화면상 아무 일도 안 일어난다 —
    잘못된 걸 알아채기 가장 어려운 형태의 고장이다.
  */
  const shape =
    slot === 'sidebar'
      ? { 'data-ad-format': 'vertical' }
      : { 'data-ad-format': 'auto', 'data-full-width-responsive': 'true' };

  return (
    <div className="ad-slot">
      <div style={{ width: '100%' }}>
        <div className="ad-label">{label}</div>
        <ins
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={client}
          data-ad-slot={slotId}
          {...shape}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: '(adsbygoogle = window.adsbygoogle || []).push({});',
          }}
        />
      </div>
    </div>
  );
}
