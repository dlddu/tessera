# Tessera 문서 체계 상태 추적

> 산출 시점: 2026-06-17 · 최초 생성(초기 일괄 구축)
> 최근 갱신: 2026-08-08 · **AC2.6 컨테이너 생명주기 + 터미널 응답성 측정 구현 → AC2.6 완결**(정합성 criterion ①, AC 정의 불변) — AC2.6이 요구하는 두 축을 모두 구현했다. (생명주기) `ContainerRuntime`에 `stopMachine`/`bootMachine`/`removeMachine`을 더해 `container machine stop|rm <name>`으로 정지·제거하고, 별도 `machine start`가 없으므로 부팅은 "`machine run`이 정지된 머신을 먼저 부팅한다"는 성질을 이용한 무해한 일회성 명령(`:`)으로 태운다 — 재시작은 stop→boot다(이미 정지된 머신은 `machine stop`이 에러이므로 boot만 수행). `ContainerBackend.stop/restart/remove`가 `status`를 stopped/starting/running/error로 정확히 전이시키고, `backend.lifecycle` IPC의 `NotImplementedError` 스텁이 실제 핸들러(action = status·stop·restart·remove)로 교체됐다. 실패는 invoke 거부가 아니라 `message`로 실려 패널에 보인다. (응답성) 순수 모듈 `terminalLatencyRegistry`가 터미널 입력→출력 **왕복**을 표본으로 모아 최근 20개의 중앙값을 ms로 제공한다 — 이 왕복을 양끝 모두 보는 곳은 렌더러뿐이므로 측정은 렌더러에 둔다(요청 없는 출력은 표본이 되지 않고, 연타는 첫 키 기준으로 잰다). 표현은 M-J2-S6 목업 그대로의 `BackendPanel`(상태 배지·이미지·머신·지연 게이지·정지/재시작)이며 ⌃⌘B와 ⌘K 팔레트로 연다. 유닛 269 → **305건**. 집계 **구현 19 · 부분 3 · 스텁 4**(V2 6/8). **범위 밖**: M-J4-S1의 워크스페이스 전역 크롬 — 직전 슬라이스가 미룬 이유였던 '워크스페이스 단위 백엔드 헬스 신호'를 이번에 만들었으므로 이제 막힌 곳이 없으며, 그 위에 얹는 AC4.3 표현 슬라이스로 분리한다. 디자인 시스템·mockup·AC 본문·PRD·테스트 문서·여정은 불변(to-be 미하향) — 패널은 이미 `tessera.css`에 있으나 쓰는 컴포넌트가 없던 `.bepanel`·`.metric`·`.gauge`·`.belife`를 그대로 재사용하고 배치만 인라인으로 둔다. 이전 갱신(2026-08-07): **AC4.3 인세션 동결·재연결 구현 → AC4.3 완결**(정합성 criterion ①, AC 정의 불변) — 직전 슬라이스가 닫은 앱 재시작 경로(캡처·재적용)에 이어 AC4.3 본문의 나머지 절반("복원된 화면은 읽기 가능한 상태로 보존되며, 사용자에게 재연결(새 PTY) 수단을 제공한다")을 구현했다. 기존 `TerminalSurface`는 종료 사유를 보지 않고 무조건 탭을 닫아 백엔드가 죽으면 스크롤백이 탭째 사라졌다. 이제 `isAbnormalPtyExit`(순수 함수)가 정상 종료(코드 0 + signal 없음)만 탭을 닫게 하고, 그 외에는 보존 화면을 **읽기 전용으로 동결**(surfaceId 해제 = 입력 차단, 동결 시점 autosave 넛지)한 뒤 M-J4-S1 표현(danger 배너·`읽기 전용` 배지·dim)과 **재연결** 버튼을 띄운다. 재연결은 `spawn()`을 재호출해 같은 xterm 위에 새 PTY를 붙이므로 보존 화면이 그 위 히스토리로 남는다(J4 단계 3 rehydrate 형태를 스냅샷이 아니라 인세션으로). **`PtyExitEvent.signal` 전파를 함께 넣은 이유**: 강제 종료(SIGKILL/SIGTERM)는 unix에서 exitCode 0 + signal로 보고되는데 `HostBackend`/`ContainerRuntime`이 signal을 버리고 있어, 그대로면 AC4.3·T-4 시나리오 3이 규정한 검증 방법("backend를 강제 종료한 뒤")이 '정상 종료'로 오분류된다(비영속 IPC 이벤트라 v3 스냅샷 스키마 불변). 유닛 18 → 25건. 집계 **구현 18 · 부분 4 · 스텁 4**(V4 3/6). **범위 밖**: M-J4-S1의 워크스페이스 전역 크롬(타이틀바 down/ro 배지·상단 배너·전 pane dim·'백엔드 재기동' 카드) — 워크스페이스 단위 백엔드 헬스 신호가 아직 없어(`backend.lifecycle` `NotImplementedError`) 단일 PTY 종료를 '백엔드 전체 down'으로 승격할 수 없다. AC2.6과 함께 온다. 디자인 시스템·mockup·AC 본문·PRD·테스트 문서·여정은 불변(to-be 미하향) — 표현은 이미 존재하는 클래스(`.banner.danger`·`.badge.ro`·`.btn`)를 renderer 전용 `shell.css` 배치 규칙으로 조합했다. 이전 갱신(2026-08-07): **AC4.3 터미널 스크롤백 캡처·재적용 구현**(정합성 criterion ①, AC 정의 불변) — `terminalScrollbackRegistry`(순수 모듈)를 신설해 `editorStateRegistry`(AC4.1)와 동형으로 터미널의 화면+스크롤백을 캡처(`captureTerminalStates`)·호스트 스냅샷 `surfaces`에 적재·부팅 시 시드(`seedTerminalRestore`)하고, `TerminalSurface`가 마운트 시 보존된 기록을 **새 PTY 위 히스토리로 재적용**한다(J4 단계 3의 rehydrate 형태). 출력은 firehose라 autosave 디바운스를 굶기지 않도록 알림을 5초 스로틀하고, 스냅샷 무한 증식을 막도록 1000줄 상한을 둔다. **범위**: 앱 재시작 경로의 보존·재적용까지 — 인세션 백엔드 사망 시 읽기 전용 동결 뷰(M-J4-S1)와 재연결 어포던스는 미구현이라 AC4.3은 ✅가 아니라 **◐ 부분**으로 이동한다. 집계 **구현 17 · 부분 5 · 스텁 4**(V4 2/6, 완전 충족 불변). 덧붙여 검증 축 한계를 실측대로 넓혔다 — `ci.yml`이 `npm run test:e2e`를 **전혀** 호출하지 않아 AC4.1 e2e 1건이 아니라 `test/e2e/` **spec 19개 전부**가 어디서도 자동 실행되지 않는다. AC 본문·PRD·테스트 문서·여정·mockup·디자인 시스템은 불변(to-be 미하향). 이전 갱신(2026-08-07): **doc-tracker 구현 축 재동기화**(정합성 criterion ④) — PR #35(AC4.1 편집기 상태 복원 구현)가 `src/`·`test/`만 바꾸고 `docs/`를 갱신하지 않아 트래커가 AC4.1을 '✗ 스텁', AC4.5를 '`surfaces:[]`로 골격만 저장'으로 **실제와 반대로** 기술하고 있었다. 실측 기준으로 AC4.1을 ✅ 구현으로 이동하고 AC4.2/4.3/4.5의 근거 문구에서 이미 해소된 '`surfaces:[]` 고정' 사유를 걷어냈으며, 집계를 **구현 17 · 부분 4 · 스텁 5**(V4 2/6)로 재계산했다. 덧붙여 AC4.1의 신설 playwright e2e가 CI `ci` job(vitest만 실행)에 미배선이라는 검증 축 한계를 명시했다. AC 본문·PRD·테스트 문서·여정·mockup·디자인 시스템은 불변(to-be 미하향). 이전 갱신(2026-07-20): **토스트를 타이틀바 상태 칩으로 이동**(UI 표현 변경, PR #32 — AC 의미 변화 없음). 알림(레이아웃 저장 ✓ · 브라우저 라우팅됨 ◆ · 탭 드래그 ⤷)이 pane 위 우하단 부유 카드 대신 타이틀바 우측 클러스터의 `.titlebar-status` 슬롯(배지 좌측)에 pill 칩으로 뜬다 — 활성 `WorkspaceView`가 `createPortal`로 슬롯에 포털하고 `active` 게이트로 비활성 keep-alive 워크스페이스가 공유 헤더에 알림을 올리지 못하게 차단, `Window`는 `statusSlotRef`로 슬롯 노출. 브라우저 pane의 네이티브 `WebContentsView`가 겹치는 DOM 위에 그려지는 문제를 헤더 이동으로 원천 회피. 스타일 — 의미색(route/ok/warn/danger) 틴트 보더 42%·배경 14%(`color-mix`), radius 999, `toast-in` 진입 모션, 긴 설명은 `title` tooltip으로 이동(드래그 칩만 라이브 "탭 → 대상 pane" 상세를 인라인 말줄임으로 유지). 문서 동기화 — 디자인 시스템: `C-toast` 재정의(타이틀바 상태 칩)·`C-window`에 상태 칩 슬롯 추가·`P-overlay`에서 토스트 제외·T-elevation 갱신(`--shadow-toast`는 이제 키맵 힌트 오버레이용, 칩은 그림자 없음)·T-motion에 `toast-in` 추가 + 공유 `tessera.css` C-toast 블록 동기화. mockup: `M-J1-S5`(드래그)·`M-J1-S6`(저장 — 구현 문구 "레이아웃 저장됨" 정합)·`M-J1-S7`(zoom)·`M-J3-S1`(라우팅 — 상단 info 배너 → route 칩, 구현 문구 정합) 4개의 토스트를 타이틀바 칩으로 이동, mockup 인덱스 M-J3-S1 행 C-banner(info)→C-toast(route). AC 26개·mockup 27개·시각화 27/27·상태 카운트 불변(표현 변경 — 문서-구현 드리프트 해소). 이전 갱신(2026-07-11): **J3-S1+S2 방향 A(컨테이너→호스트 브라우저 라우팅) 구현 완료** (AC3.2, AC3.1 실현부). 흐름: 게스트 shim(`/usr/local/bin/{xdg-open,open,tessera-open}` + `$BROWSER` 주입, POSIX sh·`nc`→`bash /dev/tcp` 폴백·실패 시 URL 출력) → 워크스페이스별 TCP 라우팅 채널(`RoutingChannel`: 랜덤 포트+토큰, vmnet 게이트웨이 `192.168.64.1` advertise·`0.0.0.0` bind) → main `BrowserRouter.openUrlOnHost`(토큰→workspace 격리·`http(s)` 스킴 검증) → 신규 main→renderer `routing.openUrl` 이벤트 → renderer가 **포커스된 pane에 라이브 브라우저 새 탭**(`WebContentsView` 기반 `BrowserViewRegistry`, 주소창·뒤/앞/리로드·상태 스트림) + M-J3-S1 문구의 info 배너(자동 소멸). 보조 수단으로 터미널 `@xterm/addon-web-links` 클릭도 같은 라우터 경로로 라우팅(host=container 동등, AC2.5). `TabNode.url` optional 추가(스냅샷 봉투 검사·v3 스키마 불변, AC4.4 대비). **flowmap 오버레이(`P-flowmap`, M-J3-S2 하단 카드)는 의도적 제외** — 피드백은 배너만으로 최소화(범위 축소 결정). 방향 B(AC3.3~3.5: 콜백 포워딩·end-to-end 인증·동시 격리)는 범위 밖 — `BrowserRouter.forwardCallback` 스텁 유지. 검증: 비게이트 단위(`routing`: 채널 실TCP 왕복·토큰/스킴/워크스페이스 격리 거부·emit; `browser-view`: 레지스트리 create/bounds/navigate/dispose/state; `container`: `writeExecutable` 게스트 명령·라우팅 `--env` 주입·graceful degrade; `layout`: url 왕복) + e2e `M-J3-S1`(비게이트: host 워크스페이스 라우팅 수신→탭+배너)·`M-J3-S2`(게이트 `TESSERA_CONTAINER_E2E`: `xdg-open`→호스트 탭 URL, T-3 시나리오 2). AC 26개·여정 27/27·상태 카운트 불변(문서 체인은 이미 ✅, 본 갱신은 코드 구현).

