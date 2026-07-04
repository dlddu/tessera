/**
 * IPC payload contracts + the typed API surface exposed to the renderer as
 * `window.tessera` (via the preload `contextBridge`). Every method here maps to
 * a channel in `channels.ts` and, in the skeleton, resolves to a main-process
 * handler that throws `NotImplementedError`.
 */
import type {
  BackendKind,
  BackendLifecycleState,
  ContainerHomeMount,
  DirEntry,
  LayoutSnapshot,
  SurfaceKind,
  Workspace,
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

/** List a directory on the workspace's backend (editor file browser, M-J2-S3). */
export interface ListDirRequest {
  workspaceId: string
  areaId: string
  path: string
}
export interface ListDirResult {
  entries: DirEntry[]
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

/* ---------------------------------------------------------------- workspace */

export interface CreateWorkspaceRequest {
  name: string
  backendKind: BackendKind
  /** Working directory for the workspace's backend. Required for host (AC2.2). */
  cwd?: string
  /** Container/machine image reference. Required for container (AC2.1). */
  image?: string
  /** How the host home directory is mounted into the container machine. */
  homeMount?: ContainerHomeMount
  /** Optional vCPU cap for the container machine. */
  cpus?: number
  /** Optional memory cap for the container machine (e.g. `4G`). */
  memory?: string
}
export interface CreateWorkspaceResult {
  workspace: Workspace
  layout: LayoutSnapshot
}

export interface CloseWorkspaceRequest {
  /** The workspace to close: its on-disk snapshot is deleted and its backend dropped. */
  workspaceId: string
}

export interface PickDirectoryResult {
  /** Absolute path the user chose, or null if the picker was cancelled. */
  path: string | null
}

export interface PickFileResult {
  /** Absolute file path the user chose, or null if the picker was cancelled. */
  path: string | null
}

export interface PickSaveFileResult {
  /** Absolute path the user chose to save to, or null if cancelled. */
  path: string | null
}

export interface DefaultCwdResult {
  /**
   * A sensible directory to prefill the create dialog with: the cwd of the last
   * workspace created this session, falling back to the host home directory.
   */
  path: string
}

/* ---------------------------------------------------------- surface lifecycle */

export interface CreateSurfaceRequest {
  workspaceId: string
  areaId: string
  surface: SurfaceKind
  /**
   * Starting cwd for a terminal surface's PTY. Container terminals set this to a
   * sibling's OSC 7-tracked cwd so a new terminal opens where the last one was
   * (M-J2-S2); omitted → the backend's default (host workspace cwd / machine
   * login home).
   */
  cwd?: string
}
export interface CreateSurfaceResult {
  surfaceId: string
}

export interface DisposeSurfaceRequest {
  surfaceId: string
}

/** main → renderer: a chunk of PTY output for one surface. */
export interface PtyDataEvent {
  surfaceId: string
  chunk: string
}

/** main → renderer: the PTY backing one surface exited. */
export interface PtyExitEvent {
  surfaceId: string
  /** Process exit code, or null when terminated by a signal. */
  code: number | null
}

/** renderer → main: keyboard/paste input destined for a surface's PTY. */
export interface PtyInputRequest {
  surfaceId: string
  data: string
}

/** renderer → main: a surface's terminal was resized. */
export interface PtyResizeRequest {
  surfaceId: string
  cols: number
  rows: number
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

/* --------------------------------------------------------------- auto-update */

/** main → renderer: a newer version was found and is being downloaded. */
export interface UpdateAvailableEvent {
  version: string
}

/** main → renderer: download progress for the pending update. */
export interface UpdateProgressEvent {
  /** 0–100. */
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

/** main → renderer: an update finished downloading and is ready to install. */
export interface UpdateDownloadedEvent {
  version: string
}

/** main → renderer: the updater failed (network, signature, etc.). */
export interface UpdateErrorEvent {
  message: string
}

/* ------------------------------------------------------------- the API shape */

export interface BackendApi {
  spawnPty(req: SpawnPtyRequest): Promise<SpawnPtyResult>
  readFile(req: ReadFileRequest): Promise<ReadFileResult>
  writeFile(req: WriteFileRequest): Promise<void>
  /** List a directory on the workspace's backend (editor file browser, M-J2-S3). */
  listDir(req: ListDirRequest): Promise<ListDirResult>
  runProcess(req: RunProcessRequest): Promise<RunProcessResult>
  getEnv(req: GetEnvRequest): Promise<Record<string, string>>
  lifecycle(req: BackendLifecycleRequest): Promise<BackendLifecycleState>
}

export interface WorkspaceApi {
  create(req: CreateWorkspaceRequest): Promise<CreateWorkspaceResult>
  /** Close a workspace: permanently delete its snapshot and drop its backend (AC1.7). */
  close(req: CloseWorkspaceRequest): Promise<void>
  pickDirectory(): Promise<PickDirectoryResult>
  /** Native file picker for opening a host file in the editor (AC2.2). */
  pickFile(): Promise<PickFileResult>
  /** Native save dialog for writing a scratch buffer to a new host file. */
  pickSaveFile(): Promise<PickSaveFileResult>
  /** A sensible default working directory to prefill the create dialog. */
  defaultCwd(): Promise<DefaultCwdResult>
}

export interface SurfaceApi {
  create(req: CreateSurfaceRequest): Promise<CreateSurfaceResult>
  dispose(req: DisposeSurfaceRequest): Promise<void>
  /** Forward keyboard/paste input to a surface's PTY (fire-and-forget). */
  sendInput(req: PtyInputRequest): void
  /** Resize a surface's PTY to new dimensions (fire-and-forget). */
  resize(req: PtyResizeRequest): void
  /** Subscribe to PTY output (all surfaces). Returns an unsubscribe function. */
  onPtyData(listener: (event: PtyDataEvent) => void): () => void
  /** Subscribe to PTY exits (all surfaces). Returns an unsubscribe function. */
  onPtyExit(listener: (event: PtyExitEvent) => void): () => void
}

export interface PersistenceApi {
  save(snapshot: WorkspaceStateSnapshot): Promise<void>
  /** Synchronous last-moment save for app quit (renderer `beforeunload`). */
  saveSync(snapshot: WorkspaceStateSnapshot): void
  load(req: LoadStateRequest): Promise<WorkspaceStateSnapshot | null>
  /** Every persisted workspace snapshot, newest (max `savedAt`) first. */
  list(): Promise<WorkspaceStateSnapshot[]>
}

export interface RoutingApi {
  openUrlOnHost(req: OpenUrlOnHostRequest): Promise<void>
  forwardCallback(req: ForwardCallbackRequest): Promise<ForwardCallbackResult>
}

export interface UpdateApi {
  /** Ask the updater to check the feed now (no-op in dev / unpackaged). */
  check(): Promise<void>
  /** Quit the app and install the downloaded update (fire-and-forget). */
  quitAndInstall(): void
  /** Subscribe to "update available" events. Returns an unsubscribe function. */
  onAvailable(listener: (event: UpdateAvailableEvent) => void): () => void
  /** Subscribe to download-progress events. Returns an unsubscribe function. */
  onProgress(listener: (event: UpdateProgressEvent) => void): () => void
  /** Subscribe to "update downloaded" events. Returns an unsubscribe function. */
  onDownloaded(listener: (event: UpdateDownloadedEvent) => void): () => void
  /** Subscribe to updater errors. Returns an unsubscribe function. */
  onError(listener: (event: UpdateErrorEvent) => void): () => void
}

/** The full bridge exposed at `window.tessera`. */
export interface TesseraApi {
  backend: BackendApi
  workspace: WorkspaceApi
  surface: SurfaceApi
  persistence: PersistenceApi
  routing: RoutingApi
  update: UpdateApi
  /** Static build/runtime info (no behavior wired yet). */
  meta: {
    backendKinds: readonly BackendKind[]
    layoutVersion: LayoutSnapshot['version']
    /** Host platform, so the renderer can guard macOS-only chrome. */
    platform: NodeJS.Platform
  }
}
