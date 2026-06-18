/**
 * Pure workspace factory + input validation (M-J1-S1).
 *
 * Shared by the main-process `workspace.create` handler and unit tests — no
 * Electron, IPC, or filesystem access here. The handler is responsible for the
 * side effects (cwd existence check, persistence); this module only turns
 * validated input into the serializable workspace + its initial single-pane
 * layout skeleton.
 */
import { randomUUID } from 'node:crypto'
import type { BackendKind, Workspace } from '../types/backend'
import type { LayoutSnapshot } from '../types/layout'
import type { WorkspaceStateSnapshot } from '../types/persistence'

/** Layout version emitted by the factory (mirrors `meta.layoutVersion`). */
const LAYOUT_VERSION = 1

export interface BuildWorkspaceInput {
  name: string
  cwd: string
  backendKind: BackendKind
}

export interface BuildWorkspaceResult {
  workspace: Workspace
  layout: LayoutSnapshot
  snapshot: WorkspaceStateSnapshot
}

/**
 * Validate raw create-workspace input. Returns an error message for the first
 * problem found, or `null` when the input is usable.
 *
 * - name is always required.
 * - host workspaces require a cwd (the directory processes run in). AC2.2.
 * - only host creation is supported here; container is M-J2-S1. AC2.1.
 */
export function validateWorkspaceInput(input: BuildWorkspaceInput): string | null {
  if (input.name.trim().length === 0) {
    return '이름을 입력하세요.'
  }
  if (input.backendKind !== 'host') {
    return '컨테이너 워크스페이스는 아직 생성할 수 없습니다.'
  }
  if (input.cwd.trim().length === 0) {
    return '작업 디렉토리를 선택하세요.'
  }
  return null
}

/**
 * Build the serializable workspace, its initial layout, and the persistable
 * snapshot from validated input. The initial layout is a single pane
 * (`P-single`) holding one terminal tab in the workspace's default area.
 *
 * Throws if the input fails {@link validateWorkspaceInput}; callers should
 * validate first and surface the message.
 */
export function buildWorkspace(input: BuildWorkspaceInput): BuildWorkspaceResult {
  const error = validateWorkspaceInput(input)
  if (error) {
    throw new Error(error)
  }

  const name = input.name.trim()
  const cwd = input.cwd.trim()
  const id = `ws-${randomUUID()}`
  const areaId = 'area-default'
  const tabId = 'P-single-t0'

  const workspace: Workspace = {
    id,
    name,
    backend: { kind: 'host', cwd }
  }

  const layout: LayoutSnapshot = {
    version: LAYOUT_VERSION,
    workspaceId: id,
    focusedPaneId: 'P-single',
    areas: [{ id: areaId, kind: 'default', backend: input.backendKind }],
    root: {
      type: 'pane',
      id: 'P-single',
      activeTabId: tabId,
      tabs: [{ id: tabId, title: name, surface: 'terminal', areaId }]
    }
  }

  const snapshot: WorkspaceStateSnapshot = {
    version: LAYOUT_VERSION,
    workspaceId: id,
    layout,
    surfaces: [],
    savedAt: Date.now()
  }

  return { workspace, layout, snapshot }
}
