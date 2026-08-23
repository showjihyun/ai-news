import type { Metadata } from 'next';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: '개인정보처리방침',
  description: `${site.name}의 개인정보처리방침 및 쿠키 사용 안내`,
  alternates: { canonical: `${site.url}/privacy/` },
};

export default function PrivacyPage() {
  return (
    <article className="narrow">
      <h1 className="page-title">개인정보처리방침</h1>
      <p className="page-sub">시행일: 2026년 1월 1일</p>

      <div className="prose">
        <h2>1. 수집하는 정보</h2>
        <p>
          {site.name}은 회원가입 절차가 없으며, 이름·연락처 등 개인을 직접 식별할 수 있는
          정보를 직접 수집하지 않습니다. 다만 아래 서비스가 방문 기록을 남길 수 있습니다.
        </p>

        <h2>2. 쿠키와 광고</h2>
        <p>
          이 사이트는 Google AdSense를 통해 광고를 게재합니다. Google을 포함한 제3자 광고
          사업자는 쿠키를 사용하여 이 사이트나 다른 사이트의 방문 기록을 바탕으로 광고를
          제공합니다.
        </p>
        <ul>
          <li>
            Google의 광고 쿠키 사용에 대한 안내:{' '}
            <a
              href="https://policies.google.com/technologies/ads"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google 광고 정책
            </a>
          </li>
          <li>
            맞춤 광고를 원하지 않으시면{' '}
            <a
              href="https://www.google.com/settings/ads"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google 광고 설정
            </a>
            에서 해제하실 수 있습니다.
          </li>
          <li>
            제3자 광고 사업자의 쿠키는{' '}
            <a href="https://www.aboutads.info/choices/" target="_blank" rel="noopener noreferrer">
              aboutads.info
            </a>
            에서 일괄 해제하실 수 있습니다.
          </li>
        </ul>

        <h2>3. 접속 분석</h2>
        <p>
          방문자 수와 인기 페이지를 파악하기 위해 Google Analytics를 사용할 수 있습니다.
          수집된 정보는 통계 목적으로만 쓰이며, 개인을 특정하는 데 사용하지 않습니다. 브라우저
          설정에서 쿠키를 차단하시면 수집을 막을 수 있습니다.
        </p>

        <h2>4. 제3자 제공</h2>
        <p>
          {site.name}은 수집된 정보를 제3자에게 판매하거나 대여하지 않습니다. 법령에 따른
          요구가 있는 경우에만 관계 기관에 제공할 수 있습니다.
        </p>

        <h2>5. 외부 링크</h2>
        <p>
          기사에는 원문 출처로 연결되는 외부 링크가 포함됩니다. 해당 사이트의 개인정보
          처리에 대해서는 각 사이트의 방침이 적용되며, {site.name}은 책임지지 않습니다.
        </p>

        <h2>6. 이용자의 권리</h2>
        <p>
          브라우저 설정을 통해 쿠키 저장을 거부하거나 삭제하실 수 있습니다. 다만 일부 기능이
          정상적으로 동작하지 않을 수 있습니다.
        </p>

        <h2>7. 문의</h2>
        <p>
          개인정보 처리에 관한 문의는 <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>{' '}
          로 보내 주세요.
        </p>

        <h2>8. 방침 변경</h2>
        <p>
          이 방침이 변경되는 경우 이 페이지에 시행일과 함께 공지합니다.
        </p>
      </div>
    </article>
  );
}
