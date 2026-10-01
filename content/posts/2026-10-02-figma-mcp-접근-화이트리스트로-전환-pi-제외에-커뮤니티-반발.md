---
title: "Figma, MCP 접근 화이트리스트로 전환… Pi 제외에 커뮤니티 반발"
description: "Figma가 MCP 클라이언트 접근을 승인된 도구만 허용하는 방식으로 변경했습니다. HN에서 보안 명분 실효성 논란이 일고 있습니다."
oneLiner: "Figma가 MCP 접근을 화이트리스트제로 전환하며 Pi 등 비승인 AI 도구 차단"
date: "2026-10-01T20:15:18.117Z"
category: "서비스"
desk: "서비스 리뷰 데스크"
tags: ["Figma", "MCP", "AI도구", "화이트리스트", "개발자뉴스"]
heat: 17
originUrl: "https://twitter.com/GayaniFigma/status/2105295629941350454"
originTitle: "Figma restricts MCP access to whitelisted clients, excluding Pi"
sources:
  - origin: "Hacker News"
    title: "Figma restricts MCP access to whitelisted clients, excluding Pi"
    url: "https://news.ycombinator.com/item?id=49922729"
    score: 144
    comments: 83
---
## Figma가 MCP 문을 걸어잠갔다

해커뉴스에 올라온 스레드에 따르면 Figma가 MCP(Model Context Protocol) 클라이언트 접근을 화이트리스트 방식으로 제한했다. 점수 144, 댓글 83개를 기록한 이 스레드 제목은 "Figma restricts MCP access to whitelisted clients, excluding Pi"다. MCP는 앤트로픽이 만든 개방형 표준으로, AI 모델이 외부 도구·데이터와 안전하게 통신하게 하는 프로토콜이다.

## Pi가 빠진 이유, 아무도 모른다

이번 변경에서 개인용 AI 비서 Pi가 제외됐다. Pi는 MCP를 통해 Figma 파일을 읽고 편집하려 했던 도구다. Figma가 왜 Pi를 뺐는지, 보안 검증 때문인지 경쟁 서비스라서인지는 **본지가 확인하지 못했다**. 자료 어디에도 제외 사유는 없다.

## 커뮤니티는 보안 명분을 의심한다

댓글 83개 중 다수가 보안 명분의 실효성을 의심한다. 세 가지 반응이 눈에 띈다.

첫째, "클로드 같은 모델은 이런 제한을 우회하는 게 일상"이라는 지적이다. 사용자 모르게 에이전트가 속도 제한만 맞닥뜨릴 뿐이라는 얘기다.

둘째, "의도적으로 둔감한 척하는 답변"이라며 Figma 측 해명을 불신하는 목소리다. 원문 댓글은 "his reply is either intentionally obtuse or he entirely missed the point"라고 적었다.

셋째, "Paper 링크 달라"는 조롱 섞인 댓글도 보인다. Figma의 문서 도구 Paper를 홍보하려는 것 아니냐는 의심이다.

## 열린 Excalidraw, 닫힌 Figma

본지가 앞서 다룬 Excalidraw 사례와 정반대 행보다. Excalidraw는 MCP를 완전 개방해 누구나 API 키만 넣으면 클로드와 실시간으로 다이어그램을 주고받게 했다. 같은 프로토콜을 두고 한 쪽은 문을 열고, 한 쪽은 게이트키퍼를 자처한다. 이 대목이 걸린다.

## 한국 사용자에겐 아직 먼 이야기

현재 Figma MCP 화이트리스트에 한국산 AI 도구가 포함됐는지 **공개되지 않았다**. 국내 스타트업이 Figma 연동 기능을 내려면 Figma 승인 절차를 밟아야 할 것으로 보이지만, 절차·기준·소요 기간 모두 **본지가 확인하지 못했다**. 한국어 문서 지원 여부도 알 수 없다. 당장은 한국 개발자가 직접 MCP 서버를 띄워 Figma와 붙이는 길이 막혔다.

## 쉽게 풀어보면

Figma가 MCP 접근을 화이트리스트로 바꿨습니다. MCP는 AI가 Figma 같은 외부 프로그램과 대화하게 해주는 통역 규약입니다. 예전에는 누구나 통역사를 데려와 Figma와 대화시킬 수 있었습니다. 이제는 Figma가 여권 검사를 합니다. 승인된 통역사만 들여보냅니다. Pi라는 통역사는 여권이 없어 문전박대당했습니다. Excalidraw라는 다른 설계 도구는 문을 활짝 열어둔 것과 대조됩니다.

## 나에게 미치는 영향

Figma 쓰는 디자이너·개발자라면 지금 쓰는 AI 플러그인이 끊길 수 있습니다. 챗GPT·클로드·제미나이 등 주요 도구가 화이트리스트에 들었는지 Figma 공식 채널에서 확인해야 합니다. 국내 도구는 거의 확실히 빠져 있습니다. 당분간은 Figma 내에서 직접 작업하거나, 공식 플러그인만 쓰는 게 안전합니다. MCP 연동이 꼭 필요하다면 Figma 개발자 포럼에 승인 요청 글을 남기는 방법이 있으나, 답변 시점은 장담 못 합니다.

## 남은 쟁점

- Figma가 화이트리스트 기준·심사 기간을 언제 공개할지
- 한국 기업이 승인받으려면 어떤 서류·절차가 필요한지
- Pi 외에 어떤 도구들이 제외됐는지 전체 목록
- 앤트로픽(MCP 창시자)이 이 폐쇄 정책에 어떤 입장인지

확인되는 대로 후속 기사로 전하겠습니다.
