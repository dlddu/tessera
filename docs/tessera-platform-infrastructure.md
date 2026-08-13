# Tessera 플랫폼 인프라 표면

> 산출 시점: 2026-08-13 · 정합성 criterion ③(문서 없는 구현) 해소로 신설
> 이 문서는 **제품 가치(V1~V4) 사슬 밖**에 있는 사용자 대면 표면을 등재한다.
> 여기 등재된 항목은 AC·테스트 문서(T-N)·여정(J-N)·mockup을 갖지 않는다 — 가치를 달성하지 않기 때문이다.

## 왜 이 문서가 있는가

`docs/`는 제품 의도의 단일 소스(SSOT)다. 그런데 앱에는 **어떤 제품 가치도 달성하지 않으면서 사용자
눈에는 보이는** 표면이 있다. 앱 자체를 최신으로 유지하는 수단(auto-update)과, 앱이 고장났을 때 무슨
일이 있었는지 알아내는 수단(diagnostics)이 그것이다. 둘 다 개발자의 작업(터미널·브라우저·편집기·Claude)을
직접 돕지 않는다 — 도구가 아니라 도구를 담은 그릇을 돌보는 장치다.

이런 표면은 둘 중 하나로 잘못 처리되기 쉽다.

- **문서 어디에도 안 적으면** 코드에만 존재하는 사용자 대면 동작이 되어 "문서 없는 구현"이다(정합성 criterion ③).
- **가치 사슬(가치 → PRD → AC → 테스트)에 억지로 넣으면** 달성하지 않는 가치를 참조하는 AC가 생기고,
  여정 단계가 없으니 mockup 공백이 새로 열리며, 검증할 제품 시나리오가 없는 테스트 문서를 짓게 된다.
  없던 gap을 문서 쪽에서 만들어 내는 셈이다.

그래서 **값 사슬 밖 부록**으로 등재한다. 표면은 문서에 표현되고, AC 집합은 늘지 않는다.

## 등재 자격

한 표면이 이 목록에 들어오려면 다음을 **전부** 만족해야 한다.

1. **비-가치**: `tessera-values.md`의 V1~V4 중 어느 것도 달성하지 않는다. 하나라도 달성한다면 그것은
   제품 기능이므로 가치 사슬로 간다.
2. **그릇을 위한 수단**: 사용자의 작업이 아니라 앱 자체의 운영·배포·복구를 위한 표면이다.
3. **근거 동반**: 코드 근거 파일과 그것을 방어하는 자동화 테스트를 함께 적는다. 근거 없는 등재는 하지 않는다.
4. **표면 전량 기재**: 사용자가 실제로 마주치는 것(메뉴 항목·단축키·환경변수·파일 경로·다이얼로그)을
   빠짐없이 적는다. "있다"가 아니라 "무엇이 보이는가"를 적는다.

**졸업 규칙**: 등재 항목이 제품 가치를 달성하기 시작하면(예: 진단 결과를 사용자에게 보여주는 화면, 업로드
동의 흐름, 사용자가 관리하는 업데이트 채널 선택) 이 목록에서 빼고 가치 → PRD → AC → 테스트 사슬로 올린다.
이 문서에 남겨 두는 것은 그때부터 회피다.

**이 목록은 면제가 아니다.** 등재는 "사용자 대면 동작이 문서에 표현되어 있다"를 만족시킬 뿐,
구현·검증 의무를 면제하지 않는다. 등재 항목도 자동화 테스트로 방어되어야 하며(위 3),
`tessera-doc-tracker.md`의 AC 버킷 회계에는 **들어가지 않는다**(AC가 아니므로).

---

## PI-1 진단(diagnostics) — 패키징 빌드의 관측 수단

Finder에서 실행된 `.dmg`는 stdout/stderr를 버리고 DevTools가 닫혀 있으며 렌더러 콘솔이 갈 곳이 없다.
출시된 빌드가 무언가를 말하려면 디스크에 남기는 수밖에 없고, 그 통로가 이 표면이다.

- **코드 근거**: `src/main/diagnostics/` (`logger.ts` · `logFormat.ts` · `installDiagnostics.ts` ·
  `attachWindowDiagnostics.ts` · `installDiagnosticsMenu.ts`), `src/renderer/diagnostics/log.ts`
- **자동화 테스트**: `test/unit/diagnostics.test.ts` 25건(레벨 게이팅·`parseLevel`·에러 직렬화·라인 포맷·
  회전 판정·console 레벨 매핑·소스 축약·⌘⌥L 코드 매칭), `test/unit/persistence-logging.test.ts` 10건
  (`describeLayout` 골격 요약 · `PersistenceStore` 저장 로깅)
- **비-가치 근거**: 개발자의 작업 산출물에 아무것도 더하지 않는다. 로그가 없어도 V1~V4의 측정 지표는
  전부 그대로 성립하고, 로그가 있어도 그 지표가 좋아지지 않는다.

### 사용자가 마주치는 것

| 표면                                | 동작                                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `Debug` ▸ `Reveal Log Folder` (⌘⌥L) | 로그 폴더를 Finder에서 연다. 앱 메뉴 항목이므로 브라우저 서피스에 포커스가 있어도 동작한다                                  |
| `Debug` ▸ `Copy Log File Path`      | 활성 로그 파일의 절대 경로를 클립보드에 복사한다(터미널에서 바로 `tail` 하기 위한 것)                                       |
| `View` ▸ `Toggle Developer Tools` (⌘⌥I) | Electron **기본 메뉴**가 제공한다. 앱이 `setApplicationMenu`로 메뉴를 갈아치우지 않고 `Debug`만 덧붙이므로 패키징 빌드에도 남아 있다 |
| `TESSERA_DEBUG=1`                   | 패키징 실행에서 첫 로드 완료 시 DevTools를 분리 창으로 자동으로 연다                                                        |
| `TESSERA_LOG_LEVEL=debug\|info\|warn\|error` | 기록 하한을 조정한다. 기본값은 패키징 `info` · 비패키징 `debug`이며, 비패키징 실행은 같은 줄을 stdout에도 쓴다      |
| 로그 파일                           | `~/Library/Logs/Tessera/main.log`. 2 MB를 넘기면 `main.1.log` → `main.3.log`로 밀어내며 가장 오래된 것을 버린다             |
| 크래시 미니덤프                     | `app.getPath('crashDumps')`. `crashReporter`가 `uploadToServer: false`로 동작하므로 **기기 밖으로 나가지 않는다**            |

