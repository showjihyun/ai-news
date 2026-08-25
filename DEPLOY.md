# 배포 메모

## 현재 배포 상태

- 사이트: https://ai-news-nine-lovat.vercel.app
- 프로젝트: `showjihyun/ai-news` (Vercel)
- GitHub: https://github.com/showjihyun/ai-news (비공개)

### ⚠ `ai-news.vercel.app` 은 우리 주소가 아니다

프로젝트 이름을 `ai-news` 로 지었다고 해서 `ai-news.vercel.app` 이 주어지는 게 아니다.
그 주소는 이미 다른 사용자가 쓰고 있다(확인 결과 전혀 다른 사이트가 뜬다).
Vercel 이 실제로 배정한 주소는 `ai-news-nine-lovat.vercel.app` 이다.

배포 직후 `vercel inspect <배포주소>` 로 Aliases 를 확인하고, 그중 우리 사이트가
실제로 뜨는 주소를 `NEXT_PUBLIC_SITE_URL` 에 넣어야 한다.
이걸 확인하지 않으면 정규 URL·사이트맵·RSS·JSON-LD 가 전부 남의 사이트를 가리킨다.

---

## 1. 최초 배포

```bash
vercel login          # 브라우저 인증 (한 번만)
vercel link           # 저장소를 Vercel 프로젝트에 연결
vercel --prod         # 프로덕션 배포
```

`vercel link` 는 프로젝트 이름과 팀을 묻습니다. 기본값(현재 폴더명 `Mm`) 대신
`ai-news` 처럼 알아볼 수 있는 이름을 쓰세요. 그 이름이 기본 도메인이 됩니다
(`ai-news.vercel.app`).

## 2. 환경 변수

배포 시점에 필요한 것은 `NEXT_PUBLIC_*` 와 `CONTACT_EMAIL` 뿐입니다.
수집·집필용 키(NVIDIA 등)는 GitHub Actions 쪽에만 있으면 됩니다 —
배포는 이미 만들어진 마크다운을 정적 페이지로 굽는 일이라 LLM 을 부르지 않습니다.

```bash
# 하나씩 넣기 (값을 물어봅니다)
vercel env add NEXT_PUBLIC_SITE_URL production
vercel env add NEXT_PUBLIC_SITE_NAME production
vercel env add CONTACT_EMAIL production

# 애드센스 승인 후
vercel env add NEXT_PUBLIC_ADSENSE_CLIENT production
vercel env add NEXT_PUBLIC_ADSENSE_SLOT_TOP production
vercel env add NEXT_PUBLIC_ADSENSE_SLOT_IN_ARTICLE production
vercel env add NEXT_PUBLIC_ADSENSE_SLOT_BOTTOM production
vercel env add NEXT_PUBLIC_GA_ID production
```

### ⚠ NEXT_PUBLIC_SITE_URL 은 반드시 실제 주소로

이 값은 정규 URL·사이트맵·RSS·JSON-LD 에 전부 박힙니다.
`http://localhost:3000` 인 채로 배포하면 검색엔진이 색인할 주소가 전부 로컬호스트가 되어
사이트가 통째로 색인되지 않습니다. 도메인이 아직 없으면 Vercel 이 준 주소
(`https://ai-news.vercel.app`)를 먼저 넣고, 나중에 도메인이 생기면 바꾼 뒤 재배포하세요.

## 3. GitHub 연동 (자동 배포) — 아직 남은 작업

`vercel git connect` 는 실패한다. 비공개 저장소라 Vercel GitHub 앱 설치 승인이 필요한데
그건 브라우저에서만 할 수 있다.

1. https://vercel.com/showjihyun/ai-news/settings/git 접속
2. **Connect Git Repository** → GitHub → `showjihyun/ai-news` 선택
3. 앱 설치 권한을 승인 (비공개 저장소라 한 번 물어본다)

연결하면 GitHub Actions 가 30분마다 기사를 커밋할 때마다 자동 재배포된다.
이게 되어야 "발행 → 배포"가 무인으로 돌아간다.
연결 전까지는 기사가 GitHub 에만 쌓이고 사이트에는 반영되지 않으므로,
그동안은 `vercel --prod` 를 손으로 돌려야 한다.

## 4. 커스텀 도메인

```bash
vercel domains add example.com
```

도메인 등록기관에서 Vercel 이 안내하는 A/CNAME 레코드를 걸면 됩니다.
연결 후 `NEXT_PUBLIC_SITE_URL` 을 그 주소로 바꾸고 재배포해야 합니다.

## 5. 배포 확인

```bash
vercel ls              # 배포 목록
vercel inspect <url>   # 특정 배포 상세
vercel logs <url>      # 빌드 로그
```

배포 후 이 세 가지를 눈으로 확인하세요.

- `/` 홈에 기사가 보이는가
- `/sitemap.xml` 의 주소가 로컬호스트가 아닌 실제 도메인인가
- `/llms.txt` 가 열리는가 (AI 크롤러용 색인)
