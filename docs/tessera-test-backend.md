# 테스트 문서: 백엔드 & 워크스페이스

- **Test ID**: T-2
- **대상 PRD**: PRD-2 (`tessera-prd-backend.md`)

## 검증 대상 AC

- AC2.1: workspace 생성 시 backend 선택
- AC2.2: host backend에서 컴포넌트 실행
- AC2.3: container backend에서 컴포넌트 실행
- AC2.4: pane/tab은 workspace 환경을 상속
- AC2.5: 동일 UI/조작으로 두 backend 운용
- AC2.6: container backend의 생명주기와 native 수준 응답성

## 테스트 시나리오

### 시나리오 1: 두 종류 workspace 생성

- **사전 조건**: 실행 중인 Tessera, 사용 가능한 컨테이너 런타임
- **실행 단계**: host workspace(작업 디렉토리 지정) 1개와 container workspace(이미지·작업 디렉토리·마운트 지정) 1개 생성
- **기대 결과**: 두 workspace가 각 설정대로 정상 기동
- **검증 AC**: AC2.1

### 시나리오 2: host 환경 확인

- **사전 조건**: host workspace 기동됨
- **실행 단계**: 터미널에서 `hostname`/`env` 확인, 편집기로 호스트 파일 열고 저장
- **기대 결과**: 호스트 환경값과 일치, 파일 입출력이 호스트 fs에 반영
- **검증 AC**: AC2.2

### 시나리오 3: container 환경 격리 확인

- **사전 조건**: container workspace 기동됨
- **실행 단계**: 터미널에서 `hostname`/`env`/파일 트리 확인, Claude Code 실행 위치 확인
- **기대 결과**: 컨테이너의 환경값과 일치하고 호스트와 격리됨
- **검증 AC**: AC2.3

### 시나리오 4: workspace 환경 상속

- **사전 조건**: container workspace, pane/tab 1개 존재
- **실행 단계**: 같은 workspace에 pane/tab을 여러 개 추가
- **기대 결과**: 추가된 모든 pane/tab이 동일 컨테이너 환경(작업 디렉토리·env)에서 실행, backend 혼재 없음
- **검증 AC**: AC2.4

### 시나리오 5: 조작 동등성

- **사전 조건**: host workspace와 container workspace
- **실행 단계**: 동일한 단축키·조작 시퀀스(분할/탭 생성/포커스 이동)를 양쪽에 적용
- **기대 결과**: 양쪽에서 동등한 결과, 별도 조작 학습 불필요
- **검증 AC**: AC2.5

### 시나리오 6: 컨테이너 생명주기와 응답성

- **사전 조건**: container workspace
- **실행 단계**: 컨테이너 시작→정지→재시작 수행, 터미널 입력→출력 지연 측정
- **기대 결과**: 생명주기 조작이 정상 동작, 입출력 지연이 호스트 대비 체감상 동등
- **검증 AC**: AC2.6