## 현재 상태 요약

### 백엔드 사슬 (가치 → PRD → AC → 테스트)
- 정의된 가치: **4개** (V1~V4)
- PRD: **4개** (PRD-1~PRD-4)
- Acceptance Criteria: **26개** (가치 연결됨: 26개 / 미연결: 0개)
  - PRD-1: 7개(AC1.1~1.7), PRD-2: 8개(AC2.1~2.8), PRD-3: 5개(AC3.1~3.5), PRD-4: 6개(AC4.1~4.6)
- 테스트 문서: **4개** (T-1~T-4) — AC 커버됨: 26개 / 미커버: 0개

### 프론트엔드 사슬 (사용자 여정 → mockup ↔ 디자인 시스템)
- 사용자 여정: **4개** (J1~J4, 여정별 파일 분리 + 인덱스 1개) — 가치 연결됨: 4개 / 미연결: 0개. V1~V4 전부 달성, AC1.1~AC4.6(26개) 전부 경유.
- 디자인 시스템: **있음** (`docs/design-system/tessera-design-system.md` + 공유 `tessera.css`) — 토큰/컴포넌트(C-*)/패턴(P-*) 정의됨. 워크스페이스 레일 `C-workspace-rail`·`P-workspace-rail` 포함.
- mockup: **20개 파일 / 27단계** — 여정 단위 페이지 **1개**(`docs/mockups/journeys/JRN-layout.html`, J1 8단계) + 화면 단위 **19개**(`docs/mockups/M-J{2,3,4}-Sn.html`).
  화면 단위 → 여정 단위 이관이 진행 중이다(1/4). 이관 규약은 mockup 인덱스의 「여정 단위 페이지 규약」 절.
  / mockup 인덱스: **있음** (`docs/mockups/tessera-mockup-index.md`) + 갤러리(`index.html`)
