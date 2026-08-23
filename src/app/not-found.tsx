import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="narrow" style={{ padding: '5rem 0' }}>
      <h1 className="page-title">페이지를 찾을 수 없습니다</h1>
      <p className="page-sub">
        주소가 바뀌었거나 삭제된 글일 수 있습니다.
      </p>
      <Link href="/" className="tag">
        최신 AI 뉴스 보러 가기
      </Link>
    </div>
  );
}
