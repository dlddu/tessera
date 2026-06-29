# Tessera Mockup 인덱스

27개 mockup이 각각 어느 **사용자 여정 단계 / 제품 가치 / Acceptance Criteria / 디자인 시스템 항목**을
시각화하는지 매핑하는 단일 소스. mockup·여정·디자인 시스템 사이의 연결은 이 표를 기준으로 추적한다.

- **갤러리**: [`index.html`](./index.html) — 27개 미리보기 한 페이지
- **디자인 시스템**: [`../design-system/tessera-design-system.md`](../design-system/tessera-design-system.md) · 스타일 구현 [`../design-system/tessera.css`](../design-system/tessera.css)
- **여정 인덱스**: [`../tessera-user-journeys.md`](../tessera-user-journeys.md)
- **가치 문서**: [`../tessera-values.md`](../tessera-values.md)

각 mockup HTML은 빌드 없이 그대로 열리는 자체 완결 정적 파일이며, 공유 `tessera.css` 한 장을
`<link>`로 참조한다(디자인 시스템 변경이 전체 mockup에 전파됨). 상단 캡션 바(화면 ID·단계·가치·AC·패턴)는
**문서용 라벨**이며 제품 UI가 아니다.

---

## 디자인 방향 — "모자이크 워크벤치"

Tessera라는 이름은 모자이크 타일(tesserae)에서 왔다. pane은 어두운 **그라우트(gutter)** 위에 놓인
타일이고, 각 작업 표면이 하나의 타일이 된다. 4종 컴포넌트는 가는 정체성 색(2px 스트라이프 + 점)으로만
구분한다 — 색을 남발하지 않고 콘텐츠가 주인공이 되게 한다.

| 컴포넌트 | 정체성 색 | 토큰 |
|----------|-----------|------|
| 터미널 | 민트 | `--id-term` |
| 편집기 | 페리윙클 | `--id-edit` |
| 브라우저 | 앰버 | `--id-web` |
| Claude Code | 클레이 | `--id-claude` |

다크 테마, macOS 윈도우(신호등) + tmux 스타일 하단 상태바, 2×2 타일 글리프 시그니처.
UI 크롬은 한국어, 터미널·코드·경로는 영어. 자세한 규칙은 디자인 시스템 문서를 참조한다.

---

## J1 — 통합된 단일 작업 표면 (host backend)

가치: **V1**(주) · V2(부) · 여정 문서 [`../tessera-journey-layout.md`](../tessera-journey-layout.md)

| Mockup | 단계 | 화면 | 가치 | AC | 패턴 · 주요 DS 컴포넌트 |
|--------|------|------|------|-----|--------------------------|
| [M-J1-S1](./M-J1-S1.html) | 1 | 새 워크스페이스 생성 (backend: host) | V1·V2 | AC2.1 | `P-modal-over-quiet` · C-dialog, C-segmented, C-field |
| [M-J1-S2](./M-J1-S2.html) | 2 | 첫 탭: 호스트 셸 터미널 (단일 pane) | V1·V2 | AC1.1·AC2.2 | `P-single` · C-window, C-pane, C-terminal, C-statusbar |
| [M-J1-S3](./M-J1-S3.html) | 3 | 수직 분할 → 편집기로 호스트 파일 열기 | V1 | AC1.2·AC1.1·AC2.2 | `P-split-v` · C-pane, C-editor |
| [M-J1-S4](./M-J1-S4.html) | 4 | **2×2 레이아웃 — 4종 컴포넌트 공존** | V1 | AC1.1·AC1.2 | `P-grid-2x2` · C-terminal, C-editor, C-browser, C-claude |
| [M-J1-S5](./M-J1-S5.html) | 5 | 탭 드래그 이동 · 단축키 포커스/전환 | V1 | AC1.3·AC1.4 | `P-overlay` · C-tab(drag), C-keycap, C-toast |
| [M-J1-S6](./M-J1-S6.html) | 6 | 레이아웃 골격 직렬화 저장 → 다음 실행 재구성 | V1 | AC1.5 | `P-overlay` · C-toast, C-mark |
| [M-J1-S7](./M-J1-S7.html) | 7 | **포커스된 pane 전체화면(zoom) 토글 → 레이아웃 보존 복귀 (영속·zoom-follows-focus)** | V1 | AC1.6 | `P-single`·`P-overlay` · C-pane(zoom), C-keycap, C-toast, C-badge |
| [M-J1-S8](./M-J1-S8.html) | 8 | **워크스페이스 목록에서 전환 — 단일 창, 활성 workspace 표시** | V1 | AC1.7 | `P-workspace-rail` · C-workspace-rail, C-window, C-pane ×2, C-terminal, C-editor |

## J2 — 환경 선택의 자유 (container backend)

가치: **V2**(주) · V1(부) · 여정 문서 [`../tessera-journey-backend.md`](../tessera-journey-backend.md)

