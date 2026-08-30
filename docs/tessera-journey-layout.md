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
| 1 | 앱을 처음 열면 빈 상태다. ⌘N으로 새 워크스페이스를 만들고 backend는 **host**, 작업 디렉토리는 `~/code/api-svc`를 고른다. | AC2.1 | ✅ [M-J1-S1](./mockups/M-J1-S1.html) |
| 2 | 빈 window에서 첫 tab으로 **터미널**을 열어, 평소 쓰던 호스트 셸에 그대로 `npm run dev`를 친다. | AC1.1, AC2.2 | ✅ [M-J1-S2](./mockups/M-J1-S2.html) |
| 3 | 서버 로그를 띄워둔 채로 코드를 고치고 싶어 ⌘D로 window를 수직 분할하고, 새 pane에 **편집기** tab을 열어 호스트 파일을 편집한다. | AC1.2, AC1.1, AC2.2 | ✅ [M-J1-S3](./mockups/M-J1-S3.html) |
| 4 | 응답을 확인할 **브라우저** tab과 수정을 맡길 **Claude Code** tab을 더 붙여 2×2를 만든다 — 4종이 한 화면에 놓여 앱 전환이 사라진다. | AC1.1, AC1.2 | ✅ [M-J1-S4](./mockups/M-J1-S4.html) |
| 5 | 배치가 어긋나 tab을 다른 pane으로 끌어다 놓고 순서를 정리한 뒤로는, 키보드에서 손을 떼지 않고 ⌥⌘←→로 포커스를, ⇧⌘[ ]로 tab을 옮긴다. | AC1.3, AC1.4 | ✅ [M-J1-S5](./mockups/M-J1-S5.html) |
| 6 | 하루 작업을 끝내고 앱을 닫았다가 다음 날 다시 연다 — 어제 짜둔 pane/tab 골격이 그대로 재구성돼 있어 배치를 다시 만들지 않는다. | AC1.5 | ✅ [M-J1-S6](./mockups/M-J1-S6.html) |
| 7 | 실패한 테스트 로그를 파고들 때 ⇧⌘⏎로 포커스된 pane만 전체화면으로 키우고, 다 보면 Esc로 2×2에 그대로 돌아온다. 확대한 채 앱을 재시작해도 그 상태로 뜬다. | AC1.6 | ✅ [M-J1-S7](./mockups/M-J1-S7.html) |
| 8 | 다른 프로젝트 요청이 들어와 두 번째 워크스페이스를 만든다. 창을 새로 띄우는 대신 좌측 목록에서 ⌘2로 오가며 작업하고, 떠나 있던 워크스페이스의 pane/tab은 돌아오면 그대로 살아 있다. | AC1.7 | ✅ [M-J1-S8](./mockups/M-J1-S8.html) |

## 완료 상태

4종 컴포넌트를 단일 window/pane/tab 표면에서 배치·전환·재정렬하고, 필요할 때 한 pane을 전체화면으로
확대(zoom)했다가 레이아웃 손실 없이 복귀할 수 있다(zoom 상태도 골격에 저장돼 재시작 후 유지). 나아가 여러 workspace를 단일 창의 목록에서 전환하며 같은 표면
안에서 작업 단위 사이를 오갈 수 있다 → **V1 달성**.
개발자는 앱 사이를 오가지 않고 하나의 표면에서 작업을 시작한다.

## 시각화 상태

이 여정의 8개 단계가 모두 mockup으로 작성·연결되었다(✅ 8/8). 갤러리는 [`mockups/index.html`](./mockups/index.html),
mockup↔여정↔가치 매핑은 [`mockups/tessera-mockup-index.md`](./mockups/tessera-mockup-index.md)를 참조한다.

> 시각화 범례: ⬜ = mockup 미작성 / ✅ = mockup 작성·연결됨. 위 표의 ✅ 항목은 `mockups/` 아래 자체 완결 HTML로 연결된다.
