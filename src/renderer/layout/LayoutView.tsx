/**
 * Recursively renders a {@link LayoutSnapshot} into the design-system grout
 * structure (`.surface > .col > .row > .pane`, per the M-J1 mockups).
 *
 * - a vertical split → side-by-side `.col` strips (P-split-v, AC1.2)
 * - a horizontal split → stacked `.row` bands
 * - a pane leaf → a {@link Pane}, sized by its parent split's ratios
 *
 * The single-pane root collapses to one `.col > .row > .pane`, matching the
 * M-J1-S2 surface so the live terminal renders exactly as before. Surfaces
 * themselves are mounted by the keep-alive {@link SurfaceHost}, not here; panes
 * only expose their body element (via `paneBodies`) for it to portal into.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { Area, BackendKind, LayoutNode, LayoutSnapshot } from '@shared/types'
import { Pane } from '@renderer/components'
import type { LayoutActions } from './useLayout'
import type { PaneBodyRegistry } from './paneBodies'
import type { TabDragController, TabDragState } from './useTabDrag'

interface LayoutViewProps {
  snapshot: LayoutSnapshot
  workspaceName: string
  actions: LayoutActions
  paneBodies: PaneBodyRegistry
  drag: TabDragState | null
  onTabPointerDown: TabDragController['onTabPointerDown']
  /** Open the surface picker to add a tab to a pane ("+"). M-J1-S4. */
  onRequestAddTab: (paneId: string) => void
  /** Close the host-only area from its band × affordance (AC2.7). */
  onCloseHostArea?: () => void
}

interface RenderContext {
  focusedPaneId: string | null
  zoomedPaneId: string | null
  workspaceName: string
  actions: LayoutActions
  paneBodies: PaneBodyRegistry
  drag: TabDragState | null
  onTabPointerDown: TabDragController['onTabPointerDown']
  onRequestAddTab: (paneId: string) => void
  /** The workspace's areas — used to badge each pane by its backend (AC2.8). */
  areas: Area[]
  /**
   * Whether to show per-pane backend badges. On only while a host area is open,
   * so single-area workspaces stay unbadged (the badge signals the boundary).
   */
  showAreaBadges: boolean
}

function flexStyle(size: number | undefined): CSSProperties {
  return { flex: `${size ?? 1} 1 0` }
}

/** The backend kind a pane runs on, resolved via its area (AC2.4). */
function paneBackendKind(
  pane: Extract<LayoutNode, { type: 'pane' }>,
  areas: Area[]
): BackendKind | null {
  const areaId = pane.tabs[0]?.areaId
  return areas.find((a) => a.id === areaId)?.backend ?? null
}

function renderPane(pane: Extract<LayoutNode, { type: 'pane' }>, ctx: RenderContext): ReactNode {
  // Zoom (AC1.6): the zoomed pane fills the surface; every other pane is hidden
  // (but stays mounted, so its surface keeps its live PTY/buffer — keep-alive).
  const zoomed = ctx.zoomedPaneId === pane.id
  const zoomHidden = ctx.zoomedPaneId !== null && !zoomed
  return (
    <Pane
      node={pane}
      focused={ctx.focusedPaneId === pane.id}
      zoomed={zoomed}
      zoomHidden={zoomHidden}
      workspaceName={ctx.workspaceName}
      actions={ctx.actions}
      paneBodies={ctx.paneBodies}
      drag={ctx.drag}
      onTabPointerDown={ctx.onTabPointerDown}
      onRequestAddTab={ctx.onRequestAddTab}
      areaBadge={ctx.showAreaBadges ? paneBackendKind(pane, ctx.areas) : null}
    />
  )
}

/** Contents of a `.row` band: a pane sits directly; a split recurses. */
function renderRowBody(node: LayoutNode, ctx: RenderContext): ReactNode {
  return node.type === 'pane' ? renderPane(node, ctx) : renderNode(node, ctx)
}

/** Contents of a `.col` strip: one row band (pane) or stacked rows (h-split). */
function renderColumnBody(node: LayoutNode, ctx: RenderContext): ReactNode {
  if (node.type === 'pane') {
    return <div className="row">{renderPane(node, ctx)}</div>
  }
  if (node.direction === 'horizontal') {
    return node.children.map((child, i) => (
      <div className="row" key={child.id} style={flexStyle(node.sizes[i])}>
        {renderRowBody(child, ctx)}
      </div>
    ))
  }
  // Nested vertical split inside a column: lay its columns out in a row.
  return <div className="row">{renderNode(node, ctx)}</div>
}

