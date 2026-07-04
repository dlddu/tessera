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

/**
 * How a container machine mounts the host home directory (AC2.1). The Apple
 * `container` machine model has no arbitrary bind mounts — the home directory is
 * the one host→machine bridge, exposed read-write, read-only, or not at all.
 */
export type ContainerHomeMount = 'rw' | 'ro' | 'none'

/** Host backend: processes run directly on the macOS host. AC2.2. */
export interface HostBackendConfig {
  kind: 'host'
  /** Working directory on the host. */
  cwd: string
}

/**
 * Container backend: processes run inside an Apple `container` machine (AC2.1,
 * AC2.3). The machine is named after the workspace id. The model is the machine
 * surface — image + home-mount mode + resource caps — not arbitrary bind mounts
 * or an explicit workdir (those aren't part of the machine model).
 */
export interface ContainerBackendConfig {
  kind: 'container'
  /** Container/machine image reference (e.g. `node:22`). */
  image: string
  /** How the host home directory is mounted into the machine. */
  homeMount: ContainerHomeMount
  /** Optional vCPU cap for the machine. */
  cpus?: number
  /** Optional memory cap for the machine (e.g. `4G`). */
  memory?: string
}

export type BackendConfig = HostBackendConfig | ContainerBackendConfig

/**
 * One entry in a backend directory listing (M-J2-S3, AC2.3). Serializable so it
 * can cross IPC to the renderer's container file browser.
 */
export interface DirEntry {
  name: string
  /** True for directories — the browser descends into these instead of opening. */
  isDir: boolean
}

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