- 여정 단계 시각화: **27 / 27단계** (J1 워크스페이스 전환 = `M-J1-S8`, J1 전체화면 토글 = `M-J1-S7`, J2 host 전용 영역 7단계 = `M-J2-S7` 포함)

- **건강 상태**: ⚠️ **위험 있음** — 🔴 제품 소유자 미확정 1건 · ⚠️ **구현 gap**: 확정 26개 AC 중 구현 19 · 부분 3 · 스텁 4(정의 to-be 미달, 아래 '구현·검증 상태' 참조). 문서 사슬(가치→PRD→AC→테스트→목업)은 완전하나 실제 구현·자동화 검증은 부분이다.

> 백엔드 연결 구조(가치→PRD→AC→테스트)는 모두 이어져 있다(AC 26개 전부 가치·테스트 연결).
> 프론트엔드 사슬은 여정→mockup↔디자인 시스템까지 모두 이어졌다(시각화 27/27).
> **주의 — 위 완결은 '문서 사슬'의 완결이다.** 실제 구현(`src/`)·자동화 검증(`test/`)은 별개 축이며, 26개 AC 중 7개(부분 3·스텁 4)가 아직 미완이다(아래 '구현·검증 상태'). 남은 위험은 제품 소유자 미확정 1건 + 구현 gap이다.

## 구현·검증 상태 (as-is · 2026-08-08 실측)

> 이 섹션은 `docs/` 문서 사슬(아래 '연결 매트릭스')과 **별개 축**인 실제 구현(`src/`)·자동화 검증(`test/`) 상태를 집계한다.
> 정의(to-be)는 26개 AC 전부가 구현·검증된 상태이며, **부분 구현은 as-is일 뿐 목표가 아니다.**
> **구현 19 · 부분 3 · 스텁 4** (완전 충족 19/26). 근거는 `src/` 실측.

| 버킷 | 개수 | AC | 근거(요약) |
|------|------|-----|-----------|
| ✅ 구현 | 19 | AC1.1~1.7, AC2.1, AC2.4, AC2.5, AC2.6, AC2.7, AC2.8, AC3.1, AC3.2, AC3.5, AC4.1, AC4.3, AC4.4 | 레이아웃 전집·백엔드 선택/상속/parity·host 전용 영역·격리·방향 A 라우팅·브라우저 탭 URL 복원이 비게이트 자동화로 실검증. AC4.1: `editorStateRegistry`가 열린 파일·미저장 버퍼·커서/선택을 캡처하고 `WorkspaceView` autosave가 `buildWorkspaceSnapshot(..., surfaces)`로 실어 저장, 복원 시 seed/take로 되돌린다(유닛 13건). **AC4.3**: 두 축이 모두 동작한다 — (앱 재시작) `terminalScrollbackRegistry`가 xterm 버퍼를 캡처해 스냅샷에 싣고 마운트 시 새 PTY 위 히스토리로 재적용, (인세션) `isAbnormalPtyExit`가 비정상 종료(비0 코드·signal 종료 — 강제 종료는 코드 0 + signal로 오므로 `PtyExitEvent.signal`을 새로 전파한다)를 판별해 탭을 닫는 대신 보존 화면을 읽기 전용으로 동결(surfaceId 해제 = 입력 차단)하고 M-J4-S1 표현(danger 배너·`읽기 전용` 배지·dim)과 재연결 어포던스를 띄우며, 재연결은 같은 xterm 위에 새 PTY를 붙여 보존 화면을 그 위 히스토리로 남긴다(J4 단계 1·3, 유닛 25건). 색/속성은 보존하지 않고 평문 줄만 최대 1000줄 저장. **AC2.6**: 생명주기와 응답성 두 축이 모두 동작한다 — `backend.lifecycle` IPC(status·stop·restart·remove)가 `ContainerBackend`를 통해 `container machine stop|rm`을 구동하고 부팅은 `machine run`의 on-demand boot을 쓰며(별도 `machine start` 없음), 터미널 입력→출력 왕복을 렌더러가 측정해(`terminalLatencyRegistry`, 최근 20표본 중앙값) M-J2-S6 패널이 목표 16ms 게이지와 함께 노출한다(유닛 36건) |
| ◐ 부분 | 3 | AC2.2, AC2.3, AC4.5 | AC2.2/2.3: 터미널·파일 I/O는 동작하나 `runProcess`/`getEnv`가 `NotImplementedError`(Host/ContainerBackend)이고 Claude 서피스는 정적 목업(`ClaudeSurface`). AC4.5: host측 원자·디바운스 저장이 동작하고 스냅샷이 편집기+터미널 서피스를 실어 저장하나, AC4.5가 요구하는 복원 대상 3종 중 Claude 콘텐츠가 아직 미캡처 |
| ✗ 스텁/미구현 | 4 | AC3.3, AC3.4, AC4.2, AC4.6 | AC3.3: `BrowserRouter.forwardCallback` throw(방향 B). AC3.4: 방향 B 부재로 auth 루프 미완결. AC4.2: 스냅샷의 서피스 캡처 경로에 편집기·터미널은 배선됐으나 Claude 세션 페이로드는 미캡처 — 애초에 `ClaudeSurface`가 정적 목업이라 캡처할 라이브 세션이 없다(AC2.2/2.3 선행). AC4.6: 복원↔재접속 충돌 처리 코드 전무(last-write-wins) |

