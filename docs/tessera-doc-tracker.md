# Tessera 문서 체계 상태 추적

> 산출 시점: 2026-06-17 · 최초 생성(초기 일괄 구축)
> 최근 갱신: 2026-06-24 · pane 일시 전체화면 토글(AC1.6 · 요구사항 #12) 추가 — PRD-1·T-1·J1·`M-J1-S7` 작성 + 전체 재검증

## 현재 상태 요약

### 백엔드 사슬 (가치 → PRD → AC → 테스트)
- 정의된 가치: **4개** (V1~V4)
- PRD: **4개** (PRD-1~PRD-4)
- Acceptance Criteria: **25개** (가치 연결됨: 25개 / 미연결: 0개)
  - PRD-1: 6개(AC1.1~1.6), PRD-2: 8개(AC2.1~2.8), PRD-3: 5개(AC3.1~3.5), PRD-4: 6개(AC4.1~4.6)
- 테스트 문서: **4개** (T-1~T-4) — AC 커버됨: 25개 / 미커버: 0개

### 프론트엔드 사슬 (사용자 여정 → mockup ↔ 디자인 시스템)
- 사용자 여정: **4개** (J1~J4, 여정별 파일 분리 + 인덱스 1개) — 가치 연결됨: 4개 / 미연결: 0개. V1~V4 전부 달성, AC1.1~AC4.6(25개) 전부 경유.
- 디자인 시스템: **있음** (`docs/design-system/tessera-design-system.md` + 공유 `tessera.css`) — 토큰/컴포넌트(C-*)/패턴(P-*) 정의됨.
- mockup: **26개** (`docs/mockups/M-Jx-Sn.html`) / mockup 인덱스: **있음** (`docs/mockups/tessera-mockup-index.md`) + 갤러리(`index.html`)
- 여정 단계 시각화: **26 / 26단계** (모든 단계 mockup 작성·연결됨, J1 전체화면 토글 = `M-J1-S7`, J2 host 전용 영역 7단계 = `M-J2-S7` 포함)

- **건강 상태**: ⚠️ **위험 있음** — 🔴 제품 소유자 미확정 1건 (프론트엔드 시각화 공백은 모두 해소됨)

> 백엔드 연결 구조(가치→PRD→AC→테스트)는 모두 이어져 있다(AC 25개 전부 가치·테스트 연결).
> 프론트엔드 사슬도 여정→mockup↔디자인 시스템까지 모두 이어졌다(시각화 26/26). 남은 위험은 제품 소유자 미확정 1건뿐이다.

## 연결 매트릭스

| 가치 | PRD | AC | 테스트 | 상태 |
|------|-----|-----|--------|------|
| V1: 통합된 단일 작업 표면 | PRD-1 (레이아웃) | AC1.1, AC1.2, AC1.3, AC1.4, AC1.5, AC1.6 | T-1 | ✅ 완전 |
| V2: 환경 선택의 자유 | PRD-2 (백엔드/워크스페이스) | AC2.1, AC2.2, AC2.3, AC2.4, AC2.5, AC2.6, AC2.7, AC2.8 | T-2 | ✅ 완전 |
| V3: 격리를 깨지 않는 인증 | PRD-3 (브라우저 라우팅) | AC3.1, AC3.2, AC3.3, AC3.4, AC3.5 | T-3 | ✅ 완전 |
| V4: 작업 손실 없는 복원력 | PRD-4 (상태 복원) | AC4.1, AC4.2, AC4.3, AC4.4, AC4.5, AC4.6 | T-4 | ✅ 완전 |

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
| #12 포커스된 pane 일시 전체화면 토글 | V1 | AC1.6 |

→ 12개 요구사항 전부가 가치·AC·테스트로 연결됨. (누락 요구사항 없음)

## 사용자 여정 ↔ 가치 연결

| 여정 | 제목 | 파일 | 주 가치 | 부 가치 | 경유 AC | 시각화(mockup) |
|------|------|------|---------|---------|---------|----------------|
| J1 | 통합 작업 표면 구성 | `tessera-journey-layout.md` | V1 | V2 | AC1.1~1.6, AC2.1, AC2.2 | ✅ 7/7 |
| J2 | 컨테이너 워크스페이스 격리 작업 | `tessera-journey-backend.md` | V2 | V1 | AC2.1, AC2.3, AC2.4, AC2.5, AC2.6, AC2.7, AC2.8 | ✅ 7/7 |
| J3 | 컨테이너 작업 중 OAuth 인증 완결 | `tessera-journey-browser-routing.md` | V3 | V2 | AC3.1~3.5 | ✅ 6/6 |
| J4 | 크래시에서 작업 복원 | `tessera-journey-state-restoration.md` | V4 | V1 | AC1.5, AC4.1~4.6 | ✅ 6/6 |

→ 4개 여정이 V1~V4를 모두 달성하고, 단계 근거로 AC1.1~AC4.6(25개)을 전부 경유한다. (고아 여정 없음)
→ 전체 26개 단계가 mockup으로 시각화·연결됨(시각화 26/26). 단일 소스는 `mockups/tessera-mockup-index.md`.

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
- (없음) — 25개 AC 모두 달성 가치 명시.

### 🟢 미검증 AC (테스트 없는 AC)
- (없음) — 25개 AC 모두 T-1~T-4 시나리오로 커버.

### 🟢 고아 테스트 (AC를 참조하지 않는 테스트)
- (없음) — 4개 테스트 문서 모두 대상 AC 명시.

### 🟢 [프론트엔드] 시각화 누락 단계 (mockup 없는 여정 단계)
- (없음) — J1~J4 전 단계(26/26)가 대응 mockup(`M-Jx-Sn.html`)을 가리킨다. **해소됨**.

### 🟢 [프론트엔드] 시각화 없는 가치 (mockup 없는 가치)
- (없음) — V1~V4 모두 하나 이상의 mockup으로 시각화됨. **해소됨**.

### 🟢 [프론트엔드] 구조적 공백
- (없음) — 디자인 시스템(`design-system/`)·mockup(`mockups/`)·mockup 인덱스가 모두 작성됨. **해소됨**.

## 위험 우선순위에 따른 다음 액션

1. 🔴 **제품 소유자 확정** — 유일하게 남은 위험. 소유자 지정 후 `tessera-values.md`의 "제품 소유자" 항목 갱신.
2. ✅ **디자인 시스템 셋업** — 완료(`docs/design-system/`).
3. ✅ **mockup 작성 + 인덱스화** — 완료(26개 `M-Jx-Sn.html` + `mockups/tessera-mockup-index.md`). `M-J1-S7`(전체화면 토글)·`M-J2-S7`(host 전용 영역) 포함.
4. ✅ **여정 시각화 칸 연결** — 완료(`tessera-user-journeys.md` 및 여정별 파일의 ⬜ → ✅ 갱신, 재검증). J2 7/7.
5. (선택) 제품명 확정 — 현재 코드네임 `Tessera`. 변경 시 파일명·헤딩 일괄 갱신 필요.

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
| mockup (26개) | `mockups/M-Jx-Sn.html` |
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
