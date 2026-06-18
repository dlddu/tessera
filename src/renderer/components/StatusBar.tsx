/**
 * C-statusbar: tmux-style bottom bar. Left = tessera mark + workspace, middle =
 * backend, right = keymap hints + clock. Values are static placeholders.
 */
export function StatusBar({ workspace, backend }: { workspace: string; backend: string }) {
  return (
    <div className="statusbar" data-testid="statusbar">
      <div className="seg ws">
        <span className="mark">
          <i />
          <i />
          <i />
          <i />
        </span>
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
