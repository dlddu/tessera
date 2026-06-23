/**
 * Recursively renders a {@link LayoutSnapshot} into the design-system grout
 * structure (`.surface > .col > .row > .pane`, per the M-J1 mockups).
 *
 * - a vertical split → side-by-side `.col` strips (P-split-v, AC1.2)
 * - a horizontal split → stacked `.row` bands
 * - a pane leaf → a {@link Pane}, sized by its parent split's ratios
 *
 * The single-pane root collapses to one `.col > .row > .pane`, matching the
 * M-J1-S2 surface so the live terminal renders exactly as before.
 */
import type { CSSProperties, ReactNode } from 'react'
import type { LayoutNode, LayoutSnapshot } from '@shared/types'
import { Pane } from '@renderer/components'
import type { LayoutActions } from './useLayout'

interface LayoutViewProps {
  snapshot: LayoutSnapshot
  workspaceId: string
  workspaceName: string
  actions: LayoutActions
}

interface RenderContext {
  focusedPaneId: string | null
  workspaceId: string
  workspaceName: string
  actions: LayoutActions
}

function flexStyle(size: number | undefined): CSSProperties {
  return { flex: `${size ?? 1} 1 0` }
}

function renderPane(pane: Extract<LayoutNode, { type: 'pane' }>, ctx: RenderContext): ReactNode {
  return (
    <Pane
      node={pane}
      focused={ctx.focusedPaneId === pane.id}
      workspaceId={ctx.workspaceId}
      workspaceName={ctx.workspaceName}
      actions={ctx.actions}
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
    // reconcile as one element — splitting keeps the live surface (PTY) alive.
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

export function LayoutView({ snapshot, workspaceId, workspaceName, actions }: LayoutViewProps) {
  const ctx: RenderContext = {
    focusedPaneId: snapshot.focusedPaneId,
    workspaceId,
    workspaceName,
    actions
  }
  return <>{renderNode(snapshot.root, ctx)}</>
}
