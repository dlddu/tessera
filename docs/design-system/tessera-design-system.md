# Tessera 디자인 시스템

> 이 문서는 Tessera 화면을 그리는 **시각 언어**의 정의다. 모든 mockup은 이 문서가 정의한 토큰·컴포넌트·패턴만 사용해야 하며,
> 임의 값을 쓰면 `tessera-doc-tracker.md`의 "임의 스타일 mockup" 위험으로 잡힌다.
>
> - 최상위 판단 기준(참조 전용): `../tessera-values.md`
> - 시각화 대상 흐름: `../tessera-user-journeys.md` (J1~J4)
> - 이 시스템의 코드 구현(모든 mockup이 import): `tessera.css`
> - mockup ↔ 가치/여정/디자인시스템 연결의 단일 소스: `../mockups/tessera-mockup-index.md`

## 디자인 방향 — "모자이크 워크벤치 (Mosaic Workbench)"

제품명 Tessera는 *모자이크를 이루는 작은 타일(tessera)*에서 왔다. 제품의 본질도 같다: 흩어진 도구(터미널·브라우저·편집기·Claude Code)를
**타일(pane)** 로 잘라 하나의 표면 위에 끼워 맞춘다(V1). 이 비유를 시각 언어의 중심에 둔다.

세 가지 결정이 방향을 만든다.

1. **그라우트와 타일** — pane들은 어두운 *그라우트(gutter)* 위에 떠 있는 타일이다. 타일 사이의 6px 간극이 "조각들이 맞물린 표면"이라는 인상을 만든다. 화면 골격 자체가 모자이크다.
2. **컴포넌트 정체성 색** — 4종 컴포넌트는 각자의 타일 색을 가진다(터미널=민트, 편집기=페리윙클, 브라우저=앰버, Claude=클레이). 단 색은 **2px 정체성 스트라이프와 6px 점**으로만 쓰고 면을 칠하지 않는다 — 화면 전체는 차분한 다크로 유지하고, 정체성 색이 유일한 표현 시스템이다.
3. **macOS 윈도우 + 멀티플렉서 상태줄** — 실제로 macOS Electron 앱이므로 신호등(traffic lights)이 달린 윈도우 크롬을 그대로 쓴다. 하단에는 tmux 상태줄을 닮은 모노스페이스 status bar가 workspace·backend·키맵을 항상 노출한다.

**시그니처**: 2×2 타일 글리프인 *tessera mark*(`C-mark`)와, 타일+그라우트로 짜인 레이아웃 골격 그 자체.

타이포는 IBM Plex 패밀리를 쓴다 — 엔지니어링/기술 제품을 위해 설계된 가족이라 개발 도구라는 주제에 정확히 맞고, Sans/Mono가 한 가족으로 묶여 UI 크롬과 터미널·코드가 일관된다.

---

## 1. 토큰 (Tokens)

가장 작은 시각 단위. CSS 변수로 `tessera.css`의 `:root`에 구현된다. 토큰 그룹은 안정 ID `T-*`를 가진다.

### `T-color` — 표면·텍스트·라인

| 변수 | 값 | 용도 |
|---|---|---|
| `--grout` | `#0D0F14` | 윈도우/그라우트 — 타일 사이 가장 어두운 배경 |
| `--tile` | `#161A22` | pane(타일) 본문 표면 |
| `--tile-raise` | `#1E232E` | 솟은 표면 — 타이틀바, 탭바, 상태바, 다이얼로그 |
| `--line` | `#2A3140` | 경계선·구분선(헤어라인) |
| `--line-soft` | `#222836` | 약한 구분선·내부 분할 |
| `--ink` | `#E7EBF2` | 1차 텍스트 |
| `--muted` | `#99A1B3` | 2차 텍스트 |
| `--faint` | `#636C80` | 3차 텍스트·비활성·라인넘버 |

### `T-identity` — 컴포넌트 정체성 색

4종 컴포넌트를 구분하는 타일 색. **스트라이프(2px)와 점(6px)에만** 사용한다.

