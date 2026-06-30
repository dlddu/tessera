import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CreateWorkspaceResult } from '@shared/ipc'
import type { BackendKind } from '@shared/types'
import { WorkspaceRail } from '@renderer/components/WorkspaceRail'

/**
 * Contract checks for the C-workspace-rail (AC1.7). The rail is pure (props in,
 * markup out), so we render it with react-dom/server and assert the structure
 * the M-J1-S8 e2e drives by: testid'd rows in workspace order, ⌘N position
 * hints, an active marker, a backend dot, and the create affordance.
 */

/** A minimal workspace skeleton; the rail never reads `.layout`. */
function ws(id: string, name: string, kind: BackendKind = 'host'): CreateWorkspaceResult {
  const backend: CreateWorkspaceResult['workspace']['backend'] =
    kind === 'host'
      ? { kind: 'host', cwd: '/x' }
      : { kind: 'container', image: 'node:20', cwd: '/x', mounts: [] }
  return {
    workspace: { id, name, backend },
    layout: {} as CreateWorkspaceResult['layout']
  }
}

function render(props: Parameters<typeof WorkspaceRail>[0]): string {
  return renderToStaticMarkup(createElement(WorkspaceRail, props))
}

const noop = () => {}

describe('WorkspaceRail', () => {
  it('lists workspaces in order with ⌘N hints and marks exactly the active one', () => {
    const html = render({
      workspaces: [ws('ws-b', 'web-svc'), ws('ws-a', 'api-svc')],
      activeId: 'ws-a',
      onSelect: noop,
      onNew: noop,
      onClose: noop
    })

    // Rail container + a testid'd row per workspace, indexed in list order.
    expect(html).toContain('data-testid="workspace-rail"')
    expect(html).toContain('data-testid="workspace-rail-item-0"')
    expect(html).toContain('data-testid="workspace-rail-item-1"')

    // Names paired with their position shortcut (row 0 → ⌘1, row 1 → ⌘2).
    expect(html).toContain('web-svc')
    expect(html).toContain('api-svc')
    expect(html).toContain('⌘1')
    expect(html).toContain('⌘2')

    // Exactly one active row (api-svc), one inactive — marked by class + data-active.
    expect(html.match(/class="wsitem active"/g) ?? []).toHaveLength(1)
    expect(html.match(/class="wsitem"/g) ?? []).toHaveLength(1)
    expect(html.match(/data-active="true"/g) ?? []).toHaveLength(1)

    // A close (×) affordance per row, indexed alongside the rows.
    expect(html).toContain('data-testid="workspace-rail-close-0"')
    expect(html).toContain('data-testid="workspace-rail-close-1"')
    expect(html).toContain('aria-label="web-svc 워크스페이스 닫기"')

    // The create affordance (rail "new" button → opens the dialog).
    expect(html).toContain('data-testid="workspace-rail-new"')
    expect(html).toContain('새 워크스페이스')
  })

  it('renders a backend dot per workspace (host vs container)', () => {
    const html = render({
      workspaces: [ws('h', 'hostly', 'host'), ws('c', 'containy', 'container')],
      activeId: 'h',
      onSelect: noop,
      onNew: noop,
      onClose: noop
    })
    expect(html).toContain('wsdot host')
    expect(html).toContain('wsdot cont')
  })

  it('shows no number hint past the ninth workspace (⌘1–⌘9 only)', () => {
    const workspaces = Array.from({ length: 10 }, (_, i) => ws(`ws-${i}`, `w${i}`))
    const html = render({
      workspaces,
      activeId: 'ws-0',
      onSelect: noop,
      onNew: noop,
      onClose: noop
    })

    expect(html).toContain('⌘9') // ninth row (index 8) still hinted
    expect(html).not.toContain('⌘10') // tenth row is click-only
    expect(html).toContain('data-testid="workspace-rail-item-9"') // but still listed
  })
})
