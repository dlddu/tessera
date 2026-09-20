# Tessera 문서 배치 규약

> 이 폴더는 제품 의도의 **단일 소스(SSOT)** 다. 코드가 무엇을 해야 하는지는 여기서 정해지고,
> `src/`·`test/`는 그것을 실현·검증한다.

## 이 문서와 허브의 역할 분담

`docs/`에는 "무엇이 어디에 있는가"를 말하는 면이 둘 있다. 같은 목록을 둘 다 들고 있으면 한쪽만
갱신되어 곧바로 drift가 되므로, **읽는 사람과 답하는 질문으로 나눈다.**

| 면                    | 독자                 | 답하는 질문                        | 문서 목록을 갖는가                   |
| --------------------- | -------------------- | ---------------------------------- | ------------------------------------ |
| `index.html` (허브)   | 문서를 **읽으러** 온 사람 (GitHub Pages) | "그 문서를 어디서 읽나"            | **갖는다 — 이것이 정본이다**         |
| `README.md` (이 문서) | 문서를 **쓰러** 온 사람 (레포) | "새 문서를 어디에 두나"            | 갖지 않는다                          |
| `tessera-doc-tracker.md` | 정합성을 **판정하러** 온 사람 | "무엇이 어디까지 구현·검증됐나" | 갖지 않는다(상태만 집계)             |

따라서 **이 문서에는 문서 인덱스 표가 없다.** 문서를 찾으려면 허브([`index.html`](./index.html))를
본다. 이 문서는 아래의 배치 규칙과 고정점만 정한다.

## 구획 규칙

1. **문서 종류당 디렉터리 하나.** 중첩은 한 단계까지다. 종류가 같으면 같은 디렉터리에 들어간다.
2. **root에는 진입점과 메타만.** 이 규약, 상태 추적, GitHub Pages 진입 파일이 전부다.
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
| `mockups/`        | 화면 시안           | 여정 단계별 정적 HTML 목업(`M-Jx-Sn.html`) + 갤러리 + 인덱스     |
| `design-system/`  | 디자인 시스템       | 토큰·컴포넌트(C-\*)·패턴(P-\*) 정의와 공유 `tessera.css`         |
| `platform/`       | 플랫폼 인프라       | 가치 사슬 밖 사용자 대면 표면(진단·auto-update)                 |

사슬은 `values/` → `prd/`(AC) → `tests/`, 그리고 그 위에 사용자 여정 → `mockups/` ↔ `design-system/`이
얹힌다. `platform/`은 이 사슬 **밖**이며 AC를 만들지 않는다.

### 아직 구획이 없는 종류 — 사용자 여정

여정 문서(`tessera-journey-*.md` 4개 + `tessera-user-journeys.md`)는 **의도적으로 root에 남아 있다.**
규칙 1대로라면 `journeys/`로 내려가야 하지만, 지금 옮기면 두 곳이 조용히 어긋난다.

- 레포 밖 정합성 모델 `tbm_tessera-journey-mockup`의 to-be 버전 스크립트가
  `git ls-files -- 'docs/tessera-journey-*.md' 'docs/tessera-user-journeys.md'`로 여정 문서를 **평면 경로
  glob**으로 집는다. 옮기면 glob이 0건이 되고, 스크립트는 실패하지 않은 채 "여정 문서가 없는" 지문을
  산출한다 — 이후 여정 문서가 어떻게 바뀌어도 그 모델은 변화를 보지 못한다.
- `reader.html`의 `mockupBase`가 `journeys/`를 **여정 mockup**의 자리로 예약해 두고 있어, 같은 이름의
  디렉터리에 여정 *문서*를 넣으면 두 종류가 한 경로를 다툰다.

그러므로 `journeys/` 구획은 모델 쪽 glob이 경로 독립적으로 고쳐지고 `mockupBase`의 자리가 확정된
뒤에 연다. 그때까지 여정 문서의 위치는 이 규약의 **알려진 예외**다.

## 고정점 — 옮기면 안 되는 것

`mockups/`와 `design-system/`은 **이 폴더 안에서 경로가 고정된 앵커다.** 다른 문서를 재배치할 때도
이 둘은 움직이지 않는다.

- **공개 URL**: GitHub Pages가 `main`의 `docs/`를 그대로 서빙한다. 개별 목업 URL
  (`…/tessera/mockups/M-J1-S1.html`)이 README에서 광고된다. 경로가 바뀌면 이미 공유된 링크가 죽는다.
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

- **상대 링크는 정확해야 한다.** 마크다운 `](…)`과 HTML `href`/`src`, 그리고 허브의
  `reader.html?doc=…` 타깃은 모두 실제 파일로 해석돼야 한다. 문서를 옮기면 같은 커밋에서 전부 정정한다.
- **백틱 안의 파일명은 이름이지 경로가 아니다.** 산문 속 `` `tessera-prd-backend.md` `` 같은 인용은
  디렉터리를 붙이지 않는다. 경로가 필요하면 허브가 단일 출처다.
- 문서를 옮긴 커밋은 링크 해석을 스크립트로 확인한 뒤 올린다:

  ```bash
  node scripts/check-docs-links.mjs
  ```

  `docs/` 안의 마크다운 상대 링크 · HTML `href`/`src` · 허브의 `reader.html?doc=` 타깃을 전수로
  해석해 실존 파일인지 확인한다. 깨진 링크가 하나라도 있으면 0이 아닌 코드로 끝난다.

## 새 문서를 어디에 둘 것인가

1. 가치(V1~V4) 중 하나를 달성하는가?
   - **아니오** → `platform/`에 등재한다(등재 자격은 그 문서가 정의한다). AC를 만들지 않는다.
   - **예** → 아래로.
2. 어떤 종류인가? 가치 → `values/`, 요구사항·AC → `prd/`, 검증 시나리오 → `tests/`,
   화면 → `mockups/`, 시각 언어 → `design-system/`.
   사용자 흐름(여정)은 위 '아직 구획이 없는 종류'대로 당분간 root에 둔다.
3. 새 종류라면 **디렉터리를 새로 만들고** 이 규약의 디렉터리 표와 허브(`index.html`)에
   같은 커밋에서 추가한다. 그리고 `node scripts/check-docs-links.mjs`를 돌린다.
