/**
 * C-statusbar: tmux-style bottom bar. With a workspace: left = tessera mark +
 * name, middle = backend, right = keymap hints + clock. Empty (no-workspace)
 * variant: "워크스페이스 없음" + the ⌘N hint. Values are static placeholders.
 */
function Mark() {
  return (
    <span className="mark">
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

interface StatusBarProps {
  workspace: string | null
  backend: string
  /** Pending update version when one is downloaded and ready to install. */
  updateReadyVersion?: string | null
  /** Invoked when the user clicks the restart affordance. */
  onUpdateRestart?: (() => void) | undefined
}

/**
 * Right-side affordance shown once an update is downloaded. Clicking it quits
 * and relaunches into the new version. Hidden until `version` is set.
 */
function UpdateAffordance({
  version,
  onRestart
}: {
  version: string | null
  onRestart?: (() => void) | undefined
}) {
  if (version === null) return null
  return (
    <button
      type="button"
      className="seg update"
      onClick={onRestart}
      title={`v${version} 다운로드 완료`}
      data-testid="update-affordance"
    >
      <span className="udot" />
      업데이트 준비됨 — 재시작
    </button>
  )
}

export function StatusBar({
  workspace,
  backend,
  updateReadyVersion = null,
  onUpdateRestart
}: StatusBarProps) {
  if (workspace === null) {
    return (
      <div className="statusbar" data-testid="statusbar">
        <div className="seg ws">
          <Mark />
          <span className="muted">워크스페이스 없음</span>
        </div>
        <div className="spacer" />
        <div className="seg keys">
          <span>
            <b>새 워크스페이스</b>{' '}
            <span className="kcrow">
              <span className="kc">⌘</span>
              <span className="plus">+</span>
              <span className="kc">N</span>
            </span>
          </span>
        </div>
        <UpdateAffordance version={updateReadyVersion} onRestart={onUpdateRestart} />
        <div className="clock">—:—</div>
      </div>
    )
  }

  return (
    <div className="statusbar" data-testid="statusbar">
      <div className="seg ws">
        <Mark />
        <span>{workspace}</span>
      </div>
      <div className="seg host">{backend}</div>
      <div className="spacer" />
      <div className="seg keys">
        <span>
          <b>분할</b>{' '}
          <span className="kcrow">
            <span className="kc">⌘</span>
            <span className="plus">+</span>
            <span className="kc">D</span>
          </span>
        </span>
        <span>
          <b>포커스</b>{' '}
          <span className="kcrow">
            <span className="kc">⌥⌘</span>
            <span className="plus">+</span>
            <span className="kc">→</span>
          </span>
        </span>
        <span>
          <b>탭</b>{' '}
          <span className="kcrow">
            <span className="kc">⇧⌘</span>
            <span className="plus">+</span>
            <span className="kc">]</span>
          </span>
        </span>
        <span>
          <b>전체화면</b>{' '}
          <span className="kcrow">
            <span className="kc">⌃⌘</span>
            <span className="plus">+</span>
            <span className="kc">⏎</span>
          </span>
        </span>
      </div>
      <UpdateAffordance version={updateReadyVersion} onRestart={onUpdateRestart} />
      <div className="clock">—:—</div>
    </div>
  )
}
