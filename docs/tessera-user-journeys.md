# Tessera 사용자 여정 — 인덱스

> 이 문서는 사용자 여정의 **개요/인덱스**다. 각 여정의 전체 단계 흐름은 여정별 파일에 담겨 있다.
> 모든 여정은 `tessera-values.md`의 가치(V1~V4) 중 하나 이상을 달성하며, 각 단계는 어떤 mockup으로
> 시각화되는지를 추적한다. 최상위 판단 기준은 가치 문서다.

> **문서 체계 상 위치**: 가치 → PRD → AC → 테스트의 백엔드 사슬과,
> 사용자 여정 → mockup ↔ 디자인 시스템의 프론트엔드 사슬이 모두 갖춰졌다.
> 디자인 시스템과 24개 mockup이 작성·연결되어, 모든 여정의 시각화 칸이 **완료(✅)** 상태다.
> 전체 mockup은 [갤러리](./mockups/index.html)와 [mockup 인덱스](./mockups/tessera-mockup-index.md)에서 볼 수 있다.

---

## 주 페르소나

이 문서의 여정들은 하나의 주 페르소나가 서로 다른 상황에 놓인 모습이다.

- **누가**: macOS에서 일하는 개발자.
- **평소 상황**: 터미널·인터넷 브라우저·텍스트 편집기·Claude Code(AI 코딩) 사이를 하루에도 수십 번 오가며
  작업한다. 앱 간 전환 비용, 환경 설정의 번거로움, 그리고 예기치 못한 종료로 인한 작업 손실에 민감하다.
- **무엇을 원하나**: 흩어진 도구를 하나의 표면에서 다루고(V1), 작업 성격에 맞는 실행 환경을
  자유롭게 고르며(V2), 격리 환경에서도 인증이 끊기지 않고(V3), 어떤 비정상 종료에도 작업을 잃지 않기를(V4) 원한다.

각 여정 파일은 이 개발자를 해당 상황에 놓고 목표 달성 경로를 기술한다.

---

## 여정 인덱스 · 가치 커버리지

| 여정 | 제목 | 파일 | 주 가치 | 부 가치 | 경유 AC | 시각화 |
|------|------|------|---------|---------|---------|--------|
| **J1** | 통합 작업 표면 구성 | `tessera-journey-layout.md` | V1 | V2 | AC1.1~1.5, AC2.1, AC2.2 | ✅ 6/6 |
| **J2** | 컨테이너 워크스페이스 격리 작업 | `tessera-journey-backend.md` | V2 | V1 | AC2.1, AC2.3, AC2.4, AC2.5, AC2.6 | ✅ 6/6 |
| **J3** | 컨테이너 작업 중 OAuth 인증 완결 | `tessera-journey-browser-routing.md` | V3 | V2 | AC3.1~3.5 | ✅ 6/6 |
| **J4** | 크래시에서 작업 복원 | `tessera-journey-state-restoration.md` | V4 | V1 | AC1.5, AC4.1~4.6 | ✅ 6/6 |

> 4개 여정이 V1~V4 가치 전부를 달성하며, 단계 근거로 AC1.1~AC4.6(22개)을 모두 한 번 이상 경유한다. (고아 여정 없음)
> 24개 단계 전부가 mockup으로 시각화됨(시각화 24/24). V1~V4 가치 전부가 시각화됨.

**시각화 범례**: ⬜ = mockup 미작성 / ✅ = mockup 작성·연결됨. 각 여정 파일의 `M-Jx-Sn`은 제안 mockup ID(미작성).

---

## 시각화 상태와 다음 단계

모든 여정(J1~J4)의 24개 단계가 mockup으로 시각화되어 연결되었다(✅ 24/24). 프론트엔드 사슬의
구조적 공백이 모두 해소되었다.

- **시각화 누락 단계(unvisualized step)**: 없음. J1~J4의 전 단계(24/24)가 대응 mockup을 가리킨다.
- **디자인 시스템**: UI 시각 언어(토큰/컴포넌트/패턴)가 [디자인 시스템 문서](./design-system/tessera-design-system.md)와 공유 [`tessera.css`](./design-system/tessera.css)로 정의됨.
- **mockup 인덱스**: mockup ↔ 가치/여정/디자인 시스템 연결의 단일 소스가 [mockup 인덱스](./mockups/tessera-mockup-index.md)로 존재.
- **시각화 없는 가치(unvisualized value)**: 없음. V1~V4 모두 하나 이상의 mockup으로 시각화됨.

진행 결과(`design-doc-structure-validator`의 협업 가이드 기준, 4단계 모두 완료):

1. ✅ **디자인 시스템 셋업** — 토큰/컴포넌트/패턴을 `docs/design-system/`에 정의(문서 + `tessera.css`).
2. ✅ **mockup 작성** — 각 여정 단계의 `M-Jx-Sn`에 대응하는 24개 화면을 `docs/mockups/`에 제작(공유 CSS 링크).
3. ✅ **mockup 인덱스 작성** — 각 mockup의 여정 단계/가치/AC/디자인 시스템 항목 매핑을 기록.
4. ✅ **여정 파일 갱신** — 각 단계의 시각화 칸을 ⬜ → ✅ 로 연결하고 인덱스를 재검증.

---

## 문서 체계 안내

- 최상위 기준(참조 전용): `tessera-values.md`
- 사용자 여정 인덱스(이 문서): `tessera-user-journeys.md`
- 사용자 여정(여정별): `tessera-journey-layout.md`, `tessera-journey-backend.md`, `tessera-journey-browser-routing.md`, `tessera-journey-state-restoration.md`
- 디자인 시스템: `design-system/tessera-design-system.md`, `design-system/tessera.css`
- mockup: `mockups/` (24개 `M-Jx-Sn.html`), 갤러리 `mockups/index.html`
- mockup 인덱스: `mockups/tessera-mockup-index.md`
- 상태 추적: `tessera-doc-tracker.md`
