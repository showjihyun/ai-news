import type { Metadata } from 'next';
import { site } from '@/lib/site';
import { PERSONA_BEATS, DESK_NAMES } from '@/lib/desks';

export const metadata: Metadata = {
  title: '소개',
  description: `${site.name} 소개 — 어떤 기준으로 뉴스를 고르고, 어떻게 글을 쓰는지 밝힙니다.`,
  alternates: { canonical: `${site.url}/about/` },
};

export default function AboutPage() {
  return (
    <article className="narrow">
      <h1 className="page-title">{site.name} 소개</h1>
      <p className="page-sub">{site.tagline}</p>

      <div className="prose">
        <h2>무엇을 하는 곳인가</h2>
        <p>
          AI 소식은 대부분 영어로, 개발자들이 쓰는 말로 먼저 나옵니다. 한국어 기사로 옮겨질
          때쯤이면 이미 하루가 지나 있고, 그마저도 &ldquo;무슨 말인지 모르겠는&rdquo; 글이
          많습니다.
        </p>
        <p>
          {site.name}은 그 간극을 메웁니다. 해외 커뮤니티에서 지금 화제가 된 AI 소식을 바로
          찾아내서, AI를 전혀 모르는 사람도 이해할 수 있는 한국어로 풀어 씁니다.
        </p>

        <h2>어떻게 뉴스를 고르나</h2>
        <p>
          사람이 고르지 않습니다. 여러 곳을 동시에 지켜보다가, <strong>여러 커뮤니티에서
          동시에 화제가 된 것</strong>을 자동으로 잡아냅니다. 한 곳에서만 떠드는 이야기는
          대개 오래가지 않지만, Hacker News와 Reddit과 GeekNews에 같이 올라온 이야기는 거의
          항상 진짜 뉴스입니다.
        </p>
        <ul>
          <li>Hacker News — 개발자·창업자 커뮤니티에서 가장 먼저 도는 소식</li>
          <li>Reddit — r/LocalLLaMA, r/OpenAI, r/singularity 등 AI 커뮤니티</li>
          <li>GeekNews — 국내 기술 커뮤니티</li>
          <li>공식 발표 — OpenAI, Google DeepMind, Hugging Face 등의 1차 출처</li>
          <li>주요 기술 매체 — TechCrunch, The Verge, MIT Technology Review 등</li>
        </ul>
        <p>
          그다음 <strong>얼마나 최근인지</strong>, <strong>몇 곳에서 언급됐는지</strong>,
          <strong>일반 독자에게 실제로 쓸모가 있는지</strong>를 점수로 매겨 상위 이슈만
          기사로 씁니다. 지자체 보도자료나 개발자 전용 기술 공지처럼 일반 독자와 상관없는
          내용은 걸러냅니다.
        </p>

        <h2>어떻게 글을 쓰나</h2>
        <p>
          기사는 공개된 원문과 커뮤니티 반응을 바탕으로 <strong>AI의 도움을 받아
          작성</strong>하며, 발행 전에 사람이 확인합니다. 이 사실을 모든 글 하단에
          밝힙니다.
        </p>
        <p>주제에 따라 담당 데스크가 나뉘고, 데스크마다 보는 각도가 다릅니다.</p>
        <ul>
          {Object.entries(PERSONA_BEATS).map(([category, beat]) => (
            <li key={category}>
              <strong>{DESK_NAMES[category]}</strong> ({category}) — {beat}
            </li>
          ))}
        </ul>

        <h2>지키는 원칙</h2>
        <ul>
          <li>원문에 없는 숫자·날짜·발언을 지어내지 않습니다.</li>
          <li>모든 기사에 원문 링크를 겁니다. 직접 확인하실 수 있습니다.</li>
          <li>&ldquo;충격&rdquo;, &ldquo;역대급&rdquo; 같은 낚시성 제목을 쓰지 않습니다.</li>
          <li>확인된 사실과 저희 해석을 문장 단위로 구분해 씁니다.</li>
          <li>특정 종목의 매수·매도를 권유하지 않습니다.</li>
        </ul>

        <h2>주의</h2>
        <p>
          이 사이트의 내용은 정보 제공을 목적으로 합니다. 투자, 법률, 의료에 관한 판단의
          근거로 삼지 마시고, 해당 분야의 전문가와 상의하시기 바랍니다.
        </p>

        <h2>문의</h2>
        <p>
          사실관계 정정 요청, 제휴 문의 등은{' '}
          <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a> 로 보내 주세요.
        </p>
      </div>
    </article>
  );
}
