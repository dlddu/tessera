/**
 * Shared surface picker (M-J1-S4): a small popover that chooses which of the
 * four component surfaces to open. The shell routes every creation path through
 * it — adding a tab ("+") or splitting a pane (⌘D / ⌘⇧D) — so surface choice is
 * one consistent step everywhere (AC1.1).
 *
 * Presentational + controlled: it lists {@link SURFACE_KINDS} in order, each
 * with its identity dot + label, and reports the choice via `onPick` (or
 * `onCancel` on Esc / backdrop click). The owning view holds the open state and
 * decides what the choice does (add vs split). Styling reuses the design tokens
 * + the shared `.scrim` backdrop — no new CSS.
 */
import { useEffect, useRef, type CSSProperties } from 'react'
import { SURFACE_KINDS, type SurfaceKind } from '@shared/types'
import { SURFACE_META } from '@renderer/surfaces'

interface SurfacePickerProps {
  /** Short heading shown above the options (e.g. the action being chosen for). */
  title: string
  onPick: (kind: SurfaceKind) => void
  onCancel: () => void
}

const CARD: CSSProperties = {
  width: 'min(280px, 86%)',
  background: 'var(--tile-raise)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--r-card)',
  boxShadow: 'var(--shadow-dialog)',
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px'
}

const HEAD: CSSProperties = {
  fontSize: '11px',
  color: 'var(--faint)',
  fontFamily: 'var(--font-mono)',
  padding: '4px 8px 6px'
}

const OPTION: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 'var(--r-tile)',
  padding: '8px 9px',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  fontSize: '12.5px',
  cursor: 'pointer'
}

export function SurfacePicker({ title, onPick, onCancel }: SurfacePickerProps) {
  const firstRef = useRef<HTMLButtonElement>(null)

  // Pull focus off the underlying surface so the picker drives the keyboard.
  useEffect(() => {
    firstRef.current?.focus()
  }, [])

  // Esc cancels. Captured so it beats any focused surface's own Esc handling.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onCancel])

  return (
    <div
      className="scrim"
      data-testid="surface-picker"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div role="menu" aria-label={title} style={CARD}>
        <div style={HEAD}>{title}</div>
        {SURFACE_KINDS.map((kind, i) => {
          const meta = SURFACE_META[kind]
          return (
            <button
              key={kind}
              type="button"
              role="menuitem"
              ref={i === 0 ? firstRef : undefined}
              data-testid={`surface-pick-${kind}`}
              onClick={() => onPick(kind)}
              style={OPTION}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  flex: '0 0 8px',
                  background: `var(${meta.identityVar})`
                }}
              />
              {meta.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
