# 배포 메모

## 왜 Cloudflare Pages 인가 — 이 결정은 되돌리지 말 것

**Vercel 무료(Hobby) 플랜은 애드센스를 명시적으로 금지한다.**

Vercel 의 Hobby 플랜 문서는 상업적 이용을 "만드는 데 관여한 누구든 금전적 이득을
얻는 배포"로 정의하고, 금지 항목에 **광고 표시(제휴 링크와 Google AdSense 포함)** 를
직접 적어 두었다. 이 사이트의 존재 이유가 애드센스 수익이므로, Hobby 로 광고를 달면
약관 위반이고 계정이 정지될 수 있다. 상업적 이용은 Pro($20/월)부터다.

Cloudflare Pages 무료 플랜은 상업적 이용과 애드센스를 허용한다. 게다가 이 사이트는
`output: 'export'` 로 굽는 **순수 정적 사이트**(HTML 210개, 11MB)라 서버 기능을
전혀 안 쓴다 — 어디에 올려도 똑같이 동작한다. 대역폭도 무제한이라 트래픽이 늘어도
요금이 붙지 않는다.

> 요약: **Vercel 로 되돌리려면 Pro 결제가 필수다.** 무료로 되돌리면 약관 위반이다.

### 빌드 한도는 문제가 안 된다

Cloudflare 무료는 월 500 빌드다. 30분 주기(하루 48회)로 보면 넘칠 것 같지만,
발행 워크플로는 **새 기사를 실제로 쓴 경우에만 커밋**한다. 대부분의 실행은 중복
방지와 품질 기준에 걸려 아무것도 안 낸다. 실측하면 하루 5~7 커밋(월 150~210 빌드)이라
한도의 절반도 안 쓴다.

빌드가 늘어 한도가 걱정되면 두 가지 길이 있다:
- 발행 주기를 늘린다(`.github/workflows/publish.yml` 의 cron).
- GitHub Actions 에서 `wrangler pages deploy out` 으로 직접 올린다.
  직접 업로드는 Cloudflare 빌드 한도를 안 쓴다. 대신 API 토큰을 GitHub Secrets 에 둬야 한다.

---

## 현재 배포 상태

- 저장소: https://github.com/showjihyun/ai-news (비공개)
- 이전 배포: Vercel (`ai-news-nine-lovat.vercel.app`) — 광고를 달기 전에 내려야 한다
- 현재 배포: Cloudflare Pages (아래 절차로 연결)

---

## 1. Cloudflare Pages 연결

대시보드에서 한 번만 하면 이후는 자동이다.

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**
2. GitHub 계정을 연결하고 `showjihyun/ai-news` 를 고른다(비공개 저장소도 된다).
3. 빌드 설정:

   | 항목 | 값 |
   |---|---|
   | Framework preset | Next.js (Static HTML Export) |
   | Build command | `npm run build` |
   | Build output directory | `out` |
   | Root directory | (비움) |
   | Node version | 20 이상 (`NODE_VERSION` 환경 변수로 지정) |

4. 환경 변수(아래 2번)를 넣고 **Save and Deploy**.

빌드가 끝나면 `<프로젝트명>.pages.dev` 주소가 나온다. **그 주소를 확인해서**
`NEXT_PUBLIC_SITE_URL` 에 넣어야 한다 — 이유는 아래.

### ⚠ 배정된 주소를 반드시 눈으로 확인할 것

Vercel 에서 한 번 크게 데였다. 프로젝트 이름을 `ai-news` 로 지었다고 해서
`ai-news.vercel.app` 이 주어지는 게 아니었고, 그 주소는 이미 다른 사람이 쓰고 있었다.
그걸 모르고 `NEXT_PUBLIC_SITE_URL` 에 넣어 두면 정규 URL·사이트맵·RSS·JSON-LD 가
**전부 남의 사이트를 가리킨다.** 색인이 통째로 남에게 넘어간다.

Cloudflare 도 같은 위험이 있다(`ai-news.pages.dev` 가 비어 있으리란 보장이 없다).
배포 후 실제로 열어 보고 우리 사이트가 뜨는 주소를 쓴다.

