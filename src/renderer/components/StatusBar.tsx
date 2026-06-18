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

export function StatusBar({ workspace, backend }: { workspace: string | null; backend: string }) {
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
            <span className="kc">⌃⌘</span>
            <span className="plus">+</span>
            <span className="kc">→</span>
          </span>
        </span>
        <span>
          <b>탭</b>{' '}
          <span className="kcrow">
            <span className="kc">⌃</span>
            <span className="plus">+</span>
            <span className="kc">Tab</span>
          </span>
        </span>
      </div>
      <div className="clock">—:—</div>
    </div>
  )
}
