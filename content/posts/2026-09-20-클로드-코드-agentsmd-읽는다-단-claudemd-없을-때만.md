---
title: "클로드 코드, AGENTS.md 읽는다… 단, CLAUDE.md 없을 때만"
description: "앤스로픽이 클로드 코드 2.1.277에서 AGENTS.md 네이티브 지원 추가. 단 CLAUDE.md가 없는 프로젝트에서만 작동하며 베드록·버텍스·파운드리는 미지원. 개발 도구 간 호환성 한 걸음 진전."
oneLiner: "클로드 코드가 OpenAI 표준 AGENTS.md를 읽기 시작했지만 조건부 지원에 그쳤다"
date: "2026-09-19T23:57:02.301Z"
category: "서비스"
desk: "서비스 리뷰 데스크"
tags: ["클로드코드", "AGENTS.md", "앤스로픽", "AI코딩", "개발도구"]
heat: 40
originUrl: "https://code.claude.com/docs/en/changelog"
originTitle: "Claude Code, 이제 AGENTS.md도 지원"
sources:
  - origin: "Hacker News"
    title: "Claude Code now reads AGENTS.md if there is no Claude.md"
    url: "https://news.ycombinator.com/item?id=49760187"
    score: 713
    comments: 265
  - origin: "GeekNews"
    title: "Claude Code, 이제 AGENTS.md도 지원"
    url: "https://news.hada.io/topic?id=33925"
    score: 25
    comments: 0
  - origin: "GeekNews"
    title: "Claude Code, 이제 CLAUDE.md가 없으면 AGENTS.md를 읽음"
    url: "https://news.hada.io/topic?id=33913"
    score: 25
    comments: 0
  - origin: "Anthropic 뉴스"
    title: "Anthropic's Claude Code Now Supports OpenAI's AGENTS.md Standard - KuCoin"
    url: "https://news.google.com/rss/articles/CBMinwFBVV95cUxPY1JNRzh0Z2lKYkJVVkFoU2JiaG1iNDA0XzlOYUpMU1ZhRmpYcWdoOFVQNG1oN05lMnNIQlNhenVnNVJ1czFBcHpKYVdKLTB2eXBGWmNrSjE1NS1PaGMzWWN3LUhITU9MUmFJV3ZkUm9SSjlNbm13Q2tPM01GV2Q5RkxCMmE1bnVZR2x2T3F2V2tOU01GOWt3MFVOX29vS0k?oc=5"
    score: 20
    comments: 0
---
## 클로드 코드가 AGENTS.md를 읽기 시작했다

앤스로픽이 9월 18일 배포한 클로드 코드 2.1.277 버전에서 AGENTS.md 파일을 네이티브로 지원하기 시작했다. 체인지로그에 따르면 **프로젝트 루트에 CLAUDE.md가 없을 때만 AGENTS.md를 대신 읽는다**. 설정은 `/config` 메뉴의 'Project instructions'에서 변경 가능하다.

단, 베드록(Bedrock), 버텍스(Vertex), 파운드리(Foundry) 환경에서는 아직 쓸 수 없다. 클라우드 기업용 배포판을 쓰는 팀은 당분간 기존 방식대로 CLAUDE.md를 유지해야 한다.

## 왜 지금 AGENTS.md인가

AGENTS.md는 원래 오픈AI가 자사 에이전트 도구용으로 제안한 표준 포맷이다. 프로젝트 루트에 놓고 에이전트에게 "이 프로젝트는 이렇게 작업해라"라는 지침을 전달하는 용도다. 클로드 코드는 그동안 독자 규격인 CLAUDE.md만 인식했다.

지난해부터 커서(Cursor), 오픈코드(opencode), 오마이파이(oh-my-pi) 같은 서드파티 도구가 AGENTS.md를 채택하면서 사실상 업계 표준이 됐다. 앤스로픽이 뒤늦게 탑승한 셈이다.

해커뉴스 댓글 265개 중 다수는 "심볼릭 링크 하나면 해결되던 걸 왜 이제야"라는 반응이다. 한 사용자는 "브랜딩 때문에 일부러 안 했던 게 아니냐"고 지적했고, 다른 이는 "이제라도 돼서 다행"이라고 했다. 둘 다 틀린 말은 아니다.

