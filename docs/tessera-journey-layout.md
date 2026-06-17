# 사용자 여정 J1 — 통합 작업 표면 구성

- **여정 ID**: J1
- **참조 가치 문서**: `tessera-values.md`
- **여정 인덱스**: `tessera-user-journeys.md`
- **관련 PRD / 테스트**: PRD-1 (`tessera-prd-layout.md`) / T-1 (`tessera-test-layout.md`)

## 페르소나 · 상황

- **페르소나**: macOS에서 일하는 개발자 (주 페르소나 정의는 `tessera-user-journeys.md` 참조).
- **상황**: Tessera를 처음 실행한 상태. 흩어진 앱 대신 하나의 표면에서 작업을 시작하려 한다.

## 달성 가치

- **V1(통합된 단일 작업 표면)** — 주
- **V2(환경 선택의 자유)** — 부 (워크스페이스 생성 시 host backend 선택)

## 트리거

앱 첫 실행, 빈 상태.

## 단계

| 단계 | 사용자 행동 · 시스템 반응 | 근거 AC | 시각화 |
|------|---------------------------|---------|--------|
| 1 | 앱 실행 → "새 워크스페이스" 생성. backend는 **host**, 작업 디렉토리 지정. | AC2.1 | ✅ [M-J1-S1](./mockups/M-J1-S1.html) |
| 2 | 빈 window가 열림. 첫 tab으로 **터미널**을 선택·생성 → 호스트 셸 PTY 동작. | AC1.1, AC2.2 | ✅ [M-J1-S2](./mockups/M-J1-S2.html) |
| 3 | window를 수직 분할해 pane 추가, 새 pane에 **편집기** tab 생성·호스트 파일 열기. | AC1.2, AC1.1, AC2.2 | ✅ [M-J1-S3](./mockups/M-J1-S3.html) |
| 4 | 추가 분할로 **브라우저** tab·**Claude Code GUI** tab을 더해 2×2 레이아웃 완성(4종 공존). | AC1.1, AC1.2 | ✅ [M-J1-S4](./mockups/M-J1-S4.html) |
| 5 | tab을 다른 pane으로 드래그 이동·순서 재정렬, 마우스 없이 단축키로 포커스/tab 전환. | AC1.3, AC1.4 | ✅ [M-J1-S5](./mockups/M-J1-S5.html) |
| 6 | 구성한 레이아웃 골격을 저장(직렬화) → 다음 실행 시 동일 골격으로 재구성. | AC1.5 | ✅ [M-J1-S6](./mockups/M-J1-S6.html) |

## 완료 상태

4종 컴포넌트를 단일 window/pane/tab 표면에서 배치·전환·재정렬할 수 있다 → **V1 달성**.
개발자는 앱 사이를 오가지 않고 하나의 표면에서 작업을 시작한다.

## 시각화 상태

이 여정의 6개 단계가 모두 mockup으로 작성·연결되었다(✅ 6/6). 갤러리는 [`mockups/index.html`](./mockups/index.html),
mockup↔여정↔가치 매핑은 [`mockups/tessera-mockup-index.md`](./mockups/tessera-mockup-index.md)를 참조한다.

> 시각화 범례: ⬜ = mockup 미작성 / ✅ = mockup 작성·연결됨. 위 표의 ✅ 항목은 `mockups/` 아래 자체 완결 HTML로 연결된다.
