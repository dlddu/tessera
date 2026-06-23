/**
 * C-claude (static visual): the renderer-side surface for a Claude Code tab
 * (M-J1-S4). Presentational only — it mirrors the `.claude` DOM from the
 * M-J1-S4 mockup (a short conversation transcript + a composer) using the
 * existing design-system classes, with no Claude session backend behind it.
 * The live agent session is later feature work (PRD-5 / J3); until then this
 * gives the 2×2 layout a faithful Claude pane to compose with.
 */
export function ClaudeSurface() {
  return (
    <div className="claude" data-testid="claude-surface">
      <div className="turns">
        <div className="turn user">
          <div className="av">You</div>
          <div className="msg">이 라우트 서버에 구조화 에러 로깅 추가해줘</div>
        </div>
        <div className="turn asst">
          <div className="av">◆</div>
          <div className="msg">
            listen 콜백을 분리하고 실패 시 종료 코드를 나눴습니다.{' '}
            <span className="mono">src/server.ts</span> 패치를 적용할게요.
          </div>
        </div>
        <div className="turn asst">
          <div className="av">◆</div>
          <div className="run">
            <span className="spinner" />
            src/server.ts 편집 중…
          </div>
        </div>
      </div>
      <div className="composer">
        <span>메시지 입력…</span>
        <span className="send">↑</span>
      </div>
    </div>
  )
}
