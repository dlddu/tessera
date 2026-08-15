# Tessera 문서 지도

> 이 폴더는 제품 의도의 **단일 소스(SSOT)** 다. 코드가 무엇을 해야 하는지는 여기서 정해지고,
> `src/`·`test/`는 그것을 실현·검증한다.
> 이 문서는 **무엇이 어디에 있는지**와 **새 문서를 어디에 두어야 하는지**를 정한다.
> 현재 상태(어디까지 구현·검증됐는지)는 [`tessera-doc-tracker.md`](./tessera-doc-tracker.md)가 추적한다.

## 구획 규칙

1. **문서 종류당 디렉터리 하나.** 중첩은 한 단계까지다. 종류가 같으면 같은 디렉터리에 들어간다.
2. **root에는 진입점과 메타만.** 이 지도, 상태 추적, GitHub Pages 진입 파일이 전부다.
   개별 사양 문서를 root에 새로 두지 않는다.
3. **가치 사슬 밖 표면은 `platform/`.** 가치(V1~V4) 중 어느 것도 달성하지 않으면서 사용자
   눈에 보이는 표면(앱 자체의 운영·배포·복구 수단)은 가치 사슬에 억지로 끼우지 않고 여기에 등재한다.
   등재 자격과 졸업 규칙은 [`platform/tessera-platform-infrastructure.md`](./platform/tessera-platform-infrastructure.md)가 정의한다.
4. **파일명은 이동해도 바뀌지 않는다.** basename이 문서의 이름이고 디렉터리는 종류다.
   이름을 유지해야 `git log --follow`와 basename 인용(코드 주석 포함)이 살아남는다.

## 디렉터리

| 경로              | 종류                | 들어가는 것                                                     |
| ----------------- | ------------------- | --------------------------------------------------------------- |
| `values/`         | 가치                | 제품이 달성하려는 것(V1~V4)과 그 측정 지표                      |
| `prd/`            | PRD + AC            | 가치를 제품 요구사항으로 푼 문서와 그 안의 Acceptance Criteria   |
| `tests/`          | 테스트 문서         | AC를 어떻게 검증하는지(T-1~T-4 시나리오)                        |
| `journeys/`       | 사용자 여정         | 사용자가 겪는 흐름(J1~J4)과 단계별 화면 연결                    |
| `mockups/`        | 화면 시안           | 여정 단계별 정적 HTML 목업(`M-Jx-Sn.html`) + 갤러리 + 인덱스     |
| `design-system/`  | 디자인 시스템       | 토큰·컴포넌트(C-\*)·패턴(P-\*) 정의와 공유 `tessera.css`         |
| `platform/`       | 플랫폼 인프라       | 가치 사슬 밖 사용자 대면 표면(진단·auto-update)                 |

사슬은 `values/` → `prd/`(AC) → `tests/`, 그리고 그 위에 `journeys/` → `mockups/` ↔ `design-system/`이
얹힌다. `platform/`은 이 사슬 **밖**이며 AC를 만들지 않는다.

## 문서 인덱스

| 종류                          | 경로                                              |
| ----------------------------- | ------------------------------------------------- |
| 문서 지도                     | `README.md` (이 문서)                             |
| 상태 추적                     | `tessera-doc-tracker.md`                          |
| 가치                          | `values/tessera-values.md`                        |
| PRD-1 레이아웃                | `prd/tessera-prd-layout.md`                       |
| PRD-2 백엔드/워크스페이스     | `prd/tessera-prd-backend.md`                      |
| PRD-3 브라우저 라우팅         | `prd/tessera-prd-browser-routing.md`              |
| PRD-4 상태 복원               | `prd/tessera-prd-state-restoration.md`            |
| 테스트 T-1                    | `tests/tessera-test-layout.md`                    |
| 테스트 T-2                    | `tests/tessera-test-backend.md`                   |
| 테스트 T-3                    | `tests/tessera-test-browser-routing.md`           |
| 테스트 T-4                    | `tests/tessera-test-state-restoration.md`         |
| 사용자 여정 인덱스            | `journeys/tessera-user-journeys.md`               |
| 사용자 여정 J1 (레이아웃)     | `journeys/tessera-journey-layout.md`              |
| 사용자 여정 J2 (백엔드)       | `journeys/tessera-journey-backend.md`             |
| 사용자 여정 J3 (라우팅/인증)  | `journeys/tessera-journey-browser-routing.md`     |
| 사용자 여정 J4 (상태 복원)    | `journeys/tessera-journey-state-restoration.md`   |
| mockup (27개)                 | `mockups/M-Jx-Sn.html`                            |
| mockup 갤러리                 | `mockups/index.html`                              |
| mockup 인덱스                 | `mockups/tessera-mockup-index.md`                 |
| 디자인 시스템 (문서)          | `design-system/tessera-design-system.md`          |
| 디자인 시스템 (CSS)           | `design-system/tessera.css`                       |
| 플랫폼 인프라 표면            | `platform/tessera-platform-infrastructure.md`     |
| Pages 진입(갤러리 리다이렉트) | `index.html` · `.nojekyll`                        |

