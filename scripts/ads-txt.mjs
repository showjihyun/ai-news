import fs from 'node:fs';
import path from 'node:path';

/**
 * ads.txt 를 빌드 직전에 만든다(또는 지운다).
 *
 * 이 파일은 "이 사이트의 광고 재고를 누가 팔 수 있는가"를 밝힌다. 없으면 애드센스가
 * "수익 손실 위험" 경고를 띄우고 일부 광고주가 입찰을 건너뛴다.
 *
 * ⚠ **빈 ads.txt 는 없느니만 못하다.** 규격상 파일이 있는데 목록이 비어 있으면
 * "이 사이트 광고를 팔 수 있는 곳이 하나도 없다"는 선언이 된다. 승인 직후
 * 광고가 안 나오는 사고가 여기서 난다.
 *
 * 그래서 app/ads.txt/route.ts 로 만들지 않는다. 정적 내보내기는 라우트가 404 를
 * 돌려줘도 파일 자체는 만들어 버려서, 게시자 ID 가 없을 때 0바이트 ads.txt 가
 * 배포된다 — 실제로 처음에 그렇게 나갔다. public/ 에 직접 쓰고 지우는 편이 확실하다.
 */
const client = (process.env.NEXT_PUBLIC_ADSENSE_CLIENT || '').trim();
const target = path.join(process.cwd(), 'public', 'ads.txt');

if (!client) {
  if (fs.existsSync(target)) {
    fs.unlinkSync(target);
    console.log('  · ads.txt 제거 (게시자 ID 없음 — 빈 파일은 없느니만 못하다)');
  }
  process.exit(0);
}

// ca-pub-1234... 에서 숫자만 쓴다. ads.txt 규격이 그렇다.
const pubId = client.replace(/^ca-pub-/, '');
if (!/^\d+$/.test(pubId)) {
  console.error(`  ! NEXT_PUBLIC_ADSENSE_CLIENT 형식이 이상합니다: ${client}`);
  console.error('    ca-pub-0000000000000000 형태여야 합니다.');
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `google.com, pub-${pubId}, DIRECT, f08c47fec0942fa0\n`, 'utf8');
console.log(`  · ads.txt 생성 (pub-${pubId})`);