- **값별 롤업**: V1(레이아웃) 7/7 ✅ · V2(백엔드) 6/8 ◐ · V3(브라우저 라우팅) 3/5 ◐ · V4(상태 복원) 3/6 ◐(AC4.1·4.3·4.4 구현, AC4.5 부분).
- **테스트 게이팅**: 컨테이너 실행 e2e(`M-J2-*`)는 `TESSERA_CONTAINER_E2E=1` 게이트로 기본 CI에서 `test.skip`. 스텁 AC(AC3.3·AC3.4·AC4.2·AC4.6)는 기능 부재로 자동화 테스트 없음. AC4.3의 캡처·복원 왕복과 동결/재연결 판정은 비게이트 유닛 25건(`test/unit/terminal-restore.test.ts`)이, AC4.1은 13건(`test/unit/editor-restore.test.ts`)이 방어한다. AC2.6은 비게이트 유닛 36건이 방어한다 — 생명주기 CLI argv·백엔드 상태 전이·IPC action 라우팅 17건(`test/unit/backend-lifecycle.test.ts`)과 왕복 지연 측정·게이지·패널 마크업 19건(`test/unit/backend-responsiveness.test.ts`). 실제 머신을 정지·재시작해 보는 축은 `container` CLI가 있는 Apple Silicon 맥에서의 수동 확인으로 남는다(T-2 시나리오 6).
- **검증 축 한계 — playwright e2e는 CI에 배선돼 있지 않다**: `.github/workflows/ci.yml`이 유일한 워크플로이고 그 `ci` job은 `npm ci`·typecheck·lint·`npm test`(vitest)·build만 실행한다. 레포 어디에서도 `npm run test:e2e`를 호출하지 않으므로(`playwright`는 `package.json` 스크립트·devDependency에만 존재) **`test/e2e/`의 spec 19개 전부**(`M-J1-S4~S8` 5 · `M-J2-S1~S5,S7` 6 · `M-J3-S1,S2` 2 · `app`·`editor-restore`·`editor-split`·`terminal`·`terminal-exit`·`workspace-create` 6 = 19; `helpers.ts`는 spec이 아니다)가 어디서도 자동 실행되지 않는다 — ✅로 집계된 AC의 근거로 인용되는 것들을 포함한다. 따라서 to-be 조건 1('테스트 문서가 기술하는 대로 자동화 검증 가능')은 **현재 유닛 범위에서만** 성립하며, e2e는 로컬 수동 실행 자산이다. 이 배선 자체가 남은 검증 축 gap이다.
- **다음 구현 우선순위(참고)**: **M-J4-S1의 워크스페이스 전역 크롬**(타이틀바 `backend down`·`읽기 전용` 배지, 상단 danger 배너, 전 pane dim, '백엔드 재기동' 카드)이 이제 가장 가까운 다음 조각이다 — 직전 두 슬라이스가 이것을 미룬 단 하나의 이유는 렌더러에 **워크스페이스 단위 백엔드 헬스 신호가 없다**는 것이었는데(당시 `backend.lifecycle`은 `NotImplementedError`였고 상태 조회 채널도 없었다), AC2.6 슬라이스가 바로 그 신호를 만들었으므로 이제 막힌 곳이 없다. 이제 단일 PTY의 비정상 종료를 백엔드 전체 down으로 승격하는 대신 실제 머신 상태를 물어 표현할 수 있다(criterion ② 잔여). AC4.2는 `ClaudeSurface`가 정적 목업인 한 캡처할 세션이 없어 **AC2.2/2.3 라이브 세션 구현이 선행**이며, AC4.6 충돌 처리와 PRD-3 방향 B(AC3.3·3.4)가 그다음 최대 gap이다. 검증 축에서는 위 '검증 축 한계'대로 playwright e2e를 CI에 배선하는 일이 남아 있다(macOS 러너에서 build 후 실행 필요, 19개 spec이 한 번도 게이트된 적 없어 일괄 배선 전 상태 확인이 선행). 순서·구현 여부는 후속 정합성 task의 계획 단계 몫.
- **범위 밖(gap 유지)**: AC2.2/2.3가 요구하는 라이브 Claude 세션 **구현**(정적 목업 `ClaudeSurface` → host/container 백엔드 위 실제 세션)은 criterion ① 미구현 gap으로, 위 '◐ 부분' 행·'다음 구현 우선순위'에 추적된다(이 slice 범위 밖). (2026-07-27 해소: `ClaudeSurface`가 인용하던 존재하지 않는 `PRD-5 / J3`는 실제 스펙 AC2.2/AC2.3(`tessera-prd-backend.md`)로 교정 — criterion ② dangling 참조 제거.)

## 연결 매트릭스

> **상태 열 의미**: '문서 사슬'은 가치→PRD→AC→테스트 연결의 완결(문서 축)을, '구현'은 실제 `src/`·`test/` 구현·검증 상태(구현 축, 위 '구현·검증 상태' 참조)를 나타낸다. 둘은 별개다.

| 가치 | PRD | AC | 테스트 | 문서 사슬 | 구현 |
|------|-----|-----|--------|-----------|------|
| V1: 통합된 단일 작업 표면 | PRD-1 (레이아웃) | AC1.1, AC1.2, AC1.3, AC1.4, AC1.5, AC1.6, AC1.7 | T-1 | ✅ 완전 | ✅ 7/7 |
| V2: 환경 선택의 자유 | PRD-2 (백엔드/워크스페이스) | AC2.1, AC2.2, AC2.3, AC2.4, AC2.5, AC2.6, AC2.7, AC2.8 | T-2 | ✅ 완전 | ◐ 6/8 (AC2.2·2.3 부분) |
| V3: 격리를 깨지 않는 인증 | PRD-3 (브라우저 라우팅) | AC3.1, AC3.2, AC3.3, AC3.4, AC3.5 | T-3 | ✅ 완전 | ◐ 3/5 (AC3.3·3.4 스텁) |
| V4: 작업 손실 없는 복원력 | PRD-4 (상태 복원) | AC4.1, AC4.2, AC4.3, AC4.4, AC4.5, AC4.6 | T-4 | ✅ 완전 | ◐ 3/6 (AC4.1·AC4.3·AC4.4 구현, AC4.5 부분, AC4.2·4.6 스텁) |

## 요구사항 커버리지 (역방향 확인)

| 요구사항 | 연결 가치 | 연결 AC |
|---|---|---|
| #1 4종 컴포넌트 | V1 | AC1.1 |
| #2 호스트/컨테이너 native | V2 | AC2.2, AC2.3, AC2.6 |
| #3 브라우저 항상 호스트 | V3 | AC3.1 |
| #4 컨테이너 브라우저 라우팅 | V3 | AC3.2, AC3.3, AC3.4 |
| #5 window/pane/tab | V1 | AC1.2, AC1.3 |
| #6 workspace 단위 백엔드 선택 | V2 | AC2.1 |
| #7 pane/tab은 자신이 속한 영역의 backend 환경 | V2 | AC2.4 |
| #8 백엔드 종료 시 편집기·Claude Code 복원 | V4 | AC4.1, AC4.2, AC4.5 |
| #9 백엔드 종료 시 터미널 복원 | V4 | AC4.3, AC4.5 |
| #10 앱 종료 시 브라우저 탭 URL 복원 | V4 | AC4.4 |
| #11 컨테이너 workspace의 선택적 host 전용 영역 | V2 | AC2.7, AC2.8 |
| #12 포커스된 pane 전체화면(zoom) 토글 (영속·zoom-follows-focus) | V1 | AC1.6 |
| #13 워크스페이스 목록 표시·전환 | V1 | AC1.7 |

→ 13개 요구사항 전부가 가치·AC·테스트로 연결됨. (누락 요구사항 없음)

## 사용자 여정 ↔ 가치 연결

| 여정 | 제목 | 파일 | 주 가치 | 부 가치 | 경유 AC | 시각화(mockup) |
|------|------|------|---------|---------|---------|----------------|
| J1 | 통합 작업 표면 구성 | `tessera-journey-layout.md` | V1 | V2 | AC1.1~1.7, AC2.1, AC2.2 | ✅ 8/8 |
| J2 | 컨테이너 워크스페이스 격리 작업 | `tessera-journey-backend.md` | V2 | V1 | AC2.1, AC2.3, AC2.4, AC2.5, AC2.6, AC2.7, AC2.8 | ✅ 7/7 |
| J3 | 컨테이너 작업 중 OAuth 인증 완결 | `tessera-journey-browser-routing.md` | V3 | V2 | AC3.1~3.5 | ✅ 6/6 |
| J4 | 크래시에서 작업 복원 | `tessera-journey-state-restoration.md` | V4 | V1 | AC1.5, AC4.1~4.6 | ✅ 6/6 |

