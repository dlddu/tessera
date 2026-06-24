/**
 * Pointer-based tab drag (M-J1-S5, AC1.3).
 *
 * Owns the cross-pane drag gesture so the visual feedback can live anywhere:
 * the dragged tab (`.tab.drag`), the hovered pane's `.drop-zone`, and the
 * "moving tab" toast all read this one state. A press on a tab arms a drag;
 * once the pointer passes a small threshold it becomes active and we hit-test
 * the pane under the cursor (`data-pane-id`) on each move. Release drops the
 * tab into that pane via `actions.moveTab` — reordering when released over the
 * target's tab bar, appending otherwise. HTML5 DnD is avoided on purpose:
 * pointer events are far easier to drive deterministically in Playwright.
 */
import { useCallback, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { LayoutActions } from './useLayout'

/** Live drag state, or `null` when nothing is being dragged. */
export interface TabDragState {
  tabId: string
  title: string
  /** Pane currently under the cursor (the drop target), or `null`. */
  overPaneId: string | null
}

interface DragArm {
  tabId: string
  title: string
  startX: number
  startY: number
  active: boolean
}

/** Pixels the pointer must travel before a press becomes a drag. */
const THRESHOLD = 4

export interface TabDragController {
  drag: TabDragState | null
  onTabPointerDown: (tabId: string, title: string, e: ReactPointerEvent) => void
}

/** The `.pane` element under a viewport point, if any. */
function paneAt(x: number, y: number): HTMLElement | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null
  return el?.closest<HTMLElement>('[data-pane-id]') ?? null
}

/**
 * Insertion index for a drop within `paneEl`: the slot between tabs when the
 * cursor is over the tab bar, or `undefined` (append) when it's over the body.
 */
function dropIndex(paneEl: HTMLElement, x: number, y: number): number | undefined {
  const tabbar = paneEl.querySelector<HTMLElement>('.tabbar')
  if (!tabbar) return undefined
  const bar = tabbar.getBoundingClientRect()
  if (y < bar.top || y > bar.bottom) return undefined
  const tabs = Array.from(tabbar.querySelectorAll<HTMLElement>('[data-testid="pane-tab"]'))
  let index = 0
  for (const tab of tabs) {
    const r = tab.getBoundingClientRect()
    if (x > r.left + r.width / 2) index++
    else break
  }
  return index
}

export function useTabDrag(actions: LayoutActions): TabDragController {
  const [drag, setDrag] = useState<TabDragState | null>(null)
  const arm = useRef<DragArm | null>(null)

  const onMove = useCallback((e: PointerEvent) => {
    const s = arm.current
    if (!s) return
    if (!s.active) {
      if (
        Math.abs(e.clientX - s.startX) < THRESHOLD &&
        Math.abs(e.clientY - s.startY) < THRESHOLD
      ) {
        return
      }
      s.active = true
    }
    setDrag({
      tabId: s.tabId,
      title: s.title,
      overPaneId: paneAt(e.clientX, e.clientY)?.dataset.paneId ?? null
    })
  }, [])

  const onUp = useCallback(
    (e: PointerEvent) => {
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      const s = arm.current
      arm.current = null
      setDrag(null)
      if (!s || !s.active) return
      const paneEl = paneAt(e.clientX, e.clientY)
      const targetPaneId = paneEl?.dataset.paneId
      if (!paneEl || !targetPaneId) return
      actions.moveTab(s.tabId, targetPaneId, dropIndex(paneEl, e.clientX, e.clientY))
    },
    [actions, onMove]
  )

  const onTabPointerDown = useCallback(
    (tabId: string, title: string, e: ReactPointerEvent) => {
      if (e.button !== 0) return
      arm.current = { tabId, title, startX: e.clientX, startY: e.clientY, active: false }
      window.addEventListener('pointermove', onMove, true)
      window.addEventListener('pointerup', onUp, true)
    },
    [onMove, onUp]
  )

  return { drag, onTabPointerDown }
}
