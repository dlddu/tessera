# PRD: 백엔드 & 워크스페이스 (Backend & Workspace)

- **PRD ID**: PRD-2
- **참조 가치 문서**: `tessera-values.md`

## 달성 가치

- **V2: 환경 선택의 자유** — 동일한 도구·조작을 유지한 채 workspace마다 호스트/컨테이너 백엔드를 선택하고,
  컨테이너도 호스트만큼 native하게 다룬다.

## 개요

**Workspace**는 window를 관리하는 단위이자, 실행 환경을 묶는 단위다. workspace는 하나의 **backend**에 귀속된다.

- **Backend 추상화**: 상위 UI(window/pane/tab, 4종 컴포넌트)는 backend 종류를 모른다.
  backend는 "PTY 띄우기 / 파일 읽고 쓰기 / 프로세스 실행 / 환경변수 제공" 같은 공통 인터페이스를 구현한다.
- **Host backend**: macOS 호스트에서 직접 프로세스를 띄운다(node-pty PTY, 호스트 파일시스템, 호스트 셸).
- **Container backend**: 컨테이너 런타임(Docker 등) 위에서 동작한다.
  터미널은 컨테이너로 exec, 편집기는 컨테이너 파일시스템을 대상으로, Claude Code는 컨테이너 내부에서 실행된다.

| 컴포넌트 | Host backend | Container backend |
|---|---|---|
| 터미널 | 호스트 PTY(node-pty) | 컨테이너 exec PTY |
| 텍스트 편집기 | 호스트 fs 버퍼 | 컨테이너 fs 버퍼(마운트/런타임 fs API) |
| Claude Code GUI | 호스트에서 실행 | 컨테이너 내부에서 실행 |
| 인터넷 브라우저 | 호스트(공통) | **호스트**(PRD-3에서 라우팅) |

> 브라우저는 backend와 무관하게 항상 호스트에서 실행된다. 컨테이너 workspace의 브라우저 open 요청은
> PRD-3의 라우팅으로 처리한다.

### Host 전용 영역 (컨테이너 workspace의 선택적 탈출구)

컨테이너 workspace는 기본적으로 모든 도구를 컨테이너에서 실행한다. 여기에 더해, 사용자는 선택적으로
**host 전용 영역(host area)** 을 열 수 있다. host 영역은 workspace 안에서 시각적으로 구분되는 별도 영역으로,
그 안의 pane/tab(터미널·편집기·Claude Code)은 컨테이너가 아니라 **호스트 backend**에서 동작한다
(호스트 PTY·호스트 파일시스템·호스트에서 실행되는 Claude Code — host backend와 동일하다).

- **기본값**: host 영역 없음(순수 컨테이너). 호스트 실행은 의도적으로 영역을 열었을 때만 일어난다.
- **경계 단위**: 호스트/컨테이너 구분은 **영역 경계**로 이뤄진다. 임의의 pane을 하나씩 섞는 것이 아니라,
  한 영역 안에서는 backend가 균일하다(컨테이너 기본 영역 + 선택적 host 영역).
- **격리 보존**: host 영역을 열어도 컨테이너 기본 영역의 격리는 그대로 유지된다. 영역 경계가 명확히
  표시되어, 컨테이너에서 돌려야 할 작업을 실수로 호스트에서 실행하지 않도록 한다.
- **브라우저와의 관계**: 항상 호스트에서 도는 브라우저(위 표)와 같은 결의 "호스트 탈출구"를
  나머지 컴포넌트로 선택적으로 확장한 것이다.

## Acceptance Criteria

### AC2.1: workspace 생성 시 backend 선택

- **설명**: 사용자는 workspace를 생성·실행할 때 backend 종류(host / container)를 선택한다.
  host는 작업 디렉토리를, container는 이미지/작업 디렉토리/마운트 등을 지정할 수 있다.
- **달성 가치**: V2
- **검증 방법**: host workspace 1개, container workspace 1개를 각기 다른 설정으로 생성하고 정상 기동되는지 확인.

### AC2.2: host backend에서 컴포넌트 실행

- **설명**: host backend workspace의 터미널/편집기/Claude Code는 호스트 프로세스·호스트 파일시스템 위에서 동작한다.
- **달성 가치**: V2
- **검증 방법**: host workspace에서 터미널 명령 실행 결과가 호스트 환경과 일치하고, 편집기가 호스트 파일을 열고 저장하는지 확인.

### AC2.3: container backend에서 컴포넌트 실행

