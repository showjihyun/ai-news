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

  if (!client || !slotId) {
    return (
      <div className="ad-slot">
        <div className="ad-placeholder">
          광고 자리 ({slot}) — .env 에 NEXT_PUBLIC_ADSENSE_CLIENT / _SLOT_
          {slot.toUpperCase()} 설정 시 노출
        </div>
      </div>
    );
  }

  return (
    <div className="ad-slot">
      <div style={{ width: '100%' }}>
        <div className="ad-label">{label}</div>
        <ins
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={client}
          data-ad-slot={slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
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
