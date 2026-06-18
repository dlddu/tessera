/**
 * IPC payload contracts + the typed API surface exposed to the renderer as
 * `window.tessera` (via the preload `contextBridge`). Every method here maps to
 * a channel in `channels.ts` and, in the skeleton, resolves to a main-process
 * handler that throws `NotImplementedError`.
 */
import type {
  BackendKind,
  BackendLifecycleState,
  LayoutSnapshot,
  SurfaceKind,
  WorkspaceStateSnapshot
} from '../types'

/* -------------------------------------------------------------- backend ops */

export interface SpawnPtyRequest {
  workspaceId: string
  areaId: string
  cols: number
  rows: number
  cwd?: string
}
export interface SpawnPtyResult {
  ptyId: string
}

export interface ReadFileRequest {
  workspaceId: string
  areaId: string
  path: string
}
export interface ReadFileResult {
  /** base64-encoded bytes (IPC-safe). */
  dataBase64: string
}

export interface WriteFileRequest {
  workspaceId: string
  areaId: string
  path: string
  dataBase64: string
}

export interface RunProcessRequest {
  workspaceId: string
  areaId: string
  command: string
  args: string[]
  cwd?: string
}
export interface RunProcessResult {
  code: number | null
  stdout: string
  stderr: string
}

export interface GetEnvRequest {
  workspaceId: string
  areaId: string
}

export interface BackendLifecycleRequest {
  workspaceId: string
}

/* ---------------------------------------------------------- surface lifecycle */

export interface CreateSurfaceRequest {
  workspaceId: string
  areaId: string
  surface: SurfaceKind
}
export interface CreateSurfaceResult {
  surfaceId: string
}

export interface DisposeSurfaceRequest {
  surfaceId: string
}

/* --------------------------------------------------------------- persistence */

export interface LoadStateRequest {
  workspaceId: string
}

/* ------------------------------------------------------------------ routing */

export interface OpenUrlOnHostRequest {
  /** Which container workspace requested the open (for isolation, AC3.5). */
  workspaceId: string
  url: string
}

export interface ForwardCallbackRequest {
  workspaceId: string
  /** localhost callback port inside the container to forward to. AC3.3. */
  port: number
}
export interface ForwardCallbackResult {
  /** Host-side port mapped to the container listener. */
  hostPort: number
}

/* ------------------------------------------------------------- the API shape */

export interface BackendApi {
  spawnPty(req: SpawnPtyRequest): Promise<SpawnPtyResult>
  readFile(req: ReadFileRequest): Promise<ReadFileResult>
  writeFile(req: WriteFileRequest): Promise<void>
  runProcess(req: RunProcessRequest): Promise<RunProcessResult>
  getEnv(req: GetEnvRequest): Promise<Record<string, string>>
  lifecycle(req: BackendLifecycleRequest): Promise<BackendLifecycleState>
}

export interface SurfaceApi {
  create(req: CreateSurfaceRequest): Promise<CreateSurfaceResult>
  dispose(req: DisposeSurfaceRequest): Promise<void>
}

export interface PersistenceApi {
  save(snapshot: WorkspaceStateSnapshot): Promise<void>
  load(req: LoadStateRequest): Promise<WorkspaceStateSnapshot | null>
}

export interface RoutingApi {
  openUrlOnHost(req: OpenUrlOnHostRequest): Promise<void>
  forwardCallback(req: ForwardCallbackRequest): Promise<ForwardCallbackResult>
}

/** The full bridge exposed at `window.tessera`. */
export interface TesseraApi {
  backend: BackendApi
  surface: SurfaceApi
  persistence: PersistenceApi
  routing: RoutingApi
  /** Static build/runtime info (no behavior wired yet). */
  meta: {
    backendKinds: readonly BackendKind[]
    layoutVersion: LayoutSnapshot['version']
  }
}
