/**
 * C-statusbar: tmux-style bottom bar. With a workspace: left = tessera mark +
 * name, middle = backend, right = keymap hints + clock. Empty (no-workspace)
 * variant: "워크스페이스 없음" + the ⌘N hint. The clock is a static placeholder.
 *
 * The keymap hints are read from the shared command registry (J2-S5), so the
 * displayed keycaps always match the real bindings — the same source the keymap
 * dispatches and the ⌘K palette lists.
 */
import type { BackendKind } from '@shared/types'
import { commandById, type CommandId } from '@renderer/commands'
import { Keycap } from './Keycap'

/** The condensed set of shortcuts the status bar teases (workspace variant). */
const KEY_HINTS: ReadonlyArray<{ id: CommandId; label: string }> = [
  { id: 'split-v', label: '분할' },
  { id: 'focus', label: '포커스' },
  { id: 'tab-switch', label: '탭' },
  { id: 'zoom', label: '전체화면' },
  { id: 'overlay', label: '단축키' }
]

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
  /**
   * Backend kind of the active workspace — styles the backend segment as
   * `seg cont` vs `seg host`, matching the title-bar badge (M-J2-S4). Ignored in
   * the empty (no-workspace) variant, which shows no backend segment.
   */
  backendKind: BackendKind
  /**
   * Pane count of the open host-only area, or `null` when none is open (AC2.7).
   * Renders the "+ host 영역 · N pane" segment beside the backend segment.
   */
  hostAreaPaneCount?: number | null
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
  backendKind,
  hostAreaPaneCount = null,
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
            <b>새 워크스페이스</b> <Keycap keycap={commandById('new-workspace').keycap} />
          </span>
        </div>
        <UpdateAffordance version={updateReadyVersion} onRestart={onUpdateRestart} />
        <div className="clock">—:—</div>
      </div>
    )
  }

  // A container workspace teases the host-area shortcut (⌃⌘H) too, matching the
  // M-J2-S7 mockup — it's the one operation unique to container workspaces.
  const hints =
    backendKind === 'container'
      ? [{ id: 'open-host-area' as const, label: 'host 영역' }, ...KEY_HINTS]
      : KEY_HINTS

  return (
    <div className="statusbar" data-testid="statusbar">
      <div className="seg ws">
        <Mark />
        <span>{workspace}</span>
      </div>
      <div className={`seg ${backendKind === 'container' ? 'cont' : 'host'}`}>{backend}</div>
      {hostAreaPaneCount !== null ? (
        <div className="seg host" data-testid="host-area-segment">
          + host 영역 · {hostAreaPaneCount} pane
        </div>
      ) : null}
      <div className="spacer" />
      <div className="seg keys">
        {hints.map(({ id, label }) => (
          <span key={id}>
            <b>{label}</b> <Keycap keycap={commandById(id).keycap} />
          </span>
        ))}
      </div>
      <UpdateAffordance version={updateReadyVersion} onRestart={onUpdateRestart} />
      <div className="clock">—:—</div>
    </div>
  )
}
