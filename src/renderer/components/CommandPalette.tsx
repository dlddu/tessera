/**
 * C-palette — the ⌘K command palette (J2-S5, AC2.5). A centered overlay
 * (P-overlay) that searches the shared command registry and runs the chosen
 * command, giving every shortcut a discoverable, mouse-reachable twin. Because
 * it draws from the same {@link COMMANDS} the keymap dispatches, the palette and
 * the keys can never drift, and because none of those commands branch on the
 * backend, the palette behaves identically in a host and a container workspace —
 * the crux of "same UI/操作 either way".
 *
 * Presentational + controlled, mirroring {@link SurfacePicker}: it renders the
 * search box (`.psearch`) and the filtered result list (`.pres` of `.pitem`),
 * and reports the choice via `onRun` (or `onCancel` on Esc / backdrop click).
 * The owning view (WorkspaceView) holds the open state and supplies the
 * {@link CommandContext} each run executes against. Keyboard: ↑/↓ move the
 * selection, Enter runs it, Esc cancels; typing filters. Styling reuses the
 * design-system `.palette` tokens + the shared `.scrim` backdrop — no new CSS.
 *
 * Keycaps are rendered from each command's registry `keycap`, so a palette row
 * always shows the *actual* binding (⌥⌘→, ⇧⌘] …), not a hand-typed guess.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { filterCommands, type Command } from '@renderer/commands'

interface CommandPaletteProps {
  /** The commands to search (layout + workspace superset). */
  commands: readonly Command[]
  /** Run the chosen command (the owner supplies the context + closes the palette). */
  onRun: (command: Command) => void
  /** Dismiss without running (Esc / backdrop). */
  onCancel: () => void
}

/** Transparent search input — the `.psearch` row styles the frame around it. */
const INPUT: CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  fontSize: '14px'
}

export function CommandPalette({ commands, onRun, onCancel }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => filterCommands(commands, query), [commands, query])

  // Pull focus to the search box so typing filters immediately (like the picker).
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Keep the selection in range as the filtered set shrinks under the query.
  useEffect(() => {
    setSelected((s) => (filtered.length === 0 ? 0 : Math.min(s, filtered.length - 1)))
  }, [filtered.length])

  // Keyboard nav lives on the (focused) input: the WorkspaceView capture keymap
  // yields to the palette while it's open, so arrows/Enter/Esc land here.
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (filtered.length > 0 && e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => (s + 1) % filtered.length)
    } else if (filtered.length > 0 && e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => (s - 1 + filtered.length) % filtered.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const command = filtered[selected]
      if (command) onRun(command)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    }
  }

  return (
    <div
      className="scrim"
      data-testid="command-palette"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="palette" role="dialog" aria-label="커맨드 팔레트">
        <div className="psearch">
          <span className="route">⌘K</span>
          <input
            ref={inputRef}
            style={INPUT}
            data-testid="palette-input"
            value={query}
            placeholder="커맨드 검색…"
            aria-label="커맨드 검색"
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(0)
            }}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="pres" role="listbox" aria-label="커맨드">
          {filtered.map((command, i) => (
            <div
              key={command.id}
              role="option"
              aria-selected={i === selected}
              data-testid="palette-item"
              data-command-id={command.id}
              className={i === selected ? 'pitem sel' : 'pitem'}
              onMouseEnter={() => setSelected(i)}
              // mousedown (not click) + preventDefault keeps focus on the input
              // and runs before any blur, so a click never dead-ends.
              onMouseDown={(e) => {
                e.preventDefault()
                onRun(command)
              }}
            >
              <span className="pdot" style={{ background: `var(${command.identityVar})` }} />
              {command.label}
              <span className="pk">
                <span className="kc">{command.keycap.mods}</span>
                {command.keycap.keys.map((key) => (
                  <span className="kc" key={key}>
                    {key}
                  </span>
                ))}
              </span>
            </div>
          ))}
          {filtered.length === 0 ? (
            <div className="pitem" data-testid="palette-empty">
              <span className="pdot" />
              일치하는 커맨드가 없습니다
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