| 변수 | 값 | 컴포넌트 |
|---|---|---|
| `--id-term` | `#56D3A6` | 터미널 (민트) |
| `--id-edit` | `#7CA2F8` | 텍스트 편집기 (페리윙클) |
| `--id-web` | `#E2A75A` | 인터넷 브라우저 (앰버) |
| `--id-claude` | `#D88C6E` | Claude Code GUI (클레이) |

### `T-semantic` — 의미 색

| 변수 | 값 | 의미 |
|---|---|---|
| `--brand` | `#6D8BFF` | 브랜드 강조 — 1차 버튼·포커스 링·선택·tessera mark 강조 |
| `--ok` | `#56D3A6` | 정상·실행 중·복원 완료 |
| `--warn` | `#E2A75A` | 주의·중간 보존·지연 |
| `--danger` | `#F0766B` | 비정상 종료·충돌·끊김 |
| `--route` | `#B98BF0` | 라우팅·포트 포워딩 (J3 전용 시각 신호) |

### `T-type` — 타이포그래피

- `--font-ui`: `"IBM Plex Sans", system-ui, sans-serif`
- `--font-mono`: `"IBM Plex Mono", ui-monospace, "SF Mono", monospace`
- 크기: `11`(상태바/캡션) · `12`(보조) · `13`(UI 기본/본문) · `14`(강조) · `16`(다이얼로그 제목)
- 굵기: `400`(본문) · `500`(라벨/탭) · `600`(제목/버튼)
- 모노 크기: `12`~`13` (터미널·코드·경로·키맵·env)

### `T-space` — 스페이싱 스케일

`2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32` (px). 타일 간 그라우트 = `6`.

### `T-radius` / `T-elevation` / `T-motion`

- 반경: 타일 `6` · 카드/다이얼로그 `10` · 칩 `6` · pill `999`
- 그림자: `--shadow-dialog`(모달), `--shadow-toast`(토스트)
- 모션: `--blink`(터미널 커서) · `--spin`(작업 스피너) · `--pulse`(live 점) · `--shimmer`(복원 중). 모두 `prefers-reduced-motion: reduce`에서 정지.

---

## 2. 컴포넌트 (Components)

재사용되는 UI 요소. 각 컴포넌트는 안정 ID `C-*`를 가지며, mockup 인덱스가 이 ID로 사용처를 추적한다.

| ID | 이름 | 설명 |
|---|---|---|
| `C-window` | 앱 윈도우 | macOS 윈도우 프레임. 좌측 신호등(빨강/노랑/초록), 타이틀바에 workspace 이름·backend 배지 |
| `C-statusbar` | 상태줄 | 하단 tmux 스타일 모노스페이스 바. 좌: mark+workspace / 중: backend / 우: 키맵 힌트+시계 |
| `C-workspace-rail` | 워크스페이스 레일 | 단일 창 좌측의 workspace 목록/스위처. 각 항목: backend 점 + 이름 + ⌘N 힌트, 활성 항목 강조, 하단 "새 워크스페이스" (J1) |
| `C-pane` | pane(타일) | 그라우트 위 타일. 상단 2px 정체성 스트라이프 + 탭바 + 콘텐츠 |
| `C-tabbar` | 탭바 | pane 상단 탭 스트립. `+`로 새 탭 |
| `C-tab` | 탭 | 6px 정체성 점 + 라벨 + 닫기 `×`. 활성 탭은 밝고 점 불투명, 비활성은 muted |
| `C-terminal` | 터미널 표면 | 모노 프롬프트·출력, 블록 커서. host/컨테이너 프롬프트 구분 |
| `C-editor` | 편집기 표면 | 라인넘버 거터 + 경로 브레드크럼 + 최소 구문 색(편집기 정체성 hue) |
| `C-browser` | 브라우저 표면 | pill 주소창 + 탭 행 + 페이지 뷰포트(또는 IdP 로그인 카드) |
| `C-claude` | Claude Code 표면 | 대화형 턴(사용자/어시스턴트) + 실행 표시 + 입력창. 클레이 점 강조 |
| `C-dialog` | 모달 다이얼로그 | scrim 위 카드. 헤더(mark+제목)·본문 필드·푸터 액션 |
| `C-field` | 폼 필드 | 텍스트·경로 선택·목록 입력 |
| `C-segmented` | 분절 토글 | host ↔ container backend 선택 등 2분절 컨트롤 |
| `C-keycap` | 키캡 | 단축키 힌트 칩 (예: `⌘` `⏎`). 키처럼 하단 그림자 |
| `C-toast` | 토스트 | 우하단 부유 칩. 좌측 의미색 보더 + 아이콘 + 텍스트 |
| `C-banner` | 배너 | pane/윈도우 내 인라인 상태 띠 (warn/danger/info) |
| `C-badge` | 배지 | 상태 칩 — host·container·live·read-only 등 |
| `C-palette` | 커맨드 팔레트 | 중앙 오버레이 검색 + 결과 목록 + 키맵 |
| `C-backend-panel` | backend 패널 | 컨테이너 생명주기(정지/재시작) + 응답성(latency) 표시 |
| `C-flowmap` | 흐름맵 | host↔container URL 전달/콜백 포워딩 미니 다이어그램 (J3) |
| `C-conflict` | 충돌 목록 | 보존 상태 ↔ 디스크/새 backend 불일치 해소 UI (J4) |
| `C-mark` | tessera mark | 2×2 타일 글리프 시그니처. 한 칸이 `--brand`. 상태바·다이얼로그·스플래시 |