| Mockup | 단계 | 화면 | 가치 | AC | 패턴 · 주요 DS 컴포넌트 |
|--------|------|------|------|-----|--------------------------|
| [M-J2-S1](./M-J2-S1.html) | 1 | 컨테이너 백엔드 워크스페이스 생성 (이미지·마운트) | V2·V1 | AC2.1 | `P-modal-over-quiet` · C-dialog, C-segmented(cont) |
| [M-J2-S2](./M-J2-S2.html) | 2 | 컨테이너 터미널 exec — 호스트와 격리 | V2 | AC2.3 | `P-single` · C-banner(info), C-badge(cont·live) |
| [M-J2-S3](./M-J2-S3.html) | 3 | 컨테이너 FS 편집 · Claude Code도 컨테이너 내부 | V2 | AC2.3 | `P-split-v` · C-editor, C-claude |
| [M-J2-S4](./M-J2-S4.html) | 4 | 2×2 — 모든 pane이 동일 컨테이너 환경 상속 | V2 | AC2.4 | `P-grid-2x2` · C-badge(cont) |
| [M-J2-S5](./M-J2-S5.html) | 5 | host와 동일한 단축키·UI (parity) | V2 | AC2.5 | `P-overlay` · C-palette, C-keycap |
| [M-J2-S6](./M-J2-S6.html) | 6 | 컨테이너 생명주기 관리 · 호스트급 응답성 | V2 | AC2.6 | `P-overlay` · C-backend-panel(gauge·metric) |
| [M-J2-S7](./M-J2-S7.html) | 7 | host 전용 영역에서 호스트 도구 실행 · 영역 경계 구분 | V2 | AC2.7·AC2.8 | `P-grid-2x2`(host 영역 표식) · C-badge(host), C-pane |

## J3 — 격리를 깨지 않는 인증 경험 (OAuth 라우팅)

가치: **V3**(주) · V2(부) · 여정 문서 [`../tessera-journey-browser-routing.md`](../tessera-journey-browser-routing.md)

| Mockup | 단계 | 화면 | 가치 | AC | 패턴 · 주요 DS 컴포넌트 |
|--------|------|------|------|-----|--------------------------|
| [M-J3-S1](./M-J3-S1.html) | 1 | 컨테이너 터미널에서 OAuth 시작 | V3·V2 | AC3.2 | `P-single` · C-terminal, C-banner(info) |
| [M-J3-S2](./M-J3-S2.html) | 2 | auth URL을 호스트 브라우저로 라우팅 (방향 A) | V3 | AC3.1·AC3.2 | `P-flowmap` · C-flowmap, C-browser(idp) |
| [M-J3-S3](./M-J3-S3.html) | 3 | 호스트 브라우저 IdP 로그인 — 기존 세션 재사용 | V3 | AC3.4 | `P-overlay` · C-browser, C-banner |
| [M-J3-S4](./M-J3-S4.html) | 4 | 콜백 포트를 호스트→컨테이너 포워딩 (방향 B) | V3 | AC3.3 | `P-flowmap` · C-flowmap |
| [M-J3-S5](./M-J3-S5.html) | 5 | 컨테이너 콜백 수신 → 토큰 획득, 루프 완결 | V3 | AC3.4 | `P-single` · C-terminal, C-banner(ok) |
| [M-J3-S6](./M-J3-S6.html) | 6 | 다중 컨테이너 — 포트 충돌·오배달 없음 | V3 | AC3.5 | `P-flowmap` · C-flowmap ×2 |

## J4 — 작업 손실 없는 복원력 (크래시 복원)

가치: **V4**(주) · V1(부) · 여정 문서 [`../tessera-journey-state-restoration.md`](../tessera-journey-state-restoration.md)

> 핵심 구분: **읽기 전용 중간 보존 뷰(S1)** 와 **백엔드 재기동 후 상태 재적용으로 완료되는 사용 가능 복원(S3)** 은 다르다.

| Mockup | 단계 | 화면 | 가치 | AC | 패턴 · 주요 DS 컴포넌트 |
|--------|------|------|------|-----|--------------------------|
| [M-J4-S1](./M-J4-S1.html) | 1 | 백엔드 종료 → 읽기 전용 중간 보존 뷰 | V4·V1 | AC4.1·4.2·4.3 | `P-restore` · C-banner(danger), C-badge(down·ro), pane.dim |
| [M-J4-S2](./M-J4-S2.html) | 2 | 백엔드 재기동 (복원 전제 조건) | V4 | AC4.5 | `P-restore` · C-banner(warn), restore-list |
| [M-J4-S3](./M-J4-S3.html) | 3 | **상태 재적용(rehydrate) → 사용 가능 복원** | V4 | AC4.1·4.2·4.3 | `P-restore` · C-banner(ok), restore-list, C-terminal(new PTY) |
| [M-J4-S4](./M-J4-S4.html) | 4 | 앱 종료 → 영속 저장소 복원 (브라우저 탭 포함) | V4·V1 | AC1.5·4.4·4.5 | `P-restore` · win--restart, splash, restore-list |
| [M-J4-S5](./M-J4-S5.html) | 5 | 영속 저장은 backend/app 수명과 독립 (docker rm 생존) | V4 | AC4.5 | `P-restore` · C-terminal, restore-list |
| [M-J4-S6](./M-J4-S6.html) | 6 | 보존 상태 ↔ 실제 불일치 감지·해소 (손실 0) | V4 | AC4.6 | `P-restore` · C-conflict, C-banner(warn) |

---

## 커버리지

- **여정 단계 시각화**: 27 / 27 (J1 8/8 · J2 7/7 · J3 6/6 · J4 6/6)
- **가치 커버리지**: V1(J1 전체 + J4 부) · V2(J2 전체 + J3 부) · V3(J3 전체) · V4(J4 전체) — 4/4 가치 모두 시각화됨
- **디자인 시스템 컴포넌트**: 디자인 시스템 문서에 정의된 C-* 컴포넌트 전부가 최소 1개 mockup에서 사용됨

> 범례: ✅ = mockup 작성·연결됨. 여정 문서의 각 단계는 위 표의 해당 mockup으로 연결된다.