function renderNode(node: LayoutNode, ctx: RenderContext): ReactNode {
  if (node.type === 'pane') {
    // Key by pane id so a single pane and that same pane as a split child
    // reconcile as one element — keeping its body element (a portal target)
    // stable across splits.
    return (
      <div className="col" key={node.id}>
        <div className="row">{renderPane(node, ctx)}</div>
      </div>
    )
  }
  if (node.direction === 'vertical') {
    return node.children.map((child, i) => (
      <div className="col" key={child.id} style={flexStyle(node.sizes[i])}>
        {renderColumnBody(child, ctx)}
      </div>
    ))
  }
  // Horizontal split at the top of a subtree needs its own column context.
  return (
    <div className="col">
      {node.children.map((child, i) => (
        <div className="row" key={child.id} style={flexStyle(node.sizes[i])}>
          {renderRowBody(child, ctx)}
        </div>
      ))}
    </div>
  )
}

/** The first area id encountered in a subtree (its panes are area-uniform). */
function firstAreaId(node: LayoutNode): string | undefined {
  if (node.type === 'pane') return node.tabs[0]?.areaId
  for (const child of node.children) {
    const id = firstAreaId(child)
    if (id !== undefined) return id
  }
  return undefined
}

/** Copy for each area band (label glyph + name, backend chip, caption). */
const AREA_BAND: Record<
  Area['kind'],
  { label: string; badge: string; badgeClass: string; desc: string }
> = {
  default: {
    label: '▦ 컨테이너 기본 영역',
    badge: 'container',
    badgeClass: 'cont',
    desc: 'workspace 기본 backend · 격리'
  },
  host: {
    label: '⌂ HOST 전용 영역',
    badge: 'host',
    badgeClass: 'host',
    desc: '이 영역의 도구만 호스트에서 실행'
  }
}

/**
 * One area region: a header band (label + backend badge + caption, and a × to
 * close on the host area) over its pane subtree. The band makes the host/
 * container boundary explicit (AC2.8) so it's obvious which panes run where.
 */
function AreaBand({
  area,
  size,
  onClose,
  children
}: {
  area: Area
  size: number | undefined
  onClose?: (() => void) | undefined
  children: ReactNode
}): ReactNode {
  const copy = AREA_BAND[area.kind]
  return (
    <div
      className={`area area-${copy.badgeClass}`}
      style={flexStyle(size)}
      data-testid="area"
      data-area-kind={area.kind}
    >
      <div className="area-band">
        <span className="area-label">{copy.label}</span>
        <span className={`badge ${copy.badgeClass}`}>
          <span className="led" />
          {copy.badge}
        </span>
        <span className="area-desc muted">{copy.desc}</span>
        {area.kind === 'host' && onClose ? (
          <span
            className="area-close"
            data-testid="host-area-close"
            role="button"
            aria-label="host 영역 닫기"
            onMouseDown={onClose}
          >
            ×
          </span>
        ) : null}
      </div>
      <div className="area-body">{children}</div>
    </div>
  )
}

export function LayoutView({
  snapshot,
  workspaceName,
  actions,
  paneBodies,
  drag,
  onTabPointerDown,
  onRequestAddTab,
  onCloseHostArea
}: LayoutViewProps) {
  const hasHostArea = snapshot.areas.some((a) => a.kind === 'host')
  const ctx: RenderContext = {
    focusedPaneId: snapshot.focusedPaneId,
    zoomedPaneId: snapshot.zoomedPaneId,
    workspaceName,
    actions,
    paneBodies,
    drag,
    onTabPointerDown,
    onRequestAddTab,
    areas: snapshot.areas,
    showAreaBadges: hasHostArea
  }

  // Two-area layout (a host area is open): the root is the area-boundary split,
  // one child per area. Wrap each child's subtree in its area band so the
  // container/host boundary is explicit (AC2.7/AC2.8). Otherwise render the
  // single-area tree exactly as before.
  if (hasHostArea && snapshot.root.type === 'split' && snapshot.root.children.length === 2) {
    const split = snapshot.root
    return (
      <>
        {split.children.map((child, i) => {
          const area = snapshot.areas.find((a) => a.id === firstAreaId(child)) ?? snapshot.areas[0]!
          return (
            <AreaBand
              key={area.id}
              area={area}
              size={split.sizes[i]}
              onClose={area.kind === 'host' ? onCloseHostArea : undefined}
            >
              {renderNode(child, ctx)}
            </AreaBand>
          )
        })}
      </>
    )
  }

  return <>{renderNode(snapshot.root, ctx)}</>
}