> 각 컴포넌트의 클래스/마크업은 `tessera.css`에 구현돼 있다. 컴포넌트를 추가·변경하면 이 표와 `tessera.css`를 함께 갱신한다.

---

## 3. 패턴 (Patterns)

컴포넌트의 조합·레이아웃 규칙. 안정 ID `P-*`.

| ID | 이름 | 설명 | 주 사용 여정 |
|---|---|---|---|
| `P-single` | 단일 타일 | 하나의 pane이 workspace를 채움 | J1-S2, J1-S7, J2-S2 |
| `P-split-v` | 수직 분할 | 두 pane이 좌우로 | J1-S3 |
| `P-grid-2x2` | 2×2 모자이크 | 4종 컴포넌트 타일이 격자로 공존 | J1-S4, J2-S4 |
| `P-modal-over-quiet` | 빈 표면 위 모달 | 조용한/빈 workspace 위 다이얼로그 | J1-S1, J2-S1 |
| `P-overlay` | 라이브 위 오버레이 | 동작 중 레이아웃 위 토스트·팔레트·드롭 타깃 | J1-S5, J1-S7, J2-S5, J3-S2 |
| `P-flowmap` | 라우팅 흐름맵 | host↔container URL 전달·콜백 포워딩을 보여주는 미니 다이어그램 레이아웃 | J3-S2, J3-S4, J3-S6 |
| `P-restore` | 복원 프레이밍 | 흐려진(read-only) 타일 + 상태 배너 | J4-S1~S4 |
| `P-workspace-rail` | 워크스페이스 레일 | 단일 창 안에서 좌측 workspace 목록 레일과 활성 workspace 표면을 나란히 배치(목록에서 전환) | J1-S8 |

---

## 4. 사용 규칙 (mockup이 지켜야 할 것)

1. **색은 토큰에서만.** 하드코딩 hex 금지. 정체성 색은 스트라이프/점에만.
2. **타일은 항상 그라우트 위에.** pane 간 간극 = `T-space`의 `6`.
3. **상태줄은 모든 앱 화면에 존재.** workspace·backend가 항상 보여야 한다(V1/V2를 화면이 증명).
4. **backend는 화면에서 식별 가능.** host/container는 `C-badge`·상태줄·프롬프트로 구분(V2).
5. **정체성 일관.** 같은 컴포넌트는 어느 pane에 있든 같은 정체성 색.
6. **품질 바닥:** 키보드 포커스 가시화, `prefers-reduced-motion` 존중, 모바일까지 깨지지 않게.

---

## 문서 체계 안내

- 디자인 시스템(이 문서): `tessera-design-system.md`
- 구현 CSS(모든 mockup이 `<link>`): `tessera.css`
- mockup HTML: `../mockups/M-Jx-Sn.html`
- mockup 갤러리(전체 미리보기): `../mockups/index.html`
- mockup 인덱스(단일 소스): `../mockups/tessera-mockup-index.md`
- 상태 추적: `../tessera-doc-tracker.md`
