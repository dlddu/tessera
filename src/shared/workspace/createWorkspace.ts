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
import type { BackendConfig, BackendKind, ContainerHomeMount, Workspace } from '../types/backend'
import type { LayoutSnapshot } from '../types/layout'
import { buildWorkspaceSnapshot } from '../types/persistence'
import type { WorkspaceStateSnapshot } from '../types/persistence'

/** Layout version emitted by the factory (mirrors `meta.layoutVersion`). */
const LAYOUT_VERSION = 1

/** Default home-mount mode when a container request omits it (no host mount). */
const DEFAULT_HOME_MOUNT: ContainerHomeMount = 'none'

export interface BuildWorkspaceInput {
  name: string
  backendKind: BackendKind
  /** Host backend working directory. Required for host (AC2.2). */
  cwd?: string
  /** Container/machine image reference. Required for container (AC2.1). */
  image?: string
  /** Home-directory mount mode for the container machine. Defaults to `rw`. */
  homeMount?: ContainerHomeMount
  /** Optional vCPU cap for the container machine. */
  cpus?: number
  /** Optional memory cap for the container machine (e.g. `4G`). */
  memory?: string
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
 * - container workspaces require an image (the machine boots from it). AC2.1.
 *   `cpus`, when given, must be a positive integer; `homeMount`/`memory` are
 *   free-form and defaulted downstream.
 */
export function validateWorkspaceInput(input: BuildWorkspaceInput): string | null {
  if (input.name.trim().length === 0) {
    return '이름을 입력하세요.'
  }
  if (input.backendKind === 'container') {
    if (!input.image || input.image.trim().length === 0) {
      return '컨테이너 이미지를 입력하세요.'
    }
    if (input.cpus !== undefined && (!Number.isInteger(input.cpus) || input.cpus <= 0)) {
      return 'CPU 수는 1 이상의 정수여야 합니다.'
    }
    return null
  }
  if (!input.cwd || input.cwd.trim().length === 0) {
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
  const id = `ws-${randomUUID()}`
  const areaId = 'area-default'
  const tabId = 'P-single-t0'

  const backend: BackendConfig =
    input.backendKind === 'container'
      ? {
          kind: 'container',
          image: input.image!.trim(),
          homeMount: input.homeMount ?? DEFAULT_HOME_MOUNT,
          ...(input.cpus !== undefined ? { cpus: input.cpus } : {}),
          ...(input.memory !== undefined && input.memory.trim().length > 0
            ? { memory: input.memory.trim() }
            : {})
        }
      : { kind: 'host', cwd: input.cwd!.trim() }

  const workspace: Workspace = { id, name, backend }

  const layout: LayoutSnapshot = {
    version: LAYOUT_VERSION,
    workspaceId: id,
    focusedPaneId: 'P-single',
    zoomedPaneId: null,
    areas: [{ id: areaId, kind: 'default', backend: input.backendKind }],
    root: {
      type: 'pane',
      id: 'P-single',
      activeTabId: tabId,
      tabs: [{ id: tabId, title: name, surface: 'terminal', areaId }]
    }
  }

  const snapshot: WorkspaceStateSnapshot = buildWorkspaceSnapshot(workspace, layout, Date.now())

  return { workspace, layout, snapshot }
}
