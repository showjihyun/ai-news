import type { Metadata } from 'next';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: '문의',
  description: `${site.name}에 정정 요청, 제휴, 기타 문의를 보내는 방법`,
  alternates: { canonical: `${site.url}/contact/` },
};

export default function ContactPage() {
  return (
    <article className="narrow">
      <h1 className="page-title">문의</h1>
      <p className="page-sub">보내 주신 메일은 영업일 기준 2~3일 안에 확인합니다.</p>

      <div className="prose">
        <h2>연락처</h2>
        <p>
          <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
        </p>

        <h2>사실관계 정정 요청</h2>
        <p>
          기사에 사실과 다른 내용이 있다면 알려 주세요. 해당 기사 주소와 어느 부분이 어떻게
          잘못됐는지 함께 적어 주시면 빠르게 확인하겠습니다. 확인되면 기사를 수정하고 수정
          사실을 본문에 밝힙니다.
        </p>

        <h2>저작권 문의</h2>
        <p>
          {site.name}은 원문을 그대로 옮기지 않고, 사실을 바탕으로 새로 작성한 해설을
          제공하며 모든 기사에 원문 출처를 표기합니다. 그럼에도 저작권 관련 문제가 있다고
          판단되시면 해당 기사 주소와 함께 연락 주시기 바랍니다.
        </p>

        <h2>제휴·광고 문의</h2>
        <p>제휴 제안은 회사명, 담당자, 제안 내용을 함께 보내 주세요.</p>
      </div>
    </article>
  );
}
