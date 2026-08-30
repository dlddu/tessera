# 사용자 여정 J3 — 컨테이너 작업 중 OAuth 인증 완결

- **여정 ID**: J3
- **참조 가치 문서**: `tessera-values.md`
- **여정 인덱스**: `tessera-user-journeys.md`
- **관련 PRD / 테스트**: PRD-3 (`tessera-prd-browser-routing.md`) / T-3 (`tessera-test-browser-routing.md`)

## 페르소나 · 상황

- **페르소나**: macOS에서 일하는 개발자 (주 페르소나 정의는 `tessera-user-journeys.md` 참조).
- **상황**: 컨테이너 워크스페이스에서 작업하던 중, CLI/도구가 외부 서비스(예: 클라우드·VCS) OAuth 로그인을
  요구한다. 컨테이너 격리를 유지하면서 인증을 끝내야 한다.

## 달성 가치

- **V3(격리를 깨지 않는 인증 경험)** — 주
- **V2(환경 선택의 자유)** — 부 (컨테이너 backend 전제)

## 트리거

컨테이너 내부 프로세스가 브라우저 인증을 시작.

## 단계

| 단계 | 사용자 행동 · 시스템 반응 | 근거 AC | 시각화 |
|------|---------------------------|---------|--------|
| 1 | 컨테이너 터미널에서 배포 CLI에 로그인하려고 `acme auth login`을 친다. CLI가 브라우저를 열려 하지만 컨테이너 안에는 브라우저가 없다. | AC3.2 | ✅ [M-J3-S1](./mockups/M-J3-S1.html) |
| 2 | 흐름이 멈추는 대신, 호스트 Tessera 브라우저에 IdP 로그인 페이지가 새 tab으로 떠 있다 — URL을 복사해 다른 앱으로 옮기는 일이 없다. | AC3.1, AC3.2 | ✅ [M-J3-S2](./mockups/M-J3-S2.html) |
| 3 | 뜬 페이지에서 이미 로그인된 계정이 보여, 비밀번호·2FA를 다시 치지 않고 승인 버튼만 누른다. | AC3.4 | ✅ [M-J3-S3](./mockups/M-J3-S3.html) |
| 4 | 승인 직후 IdP가 `http://localhost:53219/callback`으로 리다이렉트한다. 사용자는 아무것도 하지 않지만 이 콜백은 호스트가 아니라 컨테이너 안 리스너까지 전달된다. | AC3.3 | ✅ [M-J3-S4](./mockups/M-J3-S4.html) |
| 5 | 터미널로 눈을 돌리면 콜백 수신·토큰 저장 로그가 이미 찍혀 있고 프롬프트가 돌아와 있다 — 그대로 배포 명령을 이어 친다. | AC3.4 | ✅ [M-J3-S5](./mockups/M-J3-S5.html) |
| 6 | 두 번째 워크스페이스(`web-svc`)에서도 같은 로그인을 동시에 돌린다. 각자의 콜백이 자기 컨테이너로만 들어와, 어느 쪽 토큰이 어디로 갔는지 확인할 일이 없다. | AC3.5 | ✅ [M-J3-S6](./mockups/M-J3-S6.html) |

## 완료 상태

컨테이너에서 시작한 OAuth가 호스트 브라우저 로그인을 거쳐 컨테이너 프로세스의 토큰 수신까지
끊김 없이 완결된다 → **V3 달성**. 격리가 인증 흐름을 가로막지 않는다.

## 시각화 상태

이 여정의 6개 단계가 모두 mockup으로 작성·연결되었다(✅ 6/6). 갤러리는 [`mockups/index.html`](./mockups/index.html),
mockup↔여정↔가치 매핑은 [`mockups/tessera-mockup-index.md`](./mockups/tessera-mockup-index.md)를 참조한다.

> 시각화 범례: ⬜ = mockup 미작성 / ✅ = mockup 작성·연결됨. 위 표의 ✅ 항목은 `mockups/` 아래 자체 완결 HTML로 연결된다.
