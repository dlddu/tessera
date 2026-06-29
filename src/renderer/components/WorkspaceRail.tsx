/**
 * C-workspace-rail / P-workspace-rail (AC1.7): the single window's left-column
 * workspace list + switcher (M-J1-S8). Each row activates its workspace on click
 * (⌘+its number does the same, wired up in App); the dashed footer button opens
 * the creation dialog. The active row is highlighted, and a backend dot (host vs
 * container) precedes each name. Layout/styling mirror docs/mockups/M-J1-S8.html
 * and the `.wsrail`/`.wsitem`/… classes ported into the app stylesheet.
 *
 * The first nine rows show a `⌘N` hint matching their keyboard shortcut; beyond
 * nine, rows stay click-only (App only binds ⌘1–⌘9).
 */
import type { CreateWorkspaceResult } from '@shared/ipc'

/** Beyond this many rows there's no number shortcut, so we drop the hint. */
const MAX_SHORTCUT = 9

interface WorkspaceRailProps {
  /** Every known workspace skeleton, in switch/shortcut order (App's order). */
  workspaces: CreateWorkspaceResult[]
  /** Id of the visible workspace, highlighted in the list. */
  activeId: string | null
  /** Activate the workspace with this id (App calls setActiveId). */
  onSelect: (id: string) => void
  /** Open the create-workspace dialog (same as ⌘N). */
  onNew: () => void
}

export function WorkspaceRail({ workspaces, activeId, onSelect, onNew }: WorkspaceRailProps) {
  return (
    <div className="wsrail" data-testid="workspace-rail">
      <div className="wsrail-head">워크스페이스</div>
      {workspaces.map((w, i) => {
        const { id, name, backend } = w.workspace
        const isActive = id === activeId
        return (
          <button
            key={id}
            type="button"
            className={isActive ? 'wsitem active' : 'wsitem'}
            data-testid={`workspace-rail-item-${i}`}
            data-active={isActive ? 'true' : undefined}
            aria-current={isActive ? 'true' : undefined}
            onClick={() => onSelect(id)}
          >
            <span className={`wsdot ${backend.kind === 'container' ? 'cont' : 'host'}`} />
            <span className="wsname">{name}</span>
            {i < MAX_SHORTCUT ? <span className="wskey">⌘{i + 1}</span> : null}
          </button>
        )
      })}
      <div className="wsrail-spacer" />
      <button type="button" className="wsnew" data-testid="workspace-rail-new" onClick={onNew}>
        ＋ 새 워크스페이스
      </button>
    </div>
  )
}
