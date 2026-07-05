/**
 * Central key-hint overlay (P-overlay, M-J1-S5, AC1.4). A bottom-center capsule
 * of keycaps listing the focus / tab-switch / tab-move shortcuts. Summoned on
 * demand with `⌘⌥/` (press again to dismiss) rather than sitting over the layout
 * permanently, so it stays out of the way until wanted — the caller renders it
 * only while toggled on. Purely decorative: it is `pointer-events:none` (see
 * `.keymap-overlay`) so it never intercepts clicks. The status bar carries the
 * same hints in condensed form, including the `⌘⌥/` toggle itself.
 *
 * Keycaps are read from the shared command registry (J2-S5), so they always
 * reflect the actual bindings — the same source the keymap dispatches and the
 * ⌘K palette lists. Each row pairs a registry command's keycap with a short
 * overlay label and an optional contextual note.
 */
import { commandById, type CommandId } from '@renderer/commands'
import { Keycap } from './Keycap'

/** Overlay rows: a command's keycap under a short label, with an optional note. */
const ROWS: ReadonlyArray<{ id: CommandId; label: string; note?: string }> = [
  { id: 'focus', label: '포커스' },
  { id: 'tab-switch', label: '탭 전환' },
  { id: 'move', label: '탭 이동', note: '또는 드래그' },
  { id: 'zoom', label: '전체화면', note: '복귀 Esc' },
  { id: 'close-workspace', label: '워크스페이스 닫기' },
  { id: 'overlay', label: '단축키 닫기' }
]

export function KeymapOverlay() {
  return (
    <div className="keymap-overlay" data-testid="keymap-overlay" aria-hidden="true">
      {ROWS.map(({ id, label, note }) => (
        <span className="row-gap" key={id}>
          <span className="muted">{label}</span> <Keycap keycap={commandById(id).keycap} />
          {note ? <span className="faint">{note}</span> : null}
        </span>
      ))}
    </div>
  )
}