→ 4개 여정이 V1~V4를 모두 달성하고, 단계 근거로 AC1.1~AC4.6(26개)을 전부 경유한다. (고아 여정 없음)
→ 전체 27개 단계가 mockup으로 시각화·연결됨(시각화 27/27). 단일 소스는 `mockups/tessera-mockup-index.md`.

## 위험 진단

### 🔴 고아 가치 (소유자 없는 가치)
- **V1~V4 전체** — 제품 소유자(Product Owner)가 미확정 상태. 현재는 단일 소유자에게 귀속된다고 가정함.
  - **권장 조치**: 소유자를 확정해 `tessera-values.md`의 "제품 소유자" 항목을 갱신. 확정되면 본 위험 해제.

### 🔴 무가치 PRD (가치를 달성하지 않는 PRD)
- (없음) — 4개 PRD 모두 하나 이상의 가치를 달성.

### 🟡 미정렬 문서 (가치 참조 없는 문서)
- (없음) — 모든 PRD가 가치 문서를 참조.

### 🟡 AC 없는 PRD
- (없음) — 4개 PRD 모두 AC 보유.

### 🟡 미연결 AC (가치와 연결되지 않은 AC)
- (없음) — 26개 AC 모두 달성 가치 명시.

### 🟢 미검증 AC (테스트 문서 시나리오 없는 AC)
- (없음) — 26개 AC 모두 T-1~T-4 **테스트 문서 시나리오**로 커버.
- ⚠️ **단, 이는 문서 축(테스트 시나리오 존재)이며 자동화 검증과 다르다.** 구현 축에서 7개 AC(부분 3·스텁 4: AC2.2·2.3·3.3·3.4·4.2·4.5·4.6)는 기능 부재/부분으로 자동화로 실검증되지 않는다. 상세는 위 '구현·검증 상태' 섹션 참조.

### 🟢 고아 테스트 (AC를 참조하지 않는 테스트)
- (없음) — 4개 테스트 문서 모두 대상 AC 명시.

### 🟢 [프론트엔드] 시각화 누락 단계 (mockup 없는 여정 단계)
- (없음) — J1~J4 전 단계(27/27)가 대응 mockup을 가리킨다. **해소됨**. J1 8단계는 여정 페이지의 `#STP-<슬러그>` 앵커(옛 `M-J1-Sn`은 `data-legacy-id`로 보존), J2~J4 19단계는 화면 단위 `M-Jx-Sn.html`.

### 🟢 [프론트엔드] 시각화 없는 가치 (mockup 없는 가치)
- (없음) — V1~V4 모두 하나 이상의 mockup으로 시각화됨. **해소됨**.

### 🟢 [프론트엔드] 구조적 공백
- (없음) — 디자인 시스템(`design-system/`)·mockup(`mockups/`)·mockup 인덱스가 모두 작성됨. **해소됨**.
- (2026-06-26 점검) 디자인 시스템 내부 정합성 2건 발견·해소 — **미정의 항목 사용**: `P-flowmap`이 목업 3곳(J3-S2·S4·S6)에서 쓰였으나 패턴 표에 없어 추가함 / **사용처 없는 패턴**: `P-multi-workspace`가 어떤 목업에도 안 쓰였고(매핑된 J3-S6·J4-S5는 실제로 `P-flowmap`·`P-restore` 사용), 다중 창 동시 표시가 비기능임이 확인되어 패턴을 삭제함.

## 위험 우선순위에 따른 다음 액션

1. 🔴 **제품 소유자 확정** — 소유자 지정 후 `tessera-values.md`의 "제품 소유자" 항목 갱신.
2. ✅ **디자인 시스템 셋업** — 완료(`docs/design-system/`).
3. ✅ **mockup 작성 + 인덱스화** — 완료(27개 `M-Jx-Sn.html` + `mockups/tessera-mockup-index.md`). `M-J1-S7`(전체화면 토글)·`M-J2-S7`(host 전용 영역)·`M-J1-S8`(워크스페이스 전환) 포함.
4. ✅ **여정 시각화 칸 연결** — 완료(`tessera-user-journeys.md` 및 여정별 파일의 ⬜ → ✅ 갱신, 재검증). J2 7/7.
5. ✅ **워크스페이스 전환 — 구현·테스트 완료** — 요구사항 #13·`Window` 정의·AC1.7(PRD/AC), J1 단계 8(여정), `C-workspace-rail`·`P-workspace-rail`(디자인 시스템), `M-J1-S8` mockup, T-1 시나리오 7에 더해 **`src/` 전환기 구현**(keep-alive 렌더 + 레일 + ⌘숫자 전환)과 **자동화 테스트**(e2e `M-J1-S8` + 단위 `WorkspaceRail`)까지 완료 — 커밋 #12의 docs/코드 드리프트(문서 ✅이나 구현·자동화 테스트 부재) 해소.
6. (선택) 제품명 확정 — 현재 코드네임 `Tessera`. 변경 시 파일명·헤딩 일괄 갱신 필요.

## 문서 인덱스

| 종류 | 파일 |
|---|---|
| 가치 문서 | `tessera-values.md` |
| PRD-1 레이아웃 | `tessera-prd-layout.md` |
| PRD-2 백엔드/워크스페이스 | `tessera-prd-backend.md` |
| PRD-3 브라우저 라우팅 | `tessera-prd-browser-routing.md` |
| PRD-4 상태 복원 | `tessera-prd-state-restoration.md` |
| 테스트 T-1 | `tessera-test-layout.md` |
| 테스트 T-2 | `tessera-test-backend.md` |
| 테스트 T-3 | `tessera-test-browser-routing.md` |
| 테스트 T-4 | `tessera-test-state-restoration.md` |
| 사용자 여정 인덱스 | `tessera-user-journeys.md` |
| 사용자 여정 J1 (레이아웃) | `tessera-journey-layout.md` |
| 사용자 여정 J2 (백엔드/컨테이너) | `tessera-journey-backend.md` |
| 사용자 여정 J3 (브라우저 라우팅/인증) | `tessera-journey-browser-routing.md` |
| 사용자 여정 J4 (상태 복원) | `tessera-journey-state-restoration.md` |
| 디자인 시스템 (문서) | `design-system/tessera-design-system.md` |
| 디자인 시스템 (CSS) | `design-system/tessera.css` |
| mockup — 여정 단위 (J1) | `mockups/journeys/JRN-layout.html` |
| mockup — 화면 단위 (J2~J4, 19개) | `mockups/M-Jx-Sn.html` |
| mockup 갤러리 | `mockups/index.html` |
| mockup 인덱스 | `mockups/tessera-mockup-index.md` |
| 상태 추적 | `tessera-doc-tracker.md` (이 문서) |

## 변경 이력

