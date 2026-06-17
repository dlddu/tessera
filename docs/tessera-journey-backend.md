# 사용자 여정 J2 — 컨테이너 워크스페이스 격리 작업

- **여정 ID**: J2
- **참조 가치 문서**: `tessera-values.md`
- **여정 인덱스**: `tessera-user-journeys.md`
- **관련 PRD / 테스트**: PRD-2 (`tessera-prd-backend.md`) / T-2 (`tessera-test-backend.md`)

## 페르소나 · 상황

- **페르소나**: macOS에서 일하는 개발자 (주 페르소나 정의는 `tessera-user-journeys.md` 참조).
- **상황**: 의존성이 까다롭거나 호스트를 더럽히고 싶지 않은 프로젝트를 시작한다. 격리 환경을 원하지만
  새 도구를 배우고 싶지는 않다.

## 달성 가치

- **V2(환경 선택의 자유)** — 주
- **V1(통합된 단일 작업 표면)** — 부 (동일한 레이아웃 조작)

## 트리거

격리가 필요한 새 프로젝트 착수.

## 단계

| 단계 | 사용자 행동 · 시스템 반응 | 근거 AC | 시각화 |
|------|---------------------------|---------|--------|
| 1 | 새 워크스페이스 생성 시 backend로 **container** 선택. 이미지·작업 디렉토리·마운트 지정. | AC2.1 | ✅ [M-J2-S1](./mockups/M-J2-S1.html) |
| 2 | 컨테이너 기동 → 터미널 tab이 컨테이너로 exec. `hostname`/`env`/파일 트리가 컨테이너의 것(호스트와 격리). | AC2.3 | ✅ [M-J2-S2](./mockups/M-J2-S2.html) |
| 3 | 편집기 tab으로 **컨테이너 파일시스템** 파일을 열고 편집·저장. Claude Code는 컨테이너 내부에서 실행. | AC2.3 | ✅ [M-J2-S3](./mockups/M-J2-S3.html) |
| 4 | pane/tab을 추가해도 모두 같은 컨테이너 환경(작업 디렉토리·env) 상속. 한 워크스페이스 안에서 backend 혼합 없음. | AC2.4 | ✅ [M-J2-S4](./mockups/M-J2-S4.html) |
| 5 | host 워크스페이스와 **동일한 단축키·UI**로 조작 — 새 조작 학습 없음. | AC2.5 | ✅ [M-J2-S5](./mockups/M-J2-S5.html) |
| 6 | 컨테이너 생명주기(정지/재시작) 관리. 터미널 입출력 지연이 호스트에 준하는 체감 응답성. | AC2.6 | ✅ [M-J2-S6](./mockups/M-J2-S6.html) |

## 완료 상태

도구와 조작을 그대로 유지한 채 워크스페이스 환경을 컨테이너로 선택·운용한다 → **V2 달성**.
컨테이너가 "원격에 붙은 부속물"처럼 느껴지지 않는다.

## 시각화 상태

이 여정의 6개 단계가 모두 mockup으로 작성·연결되었다(✅ 6/6). 갤러리는 [`mockups/index.html`](./mockups/index.html),
mockup↔여정↔가치 매핑은 [`mockups/tessera-mockup-index.md`](./mockups/tessera-mockup-index.md)를 참조한다.

> 시각화 범례: ⬜ = mockup 미작성 / ✅ = mockup 작성·연결됨. 위 표의 ✅ 항목은 `mockups/` 아래 자체 완결 HTML로 연결된다.
