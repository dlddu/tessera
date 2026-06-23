/**
 * Pane-body registry for the keep-alive {@link SurfaceHost} (M-J1-S5).
 *
 * Each {@link Pane} registers its (empty) body element here by id via a ref
 * callback; `SurfaceHost` reads it to know where to re-parent each tab's live
 * surface. Plain mutable map — registration happens in the commit's ref phase,
 * which precedes the host's layout effect, so the host always sees current
 * bodies (panes render before the host as siblings).
 */
export interface PaneBodyRegistry {
  /** Register (`el`) or unregister (`null`) a pane's body element. */
  register(paneId: string, el: HTMLElement | null): void
  /** The body element for `paneId`, or `null` if none is mounted. */
  get(paneId: string): HTMLElement | null
}

export function createPaneBodyRegistry(): PaneBodyRegistry {
  const bodies = new Map<string, HTMLElement>()
  return {
    register(paneId, el) {
      if (el) bodies.set(paneId, el)
      else bodies.delete(paneId)
    },
    get(paneId) {
      return bodies.get(paneId) ?? null
    }
  }
}