| 시점 | 변경 내용 | 이전 상태 | 이후 상태 |
|------|-----------|-----------|-----------|
| 2026-06-17 | 가치 문서 생성(V1~V4) | 가치 0개 | 가치 4개 |
| 2026-06-17 | PRD-1~PRD-4 작성 | PRD 0개 | PRD 4개, AC 22개 |
| 2026-06-17 | 테스트 T-1~T-4 작성 | 테스트 0개 | 테스트 4개, AC 22개 커버 |
| 2026-06-17 | 상태 추적 문서 초기화 | - | 위험 1건(소유자 미확정) 기록 |
| 2026-06-17 | 사용자 여정 J1~J4 추가(`tessera-user-journeys.md`) | 여정 0개 | 여정 4개(V1~V4 달성), 시각화 0/23 |
| 2026-06-17 | 사용자 여정을 여정별 파일로 분리(`tessera-journey-*.md` 4개) + 인덱스 슬림화 | 여정 단일 파일 | 여정별 4파일 + 인덱스 1개 |
| 2026-06-17 | J4 시나리오 A를 "백엔드 재기동 후 상태 재적용" 흐름으로 정교화(복원=사용 가능 상태) | J4 5단계, 총 0/23 | J4 6단계, 총 0/24 |
| 2026-06-17 | 디자인 시스템 작성(`design-system/tessera-design-system.md` + `tessera.css`) — 토큰/컴포넌트(C-*)/패턴(P-*) 정의 | 디자인 시스템 없음 | 디자인 시스템 있음 |
| 2026-06-17 | mockup 24개 작성(`mockups/M-Jx-Sn.html`) + 갤러리(`index.html`) + mockup 인덱스 | mockup 0개, 시각화 0/24 | mockup 24개, 시각화 24/24 |
| 2026-06-17 | 여정 단계 시각화 칸 연결(여정별 4파일 + 인덱스의 ⬜ → ✅) 및 재검증 | 시각화 0/24, 프론트엔드 위험 3건 | 시각화 24/24, 프론트엔드 위험 0건 |
| 2026-06-17 | 컨테이너 workspace의 선택적 host 전용 영역 도입 — V2 확장, 요구사항 #11 추가, PRD-2 AC2.4 재정의 + AC2.7·AC2.8 신설, J2 7단계 추가, T-2 시나리오 7·8 추가 | AC 22개, 요구사항 10개, 시각화 24/24 | AC 24개, 요구사항 11개, 시각화 24/25(M-J2-S7 대기) |
| 2026-06-17 | `M-J2-S7`(host 전용 영역) mockup 작성 — 갤러리·mockup 인덱스·J2 여정 시각화 칸(⬜ → ✅) 연결 및 재검증 | 시각화 24/25, 프론트엔드 위험 1건 | 시각화 25/25, 프론트엔드 위험 0건 |
| 2026-06-24 | pane 일시 전체화면 토글 도입 — V1 확장, 요구사항 #12 추가, PRD-1 AC1.6 신설, T-1 시나리오 6 추가, J1 7단계 추가, `M-J1-S7` mockup 작성 + 갤러리·인덱스 연결, 전체 재검증 | AC 24개, 요구사항 11개, 시각화 25/25 | AC 25개, 요구사항 12개, 시각화 26/26 |
| 2026-06-26 | 디자인 시스템 정합성 수정 — 미정의 패턴 `P-flowmap`(목업 J3-S2·S4·S6에서 사용 중이나 패턴 표 누락) 추가 + 고아 패턴 `P-multi-workspace` 삭제(어떤 목업도 미사용, 다중 창 동시 표시가 비기능으로 확인됨). mockup 수·시각화 카운트 변화 없음 | 디자인 시스템 위험 2건(미정의 1·사용처 없음 1), 시각화 26/26 | 디자인 시스템 위험 0건, 시각화 26/26 |
| 2026-06-26 | 워크스페이스 목록·전환 도입(1~2단계) — V1 확장, 요구사항 #13 추가, PRD-1 `Window` 정의 명확화(단일 앱 창 + 활성 워크스페이스) + AC1.7 신설, J1 단계 8 추가(⬜). 테스트(T-1 시나리오)·mockup(`M-J1-S8`)은 3~4단계 예정 | AC 25개, 요구사항 12개, 시각화 26/26 | AC 26개, 요구사항 13개, 시각화 26/27(M-J1-S8 대기) |
| 2026-06-26 | 워크스페이스 전환 화면화 — 디자인 시스템에 `C-workspace-rail`·`P-workspace-rail`(+`tessera.css` 레일 스타일) 추가, `M-J1-S8` mockup 작성, 갤러리·mockup 인덱스·J1 여정 시각화 칸(⬜→✅) 연결 | 시각화 26/27, J1-S8 미시각화 1건 | 시각화 27/27, J1-S8 미시각화 해소(AC1.7 테스트는 여전히 미작성) |
| 2026-06-26 | 워크스페이스 전환 기능 완결 — T-1에 AC1.7 검증 시나리오(시나리오 7) 추가, AC1.7 테스트 커버 | AC 커버 25/26(미검증 AC 1건: AC1.7), 미검증 AC 1건 | AC 커버 26/26, 미검증 AC 0건 |
| 2026-06-29 | pane 전체화면(zoom) 토글 구현 + 영속 의미로 개정(J1-S7) — `LayoutSnapshot.zoomedPaneId` 추가(엔진 `toggleZoom`/`clearZoom` + zoom-follows-focus + 소멸 가드), 영속 골격에 포함(스냅샷 v2→v3 bump + 버전별 마이그레이터 스캐폴드로 구버전 보존), ⇧⌘⏎/Esc 입력·CSS 풀스크린·zoom 배지·키 힌트, PRD AC1.6/T-1 시나리오 6/J1-S7 여정·mockup 캡션을 "일시"→"영속(재시작 후 유지)"으로 개정, e2e `M-J1-S7` + 단위(엔진 zoom·migrate) 추가 | AC1.6 "일시적" 표기, 미검증 e2e | AC1.6 영속 일관, e2e·단위 그린 |
| 2026-06-29 | 워크스페이스 전환 **구현**(J1-S8/AC1.7) — App을 keep-alive 렌더로 전환(전 workspace 마운트·비활성 `hidden`, `.surface[hidden]` 규칙), `C-workspace-rail` 컴포넌트(클릭 + ⌘1–9 전환·design-system 레일 스타일을 앱 `tessera.css`로 포팅)·`Window` 좌측 레일 슬롯(`.winmain`) 추가, `WorkspaceView`에 `active` prop(비활성 뷰의 글로벌 키맵·zoom 보고 게이팅), 활성 workspace에서도 ⌘N 다이얼로그·창 크롬 구동. 자동화 테스트 신설 — e2e `M-J1-S8`(마우스+⌘숫자 전환·레이아웃/라이브 상태 보존·활성 표면 1개) + 단위 `WorkspaceRail`. 커밋 #12는 docs·mockup·시나리오만 추가하고 `src/` 전환기는 미구현이었음 | AC1.7 문서 ✅이나 `src/` 전환기·자동화 테스트 부재(문서/코드 드리프트) | AC1.7 구현 + 자동화 테스트(e2e·단위) 그린, 드리프트 해소 |
| 2026-06-29 | 워크스페이스 **닫기** 추가(J1-S8/AC1.7) — `workspace.close` IPC(채널·계약·preload·핸들러) 신설: 생성의 역연산으로 `PersistenceStore.delete`가 디스크 스냅샷을 영구 삭제하고 `BackendRegistry`에서 백엔드 제거(PTY는 뷰 언마운트로 정리). 레일 항목에 닫기 ×(C-pane 탭 닫기와 동형의 click-stopping span), App `handleClose`로 목록 제거·활성 닫으면 이웃 활성화·마지막 닫으면 빈 상태. 테스트 — e2e 닫기 흐름(백그라운드·활성→이웃·마지막→빈 상태) + 재시작 후 미복원(디스크 삭제 검증) + 단위 `PersistenceStore.delete`·레일 × | 워크스페이스 생성만 가능(닫기·삭제 부재) | 워크스페이스 닫기·영구 삭제 구현, e2e·단위 그린 |
| 2026-06-29 | 워크스페이스 닫기 **키보드 트리거** 추가(J1-S8/AC1.7) — `WorkspaceView`에 `onClose` 배선: **⇧⌘W**로 워크스페이스 즉시 닫기, **마지막 탭 ⌘W**는 빈 워크스페이스를 남기는 대신 워크스페이스를 닫음(엔진은 last-tab no-op 유지, 닫기 판단은 RC 레이어에서 `layoutActions`로 ⌘W·탭 × 양쪽 가드). `KeymapOverlay`에 ⇧⌘W 힌트 추가. e2e — ⌘W(비-마지막=탭만·마지막=워크스페이스)·⇧⌘W 닫기 흐름 | 닫기는 레일 × 뿐 | 닫기 키보드 트리거(⇧⌘W·마지막 탭 ⌘W) 추가, e2e 그린 |
| 2026-07-05 | host=container 조작 동등성 + ⌘K 커맨드 팔레트 **구현**(J2-S5/AC2.5) — 키보드 커맨드를 공유 레지스트리(`src/renderer/commands/`)로 일급화(`Command`·`dispatchKey`·`filterCommands`·`workspaceContext`)하고 기존 인라인 keydown 분기를 전량 이관: `WorkspaceView`(레이아웃 키+⇧⌘W)·`App`(⌘N/⌘1–9)이 레지스트리 경유로 디스패치(동작 보존, 기존 `M-J1-S*` e2e가 가드). 같은 레지스트리 위에 ⌘K 팔레트(`CommandPalette`)로 레이아웃+워크스페이스 커맨드 슈퍼셋을 검색·실행, 힌트 표면(`KeymapOverlay`·`StatusBar`)을 `Keycap`으로 단일 출처화. AC2.5는 조작·UI가 backend 무관(구조적 parity)이라 **증명**으로 검증 — 비게이트 단위(`command-parity`·`command-registry`) + 게이트드 e2e `M-J2-S5`(팔레트 UI 비게이트 + host=container 게이트). M-J2-S5 목업 키캡 정정(⌃⌘→→⌥⌘→·⌃Tab→⇧⌘])·워크스페이스 커맨드 행 추가(슈퍼셋 정합) | AC2.5 문서·목업 ✅이나 ⌘K 팔레트·커맨드 레지스트리 구현 부재, 목업 팔레트 키캡 부정확(⌃⌘→·⌃Tab)·슈퍼셋 미반영 | AC2.5 구현(레지스트리·팔레트·힌트 단일화) + 자동화 테스트 그린, 목업 정합(키캡·슈퍼셋) |
| 2026-07-20 | 토스트 UI를 타이틀바 상태 칩으로 이동(PR #32) — 알림이 pane 위 우하단 부유 카드 대신 타이틀바 `.titlebar-status` 슬롯의 pill 칩으로 표시(활성 워크스페이스만 `createPortal`, `WebContentsView` 겹침 원천 회피). 디자인 시스템 `C-toast` 재정의·`C-window` 슬롯 추가·`P-overlay`에서 토스트 제외·`toast-in` 모션 + 공유 `tessera.css` 동기화, mockup 4개(M-J1-S5·S6·S7 이동, M-J3-S1 배너→route 칩) + mockup 인덱스 정합 | 문서·목업은 우하단 부유 토스트, 구현은 타이틀바 칩(문서-구현 드리프트) | 디자인 시스템·목업·인덱스가 타이틀바 칩으로 정합, AC·mockup·시각화 카운트 불변 |
| 2026-07-21 | **doc-tracker 구현·검증 축 정합**(정합성 criterion ④) — 문서 사슬은 완전하나 실제 구현은 16/26(부분 4·스텁 6)임을 실측 반영: '구현·검증 상태' 섹션 신설·연결 매트릭스에 '구현' 열 추가·'미검증 AC 없음'을 문서축/구현축으로 분리·건강 상태에 구현 gap 반영. AC 본문·문서 사슬은 불변(to-be 미하향). 코드 구현·`ClaudeSurface`의 `PRD-5` dangling 참조·AC2.2/2.3 문구 정합은 범위 밖(gap 유지) | 트래커에 구현 축 부재 → '✅ 완전 / 미검증 0'이 전량 구현으로 오독 | 구현 16 / 부분 4 / 스텁 6 명시, 집계 = 실측 |
| 2026-07-27 | **criterion ② 해소** — `src/renderer/surfaces/ClaudeSurface.tsx`의 존재하지 않는 `PRD-5 / J3` 참조를 실제 스펙 `AC2.2/AC2.3`(`tessera-prd-backend.md` — 라이브 Claude 세션의 host/container 백엔드 실행)로 교정. 정적 목업 JSDoc 주석만 변경(렌더 출력·`data-testid`·타입·동작 불변). AC 본문·문서 사슬·구현 카운트(16/4/6) 불변, to-be 미하향. AC2.2/2.3 라이브 세션 **구현**은 criterion ① gap으로 유지 | `ClaudeSurface`가 존재하지 않는 `PRD-5` PRD를 인용(코드↔문서 dangling 참조, criterion ②) | 실제 스펙 `AC2.2/2.3`(백엔드 PRD) 인용, dangling 참조 0 |
| 2026-08-07 | **doc-tracker 구현 축 재동기화**(정합성 criterion ④) — #35(AC4.1)가 `docs/`를 갱신하지 않아 생긴 문서↔실측 역전 해소: AC4.1을 '✗ 스텁' → '✅ 구현'으로 이동(`editorStateRegistry` 캡처 + `WorkspaceView` autosave가 `buildWorkspaceSnapshot(..., surfaces)`로 저장, 유닛 13건), AC4.5 근거를 '`surfaces:[]` 골격만' → '편집기 서피스는 저장되나 Claude·터미널 콘텐츠 미캡처'로, AC4.2/4.3 스텁 근거에서 이미 거짓이 된 '`surfaces:[]` 고정' 사유 제거. 집계·롤업·미완 목록·테스트 게이팅 절 전량 재계산 + AC4.1 e2e의 CI 미배선 한계 명시. AC 본문·문서 사슬 불변, to-be 미하향 — 미구현 AC 구현(criterion ①)은 gap으로 유지 | 트래커가 AC4.1을 ✗ 스텁·AC4.5를 `surfaces:[]` 골격만으로 기술(실제와 반대), 집계 구현 16/부분 4/스텁 6·V4 1/6 | 구현 17/부분 4/스텁 5·V4 2/6, 근거 문구 = `src/` 실측, AC4.1 e2e 미배선 한계 명시 |
| 2026-08-07 | **AC4.3 터미널 스크롤백 캡처·재적용 구현**(정합성 criterion ①) — 순수 모듈 `terminalScrollbackRegistry` 신설(캡처 getter 등록/해제·`captureTerminalStates`·`seedTerminalRestore`/`takeTerminalRestore`·5초 스로틀 변경 알림·1000줄 상한·`formatRestoredScrollback`), `TerminalSurface`에 `tabId` prop + xterm 버퍼 캡처 getter + 마운트 시 히스토리 재적용 + 출력 시 autosave 넛지 배선, `SurfaceHost`가 `tabId` 전달, `WorkspaceView` autosave가 편집기+터미널 서피스를 함께 적재, `App` 부팅이 두 레지스트리를 시드. 유닛 18건 신설(`test/unit/terminal-restore.test.ts`). 트래커 동반 갱신 — AC4.3 ✗ 스텁 → ◐ 부분, AC4.5 근거를 '3종 중 Claude만 미캡처'로, 집계 구현 17/부분 5/스텁 4, 검증 축 한계를 'AC4.1 e2e 1건 미배선' → '`test/e2e/` spec 19개 전부 CI 미실행'으로 정정. AC 본문·문서 사슬 불변(to-be 미하향) | AC4.3 ✗ 스텁(터미널 스크롤백 미캡처 → 복원 없음), 집계 구현 17/부분 4/스텁 5, 검증 축 한계를 AC4.1 e2e 1건으로만 기술 | AC4.3 ◐ 부분(재적용 경로 동작·인세션 동결 미구현), 집계 구현 17/부분 5/스텁 4, e2e spec 19개 전부 미실행 명시 |
| 2026-08-07 | **AC4.3 인세션 동결·재연결 구현 → AC4.3 완결**(정합성 criterion ①) — `isAbnormalPtyExit`/`formatFrozenNotice`/`formatReconnectedHeader`를 `terminalScrollbackRegistry`(순수 모듈)에 추가하고, `TerminalSurface`가 비정상 PTY 종료 시 탭을 닫는 대신 보존 화면을 읽기 전용으로 동결(surfaceId 해제·autosave 넛지)한 뒤 M-J4-S1 표현(`.banner.danger`·`.badge.ro`·`.btn`)과 재연결 버튼을 렌더하도록 개편. `spawn()` 추출로 재연결이 같은 xterm 위에 새 PTY를 붙인다. 강제 종료를 판별할 수 있도록 `PtyExitEvent.signal`을 `Backend`·`HostBackend`·`ContainerRuntime`·`registerSurfaceIpc`를 거쳐 전파(optional 필드, v3 스냅샷 스키마 불변). 배치 규칙만 renderer 전용 `shell.css`에 추가 — 디자인 시스템 파일·mockup 불변. 유닛 25건. 트래커 동반 갱신 — AC4.3 ◐ → ✅, 집계 구현 18/부분 4/스텁 4, V4 3/6, 다음 우선순위를 AC2.6 생명주기(+ M-J4-S1 전역 크롬)로 이동 | AC4.3 ◐ 부분(재적용 경로만 동작, 인세션 동결·재연결 없음 → PTY 종료가 탭을 닫음), 집계 구현 17/부분 5/스텁 4, V4 2/6 | AC4.3 ✅ 구현(재시작·인세션 두 축 모두 동작), 집계 구현 18/부분 4/스텁 4, V4 3/6 |
| 2026-08-08 | **AC2.6 컨테이너 생명주기 + 응답성 측정 구현 → AC2.6 완결**(정합성 criterion ①) — `ContainerRuntime`에 `stopMachine`/`bootMachine`/`removeMachine` 추가(`container machine stop|rm <name>`; 별도 `machine start`가 없으므로 부팅은 `machine run`의 on-demand boot을 무해한 `:` 일회성으로 이용), `Backend`에 `stop`/`restart`/`remove` 추가 — `ContainerBackend`가 stopped/starting/running/error를 정확히 전이하고 이미 정지된 머신의 restart는 boot만 수행, `HostBackend`는 무음 no-op 대신 명시적 거부. `backend.lifecycle` IPC의 `NotImplementedError` 스텁을 실제 핸들러(status·stop·restart·remove, 실패는 `message`로 반환)로 교체. 순수 모듈 `terminalLatencyRegistry` 신설(입력→출력 왕복 표본, 최근 20개 중앙값, 요청 없는 출력 무시, 연타는 첫 키 기준, `now` 주입)과 `TerminalSurface` 배선. M-J2-S6 목업 그대로의 `BackendPanel`(상태 배지·이미지·머신·지연 게이지·정지/재시작)을 ⌃⌘B/⌘K 팔레트로 노출 — 시각 요소는 전부 기존 디자인 시스템 클래스(`.bepanel`·`.metric`·`.gauge`·`.belife`)이고 배치만 인라인이라 `tessera.css`·mockup 불변. 유닛 269 → 305건(신설 36건: `backend-lifecycle` 17 · `backend-responsiveness` 19). AC 본문·PRD·테스트 문서·여정 불변(to-be 미하향) | AC2.6 ◐ 부분(컨테이너 start만, stop/remove가 `NotImplementedError` · 응답성 측정·노출 없음), 집계 구현 18/부분 4/스텁 4, V2 5/8 | AC2.6 ✅ 구현(생명주기·응답성 두 축 동작), 집계 구현 19/부분 3/스텁 4, V2 6/8, 다음 우선순위를 M-J4-S1 전역 크롬으로 이동 |
| 2026-08-15 | **J1 mockup을 여정 단위 페이지로 이관**(프론트엔드 사슬 구조 정비) — 화면 단위 8개(`M-J1-S1~S8.html`)를 `mockups/journeys/JRN-layout.html` 1개로 통합. 단계 식별자를 순번에서 슬러그(`STP-<슬러그>`)로 세우고 여정 문서 `## 단계` 표에 「단계 ID」 열을 신설해 SSOT로 삼음, 페이지에 `data-journey`/`data-step` 선언·`#STP-*` 딥링크·스테퍼·단계별 전진 핫스폿 배선. 옛 `M-J1-Sn`은 `data-legacy-id`·인덱스에 legacy alias로 보존(`src/`·`test/` 주석 40곳이 그 이름을 인용). mockup 인덱스에 「여정 단위 페이지 규약」 절 신설(J2~J4가 따를 계약), 갤러리 J1 카드를 딥링크로 재배선. AC·여정 단계·시각화 카운트 불변 | J1 mockup 8파일(화면 단위), 단계 식별자 순번, `data-step` 없음 | J1 mockup 1파일(여정 단위), 단계 식별자 슬러그, 문서↔페이지 단계 집합 기계 대조 가능 |