## 고정점 — 옮기면 안 되는 것

`mockups/`와 `design-system/`은 **이 폴더 안에서 경로가 고정된 앵커다.** 다른 문서를 재배치할 때도
이 둘은 움직이지 않는다.

- **공개 URL**: GitHub Pages가 `main`의 `docs/`를 그대로 서빙한다. `https://dlddu.github.io/tessera/`는
  `index.html`을 거쳐 `mockups/`로 가고, 개별 목업 URL(`…/tessera/mockups/M-J1-S1.html`)이 README에서
  광고된다. 경로가 바뀌면 이미 공유된 링크가 죽는다.
- **코드 주석의 앵커**: `src/renderer/components/WorkspaceRail.tsx` · `src/renderer/styles/shell.css` ·
  `src/renderer/styles/tessera.css`가 `docs/mockups/M-J1-S8.html` · `docs/design-system/`을 **경로로**
  인용한다. 이 둘을 옮기면 `src/`를 고쳐야 하고, `src/*` 변경은 `.github/workflows/ci.yml`의 release
  경로 필터에 걸려 **서명·공증 빌드가 실제 사용자 auto-updater로 배포된다.** 문서 정리를 이유로
  릴리스를 쏘지 않는다.
- **목업 27개 + 갤러리**가 `../design-system/tessera.css`를 상대 참조한다. 둘 중 하나만 움직여도
  28개 링크가 한꺼번에 깨진다.

`tessera-doc-tracker.md`도 root에 고정한다 — 상태 진입점이고, 레포 밖(정합성 모델 정의)에서
`docs/tessera-doc-tracker.md`로 직접 인용된다.

## 링크 정책

- **상대 링크는 정확해야 한다.** 마크다운 `](…)`과 HTML `href`/`src`는 실제 파일로 해석돼야 한다.
  문서를 옮기면 같은 커밋에서 전부 정정한다.
- **백틱 안의 파일명은 이름이지 경로가 아니다.** 산문 속 `` `tessera-prd-backend.md` `` 같은 인용은
  디렉터리를 붙이지 않는다. 경로가 필요하면 위 문서 인덱스가 단일 출처다.
- 문서를 옮긴 커밋은 링크 해석을 스크립트로 확인한 뒤 올린다(`docs/` 안 상대 링크 전수 → 존재 확인).

## 새 문서를 어디에 둘 것인가

1. 가치(V1~V4) 중 하나를 달성하는가?
   - **아니오** → `platform/`에 등재한다(등재 자격은 그 문서가 정의한다). AC를 만들지 않는다.
   - **예** → 아래로.
2. 어떤 종류인가? 가치 → `values/`, 요구사항·AC → `prd/`, 검증 시나리오 → `tests/`,
   사용자 흐름 → `journeys/`, 화면 → `mockups/`, 시각 언어 → `design-system/`.
3. 새 종류라면 **디렉터리를 새로 만들고** 이 지도의 표 두 개(디렉터리·문서 인덱스)와
   `tessera-doc-tracker.md`의 문서 인덱스에 같은 커밋에서 추가한다.