## 2. 환경 변수

배포 시점에 필요한 것은 `NEXT_PUBLIC_*` 와 `CONTACT_EMAIL` 뿐이다.
수집·집필용 키(NVIDIA 등)는 GitHub Actions 쪽에만 있으면 된다 —
배포는 이미 만들어진 마크다운을 정적 페이지로 굽는 일이라 LLM 을 부르지 않는다.

Cloudflare Pages → 프로젝트 → **Settings** → **Environment variables** (Production):

```
NEXT_PUBLIC_SITE_URL   https://<실제 배정된 주소>      ← 커스텀 도메인이 생기면 그걸로
NEXT_PUBLIC_SITE_NAME  AI 브리핑
CONTACT_EMAIL          (연락처 페이지에 노출됨)
NODE_VERSION           20
```

애드센스 승인 후 추가:

```
NEXT_PUBLIC_ADSENSE_CLIENT       ca-pub-...
NEXT_PUBLIC_ADSENSE_SLOT_TOP     ...
NEXT_PUBLIC_ADSENSE_SLOT_BOTTOM  ...
```

이 값들이 없으면 광고 자리에 회색 안내 상자가 뜬다(개발 중 표시용).

## 3. 커스텀 도메인 — 애드센스 승인의 최대 변수

`*.pages.dev` 나 `*.vercel.app` 같은 **남의 서브도메인은 애드센스 심사에서 불리하다.**
본인 소유 도메인이 승인 확률을 가장 크게 바꾼다. 연 1~2만원이면 된다.

도메인을 잡았다면:

1. Cloudflare Pages → 프로젝트 → **Custom domains** → **Set up a domain**
2. 도메인을 Cloudflare 네임서버로 옮기면 DNS·SSL 이 자동으로 붙는다.
3. `NEXT_PUBLIC_SITE_URL` 을 그 도메인으로 바꾸고 재배포한다.

**`NEXT_PUBLIC_SITE_URL` 을 바꾸면 반드시 재배포해야 한다.** 이 값은 빌드 시점에
HTML 에 구워지는 값이라, 환경 변수만 바꾸고 재배포를 안 하면 옛 주소가 그대로 남는다.

## 4. Vercel 정리 — 광고를 달기 전에

Vercel 배포를 살려 둔 채 광고를 달면 그 자체가 Hobby 약관 위반이다.
또 같은 내용이 두 주소에 살아 있으면 검색엔진이 중복 콘텐츠로 본다.

Cloudflare 쪽이 정상 동작하는 걸 확인한 다음:

```bash
npx vercel project rm ai-news      # 프로젝트 삭제
```

또는 대시보드에서 프로젝트를 지운다. 급하지 않다면 광고를 달기 직전까지 두었다가
정리해도 된다 — **광고가 없는 동안은 위반이 아니다.**

## 5. 배포 확인

```bash
SITE=https://<배정된 주소>
curl -sI $SITE | head -3                                  # 200 인가
curl -s $SITE | grep -o '<link rel="canonical" href="[^"]*"'   # 우리 주소인가
curl -s $SITE/sitemap.xml | grep -c '<loc>'               # 페이지 수
curl -s $SITE/robots.txt | head -3
curl -sI $SITE/_next/static/ 2>/dev/null | grep -i cache   # 캐시 헤더가 붙는가
```

`public/_headers` 가 Cloudflare Pages 의 헤더 규약 파일이다(Vercel 은 `vercel.json` 을
쓴다). 해시가 붙은 정적 자산만 영구 캐시하고 기사 HTML 은 짧게 잡는다 —
30분마다 새 글이 올라오는 사이트라 HTML 을 오래 캐시하면 속보가 늦게 보인다.

## 6. 자동 배포 흐름

```
GitHub Actions (30분 주기)
  수집 → 집필 → 발행 → 평가 → 개정 → 격리
  새 기사가 있으면 content/posts 를 커밋 & 푸시
        ↓
Cloudflare Pages 가 푸시를 감지
  npm run build → out/ 을 전 세계 엣지에 배포
```

기사가 안 나온 실행은 커밋을 안 하므로 빌드도 안 돈다.
