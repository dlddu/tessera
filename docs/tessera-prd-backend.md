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

> 브라우저만은 backend와 무관하게 항상 호스트에서 실행된다. 컨테이너 workspace의 브라우저 open 요청은
> PRD-3의 라우팅으로 처리한다.

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

### AC2.4: pane/tab은 workspace 환경을 상속

- **설명**: workspace 내에서 새로 추가되는 모든 pane/tab은 해당 workspace의 backend와 환경(작업 디렉토리,
  환경변수 등)을 상속한다. 같은 workspace 안에서 backend가 섞이지 않는다.
- **달성 가치**: V2
- **검증 방법**: container workspace에서 pane/tab을 여러 개 추가하고, 모두 동일 컨테이너 환경에서 실행됨을 확인.

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

## 의존 관계

- PRD-1: window/pane/tab 레이아웃을 backend 위에 얹는다.
- PRD-3: 컨테이너 workspace의 브라우저 open 요청을 호스트 브라우저로 라우팅한다.
- PRD-4: backend 종료 시 상태 복원이 동작하려면 상태가 호스트 측에 영속되어야 한다(컨테이너 소멸과 독립).
