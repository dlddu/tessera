# 사용자 여정 J1 — 통합 작업 표면 구성

- **여정 ID**: J1
- **여정 슬러그 ID**: `JRN-layout` (여정 문서 파일명의 영역 슬러그에서 파생 — mockup 페이지의 `data-journey` 값)
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

| 단계 ID | 단계 | 사용자 행동 · 시스템 반응 | 근거 AC | 시각화 |
|---------|------|---------------------------|---------|--------|
| `STP-workspace-create` | 1 | 앱 실행 → "새 워크스페이스" 생성. backend는 **host**, 작업 디렉토리 지정. | AC2.1 | ✅ [여정 페이지](./mockups/journeys/JRN-layout.html#STP-workspace-create) |
| `STP-terminal-tab` | 2 | 빈 window가 열림. 첫 tab으로 **터미널**을 선택·생성 → 호스트 셸 PTY 동작. | AC1.1, AC2.2 | ✅ [여정 페이지](./mockups/journeys/JRN-layout.html#STP-terminal-tab) |
| `STP-split-editor` | 3 | window를 수직 분할해 pane 추가, 새 pane에 **편집기** tab 생성·호스트 파일 열기. | AC1.2, AC1.1, AC2.2 | ✅ [여정 페이지](./mockups/journeys/JRN-layout.html#STP-split-editor) |
| `STP-quad-layout` | 4 | 추가 분할로 **브라우저** tab·**Claude Code GUI** tab을 더해 2×2 레이아웃 완성(4종 공존). | AC1.1, AC1.2 | ✅ [여정 페이지](./mockups/journeys/JRN-layout.html#STP-quad-layout) |
| `STP-tab-move-focus` | 5 | tab을 다른 pane으로 드래그 이동·순서 재정렬, 마우스 없이 단축키로 포커스/tab 전환. | AC1.3, AC1.4 | ✅ [여정 페이지](./mockups/journeys/JRN-layout.html#STP-tab-move-focus) |
| `STP-layout-persist` | 6 | 구성한 레이아웃 골격을 저장(직렬화) → 다음 실행 시 동일 골격으로 재구성. | AC1.5 | ✅ [여정 페이지](./mockups/journeys/JRN-layout.html#STP-layout-persist) |
| `STP-pane-zoom` | 7 | 한 작업에 집중할 때 포커스된 pane을 전체화면으로 확대(zoom, ⇧⌘⏎)했다가 단축키/Esc로 2×2 레이아웃 그대로 복귀. 확대는 포커스를 따라가고, zoom 상태는 골격에 저장돼 재시작 후에도 유지. | AC1.6 | ✅ [여정 페이지](./mockups/journeys/JRN-layout.html#STP-pane-zoom) |
| `STP-workspace-switch` | 8 | 여러 workspace를 만들어 두고, 단일 창의 **workspace 목록**에서 다른 workspace를 선택해 활성 화면을 전환(이전 workspace의 pane/tab 상태는 보존). | AC1.7 | ✅ [여정 페이지](./mockups/journeys/JRN-layout.html#STP-workspace-switch) |

## 완료 상태

4종 컴포넌트를 단일 window/pane/tab 표면에서 배치·전환·재정렬하고, 필요할 때 한 pane을 전체화면으로
확대(zoom)했다가 레이아웃 손실 없이 복귀할 수 있다(zoom 상태도 골격에 저장돼 재시작 후 유지). 나아가 여러 workspace를 단일 창의 목록에서 전환하며 같은 표면
안에서 작업 단위 사이를 오갈 수 있다 → **V1 달성**.
개발자는 앱 사이를 오가지 않고 하나의 표면에서 작업을 시작한다.

## 시각화 상태

이 여정의 8개 단계가 모두 시각화되어 있고(✅ 8/8), **여정 단위 mockup 페이지 1개**
[`mockups/journeys/JRN-layout.html`](./mockups/journeys/JRN-layout.html)가 8단계를 한 페이지에서
걸어볼 수 있게 담는다 — 단계 전환·현재 위치·`#STP-<슬러그>` 딥링크·단계별 전진 조작을 갖춘다.
갤러리는 [`mockups/index.html`](./mockups/index.html), mockup↔여정↔가치 매핑은
[`mockups/tessera-mockup-index.md`](./mockups/tessera-mockup-index.md)를 참조한다.

**단계 식별자**: 위 표의 「단계 ID」 열(`STP-<슬러그>`)이 이 여정 단계 식별자의 단일 소스이며,
mockup 페이지의 `data-step` 값과 정확히 같은 집합이다(양방향 대조 가능). 이관 전 화면 단위 목업 ID
`M-J1-S<m>`은 폐기하지 않고 페이지의 `data-legacy-id`와 mockup 인덱스에 **legacy alias**로 남는다 —
`src/`·`test/` 주석 40곳이 그 이름을 인용하기 때문이다(`#M-J1-S3` 형태의 옛 해시도 해당 단계로 연결된다).

> 시각화 범례: ⬜ = mockup 미작성 / ✅ = mockup 작성·연결됨. 위 표의 ✅ 항목은 여정 단위 페이지의
> 해당 단계 앵커로 연결된다(빌드·네트워크 없이 열리는 자체 완결 정적 HTML).