폴더 이름은 `productName`(= `Tessera`)에서 온다 — `package.json`과 `electron-builder.yml` **양쪽**에
설정되어 있어 개발 실행과 패키징 실행의 `app.getName()`이 일치한다.

### 무엇이 기록되는가

- **실행마다 1줄**: 버전 · Electron/Chrome/Node · 플랫폼 · 패키징 여부 · 로그/크래시 경로 · **해소된 `PATH`**
  (`env/fixPath.ts`의 로그인 셸 PATH 보정이 빗나가면 증상은 `container` CLI의 엉뚱한 `ENOENT`로 나타난다 —
  PATH가 로그에 있으면 그 진단이 몇 초로 줄어든다).
- **처리되지 않은 실패**: `uncaughtException` · `unhandledRejection` · `child-process-gone`(GPU/유틸리티/PTY) ·
  `render-process-gone` · `preload-error` · `did-fail-load` · 창 무응답/복귀 · 앱 종료.
- **렌더러 콘솔 릴레이**: 창의 `console-message`를 그대로 로그 파일로 넘긴다. 컴포넌트의 `console.warn`
  한 줄이 패키징 빌드에서도 흔적으로 남는다(별도 IPC 계약 없음). 레이아웃 골격의 저장·재구성 추적이
  이 경로를 쓴다(`persist` · `restore` 스코프, `src/renderer/diagnostics/log.ts`).

## PI-2 auto-update — 앱 자체의 최신성

- **코드 근거**: `src/main/update/` (`initUpdater.ts` · `periodicCheck.ts`), electron-updater
- **자동화 테스트**: `test/unit/update.test.ts` 6건 — 주기 확인 스케줄러(`startPeriodicUpdateCheck`)의 5분 기본
  간격·첫 확인 지연·해제 idempotency·확인 실패(거부/동기 throw)를 삼키고 폴링을 이어 가는지. 실제 피드 연결
  (`initUpdater`)은 서명된 패키징 빌드에서만 살아나므로 유닛 범위 밖이다.
- **비-가치 근거**: 어떤 버전을 쓰고 있는지는 제품 가치의 측정 지표에 들어가지 않는다. 배포 채널의 문제다.

### 사용자가 마주치는 것

| 표면               | 동작                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------- |
| 실행 직후 + 주기적 | 서명된 패키징 빌드에서만 GitHub Release 피드를 확인한다(`app.isPackaged` 게이트, 비패키징 실행은 확인하지 않음) |
| 백그라운드 다운로드 | 새 버전을 내려받는 동안 진행률이 렌더러로 전달된다                                                        |
| 재시작 어포던스     | 다운로드가 끝나면 상태바 우측에 `업데이트 준비됨 — 재시작` 항목이 버전과 함께 뜨고, 누르면 `quitAndInstall`로 교체 후 재실행한다 |

> ⚠️ 이 표면은 `.github/workflows/ci.yml`의 release 경로와 물려 있다. `src/`·`build/`·패키징 설정을
> 건드리는 PR은 서명·공증된 빌드를 실제로 게시하며, 그 빌드는 설치된 앱의 auto-update로 흘러간다.
> 문서만 바꾸는 변경은 그 경로 필터에 걸리지 않는다.

---

## 이 목록에 없는 것 (2026-08-13 실측)

`src/` 전수 확인 결과 진단과 auto-update 밖에서 앱 수준 메뉴·전역 단축키·클립보드·Finder 열기·DevTools
토글을 노출하는 코드는 없다.

```bash
grep -rn "Menu\.\|new MenuItem\|accelerator:\|shell\.open\|clipboard\.\|globalShortcut\|openDevTools" src/
# 히트는 전부 src/main/diagnostics/ 안이다.
```

환경변수 스위치 중 `TESSERA_DEBUG` · `TESSERA_LOG_LEVEL`은 위 PI-1이고, `TESSERA_CONTAINER_E2E`는
테스트 게이트(`tessera-doc-tracker.md`의 '테스트 게이팅'), `TESSERA_BACKEND` · `TESSERA_ROUTE_*`는
백엔드·라우팅 내부 계약이라 사용자 대면 표면이 아니다.

## 정합성 모델과의 관계

정합성 to-be 조건 3은 "코드에 존재하는 모든 사용자 대면 동작이 문서에 표현되어 있다"이며, 명시적 예외는
auto-update **하나**다. 이 문서는 그 조건을 **표현**으로 만족시킨다 — 예외를 늘리는 장치가 아니라,
예외로 두자던 표면을 SSOT 안에서 **감사 가능하게** 만드는 장치다(README에만 있던 선언을 `docs/`로 옮긴 것).

예외 조항 자체를 넓힐지(= diagnostics도 정의상 예외로 둘지)는 모델 소유자의 결정이며 이 문서의 권한 밖이다.
어느 쪽으로 결정되든 이 목록은 버려지지 않는다: 예외로 두기로 하면 이 문서가 그 결정의 근거 목록이 되고,
두지 않기로 하면 이미 표현이 끝나 있다.