- **설명**: container backend workspace의 터미널은 컨테이너로 exec되고, 편집기는 컨테이너 파일시스템을 대상으로 하며,
  Claude Code는 컨테이너 내부에서 실행된다. 호스트 환경과 컨테이너 환경이 명확히 구분된다.
- **달성 가치**: V2
- **검증 방법**: container workspace에서 `hostname`/`env`/파일 트리가 컨테이너의 것과 일치하고, 호스트와 격리됨을 확인.

### AC2.4: pane/tab은 자신이 속한 영역의 환경을 상속

- **설명**: workspace 내에서 새로 추가되는 pane/tab은 **자신이 속한 영역의 backend와 환경**(작업 디렉토리,
  환경변수 등)을 상속한다. 기본 영역에 추가하면 workspace의 backend(예: 컨테이너)를, host 영역에 추가하면
  호스트 backend를 상속한다. 영역 경계 안에서는 backend가 균일하며, 경계를 넘는 임의 혼합은 없다.
- **달성 가치**: V2
- **검증 방법**: container workspace의 기본 영역에 pane/tab을 여러 개 추가해 모두 동일 컨테이너 환경에서
  실행되는지, host 영역에 추가한 pane/tab은 호스트 환경을 상속하는지 각각 확인.

### AC2.5: 동일 UI/조작으로 두 backend 운용

- **설명**: host와 container workspace는 동일한 window/pane/tab 조작, 동일한 컴포넌트 UI로 다룬다.
  사용자는 backend를 바꿔도 새로운 조작 방식을 학습하지 않는다.
- **달성 가치**: V2
- **검증 방법**: 동일한 단축키·조작 시퀀스를 host와 container workspace에 각각 적용해 결과가 동등한지 확인.

### AC2.6: container backend의 생명주기와 native 수준 응답성

- **설명**: container backend의 시작/정지/제거 등 생명주기를 관리할 수 있으며, 터미널 입출력 지연 등
  체감 응답성이 호스트에 준하는 수준이어야 한다(원격 부속물처럼 느껴지지 않음).
- **달성 가치**: V2
- **검증 방법**: container workspace 시작·정지·재시작을 수행하고, 터미널 입력→출력 지연이 호스트 대비 체감상 동등한지 확인.

### AC2.7: 컨테이너 workspace의 선택적 host 전용 영역

- **설명**: container backend workspace에서 사용자는 선택적으로 **host 전용 영역**을 열어, 그 영역의
  터미널/편집기/Claude Code를 호스트 backend(호스트 PTY·호스트 파일시스템·호스트에서 실행되는 Claude Code)에서
  실행할 수 있다. 기본값은 host 영역 없음(순수 컨테이너)이며, 호스트 실행은 영역을 명시적으로 열었을 때만 발생한다.
  같은 workspace 안에서 컨테이너 기본 영역과 host 영역이 공존한다.
- **달성 가치**: V2
- **검증 방법**: container workspace에서 host 영역을 열고, 그 안의 터미널에서 `hostname`/`env`가 호스트의 것과
  일치하며 편집기가 호스트 파일을 열고 저장하는지 확인. host 영역을 열지 않은 상태에서는 모든 도구가
  컨테이너에서만 실행됨을 확인.

### AC2.8: host 영역 경계의 명시성과 컨테이너 격리 보존

- **설명**: host 영역과 컨테이너 기본 영역의 경계는 UI에서 명확히 구분되어, 어떤 pane/tab이 호스트에서
  도는지 한눈에 알 수 있다. host 영역을 열어도 컨테이너 기본 영역의 격리(호스트와의 분리)는 그대로
  유지되며, 두 영역은 서로의 파일시스템·프로세스를 공유하지 않는다.
- **달성 가치**: V2
- **검증 방법**: host 영역이 열린 상태에서 영역 표식(시각적 구분)이 노출되는지 확인하고, 컨테이너 영역의
  터미널에서 `hostname`/`env`/파일 트리가 여전히 컨테이너의 것(호스트 영역의 변경과 무관)임을 확인.

## 의존 관계

- PRD-1: window/pane/tab 레이아웃을 backend 위에 얹는다.
- PRD-3: 컨테이너 workspace의 브라우저 open 요청을 호스트 브라우저로 라우팅한다. host 전용 영역(AC2.7)은
  항상 호스트에서 도는 브라우저와 같은 결의 호스트 실행을 나머지 컴포넌트로 확장한 것이다.
- PRD-4: backend 종료 시 상태 복원이 동작하려면 상태가 호스트 측에 영속되어야 한다(컨테이너 소멸과 독립).
  host 영역의 도구는 호스트 프로세스이므로 host backend와 동일한 영속·복원 경로를 따른다.
