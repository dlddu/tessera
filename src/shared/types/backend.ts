/**
 * Backend & workspace domain types (PRD-2).
 *
 * A workspace is bound to one backend. The backend kind is host or container;
 * a container workspace may additionally open a host-only "area" (escape hatch).
 * These types are serializable — the live `Backend` runtime interface lives in
 * the main process (`src/main/backend/Backend.ts`).
 */

/** Which environment a workspace/area runs in. AC2.1. */
export type BackendKind = 'host' | 'container'

/** A read-only or read-write host→container bind mount. */
export interface ContainerMount {
  source: string
  target: string
  readOnly: boolean
}

/** Host backend: processes run directly on the macOS host. AC2.2. */
export interface HostBackendConfig {
  kind: 'host'
  /** Working directory on the host. */
  cwd: string
}

/** Container backend: processes run inside a container runtime. AC2.3. */
export interface ContainerBackendConfig {
  kind: 'container'
  /** Container image reference (e.g. `node:22`). */
  image: string
  /** Working directory inside the container. */
  cwd: string
  /** Host→container mounts. */
  mounts: ContainerMount[]
}

export type BackendConfig = HostBackendConfig | ContainerBackendConfig

/** Lifecycle of a backend instance. AC2.6. */
export type BackendStatus = 'starting' | 'running' | 'stopped' | 'error'

export interface BackendLifecycleState {
  status: BackendStatus
  /** Measured terminal input→output latency in ms, when known. AC2.6. */
  latencyMs?: number
  message?: string
}

/** A workspace = the unit that owns a window and a backend. AC2.1, #6. */
export interface Workspace {
  id: string
  name: string
  backend: BackendConfig
}