## 쉽게 풀어보면

클로드 코드는 개발자가 터미널에서 쓰는 AI 코딩 도구다. 프로젝트 폴더에 `CLAUDE.md`라는 파일을 두면 "이 프로젝트는 타입스크립트 쓰고, 테스트는 jest로 돌려" 같은 규칙을 AI가 자동으로 읽고 따른다.

이번 업데이트로 `CLAUDE.md`가 없을 때 `AGENTS.md`도 읽게 됐다. **다른 AI 도구(커서, 오픈코드 등)와 같은 규칙 파일을 공유할 수 있게 된 것**이다. 팀원 절반은 커서 쓰고 절반은 클로드 코드 쓴다면, 이제 규칙 파일 하나만 관리하면 된다.

단, 조건이 있다. `CLAUDE.md`가 있으면 그게 우선이고 `AGENTS.md`는 무시된다. 둘 다 두고 골라 쓰는 구조가 아니다. 그리고 AWS 베드록이나 구글 버텍스 같은 기업용 클라우드 환경에서는 아직 안 된다.

비유하자면 이렇다. 뷔페에 접시가 두 종류 있었다. 파란 접시(CLAUDE.md)만 쓰던 식당에서, 빨간 접시(AGENTS.md)도 놔뒀다. 그런데 파란 접시가 있으면 빨간 접시는 안 치워준다. 파란 접시 없을 때만 빨간 접시 쓴다. 게다가 VIP 룸(베드록/버텍스)엔 아직 빨간 접시가 없다.

## 나에게 미치는 영향

**클로드 코드 무료·프로 사용자(한국 포함)**
- 오늘 `claude --version`으로 2.1.277 이상인지 확인하고, 프로젝트에 `AGENTS.md`만 두고 테스트해 보세요. `CLAUDE.md` 지우고 `AGENTS.md` 하나만 있으면 된다.

**커서·오픈코드·오마이파이 병행 사용자**
- 규칙 파일 하나(`AGENTS.md`)로 툴 간 이동이 가능해졌다. 단, 클로드 코드 전용 지시가 필요하다면 `CLAUDE.md`를 따로 둬야 한다. 둘 다 두면 클로드 코드는 `CLAUDE.md`만 본다.

**기업용 베드록·버텍스·파운드리 사용자**
- 아직 안 된다. 앤스로픽 문서에 "not yet on Bedrock, Vertex or Foundry"라고 명시돼 있다. 내부 배포판 업데이트 기다려야 한다.

**한국어 프로젝트 작업자**
- AGENTS.md 포맷 자체는 언어 중립이다. 한국어 주석·지침 적어둬도 문제없다. 다만 클로드 코드 한글 응답 품질은 기존과 같다(별도 개선 사항 없음).

## 남은 건 검증이다

이번 업데이트로 "도구 갈아타기 장벽"이 하나 낮아진 건 사실이다. 하지만 **조건부 지원**이라는 점이 걸린다. `CLAUDE.md`가 있으면 `AGENTS.md`를 안 읽는 설계면, 기존 프로젝트 마이그레이션하려면 `CLAUDE.md`를 지우거나 이름을 바꿔야 한다. 실수로 둘 다 두면 어느 쪽이 적용됐는지 헷갈린다.

또 기업 환경 미지원은 단순 지연인지, 아키텍처 제약인지 아직 불분명하다. 앤스로픽 문서에 "not yet"이라고만 돼 있을 뿐 로드맵은 없다.

본지가 앞서 다룬 [스킬싱크](/posts/2026-09-18-ai-대화-기록을-다른-에이전트로-옮기는-스킬싱크-클로드-코드만-지원/)는 클로드 코드 세션만 다른 에이전트로 옮기는 도구였다. 이번 AGENTS.md 지원과 합치면 **규칙 파일 공유 → 세션 이동 → 도구 전환** 흐름이 조금 더 매끄러워진다. 다만 스킬싱크도 클로드 코드 전용이라, 궁극적 호환성은 여전히 멀다.

다음 버전에서 `CLAUDE.md`와 `AGENTS.md` 우선순위 설정 옵션이 생기길 기대한다. 그때가 진짜 인터옵(interop)이다.
