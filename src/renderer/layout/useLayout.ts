/**
 * React binding for {@link LayoutEngine}. Creates one engine per workspace
 * mount, subscribes the component tree to its snapshot via
 * `useSyncExternalStore`, and exposes a stable {@link LayoutActions} bundle for
 * the shell (and surfaces) to drive — without threading the engine itself
 * through props.
 *
 * The engine is created from the workspace's initial layout once; remount (a
 * `key` on the owning component) starts a fresh engine for a new workspace.
 */
import { useMemo, useState, useSyncExternalStore } from 'react'
import type { LayoutSnapshot, SurfaceKind } from '@shared/types'
import { LayoutEngine } from './LayoutEngine'
import type { FocusDirection } from './LayoutEngine'

/** The layout mutations the shell + surfaces invoke. */
export interface LayoutActions {
  splitVertical(paneId: string, surface: SurfaceKind): void
  splitHorizontal(paneId: string, surface: SurfaceKind): void
  addTab(paneId: string, surface: SurfaceKind): void
  activateTab(paneId: string, tabId: string): void
  closeTab(tabId: string): void
  moveTab(tabId: string, targetPaneId: string, index?: number): void
  focusPane(paneId: string): void
  focusDirection(dir: FocusDirection): void
  setTabPath(tabId: string, path: string): void
}

export interface UseLayout {
  snapshot: LayoutSnapshot
  engine: LayoutEngine
  actions: LayoutActions
}

export function useLayout(initial: LayoutSnapshot): UseLayout {
  const [engine] = useState(() => new LayoutEngine(initial))
  const snapshot = useSyncExternalStore(engine.subscribe, engine.getSnapshot)

  const actions = useMemo<LayoutActions>(
    () => ({
      splitVertical: (paneId, surface) => engine.splitVertical(paneId, surface),
      splitHorizontal: (paneId, surface) => engine.splitHorizontal(paneId, surface),
      addTab: (paneId, surface) => engine.addTab(paneId, surface),
      activateTab: (paneId, tabId) => engine.activateTab(paneId, tabId),
      closeTab: (tabId) => engine.closeTab(tabId),
      moveTab: (tabId, targetPaneId, index) => engine.moveTab(tabId, targetPaneId, index),
      focusPane: (paneId) => engine.focusPane(paneId),
      focusDirection: (dir) => engine.focusDirection(dir),
      setTabPath: (tabId, path) => engine.setTabPath(tabId, path)
    }),
    [engine]
  )

  return { snapshot, engine, actions }
}
