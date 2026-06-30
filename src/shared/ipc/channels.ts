/**
 * IPC channel name constants. Single source of truth shared by the preload
 * bridge (renderer → main) and the main-process handlers.
 */
export const IpcChannels = {
  backend: {
    spawnPty: 'tessera:backend:spawn-pty',
    readFile: 'tessera:backend:read-file',
    writeFile: 'tessera:backend:write-file',
    runProcess: 'tessera:backend:run-process',
    getEnv: 'tessera:backend:get-env',
    lifecycle: 'tessera:backend:lifecycle'
  },
  workspace: {
    create: 'tessera:workspace:create',
    /** renderer → main: close a workspace — delete its snapshot + drop its backend. */
    close: 'tessera:workspace:close',
    pickDirectory: 'tessera:workspace:pick-directory',
    /** renderer → main: native file picker (open a host file in the editor). */
    pickFile: 'tessera:workspace:pick-file',
    /** renderer → main: native save dialog (Save As for a scratch buffer). */
    pickSaveFile: 'tessera:workspace:pick-save-file',
    /** renderer → main: a sensible default cwd to prefill the create dialog. */
    defaultCwd: 'tessera:workspace:default-cwd'
  },
  surface: {
    create: 'tessera:surface:create',
    dispose: 'tessera:surface:dispose',
    /** main → renderer: a chunk of PTY output, keyed by surfaceId. */
    ptyData: 'tessera:surface:pty-data',
    /** main → renderer: the PTY for a surface exited, keyed by surfaceId. */
    ptyExit: 'tessera:surface:pty-exit',
    /** renderer → main: keyboard/paste input for a surface's PTY. */
    ptyInput: 'tessera:surface:pty-input',
    /** renderer → main: a surface's PTY was resized (cols/rows). */
    ptyResize: 'tessera:surface:pty-resize'
  },
  persistence: {
    save: 'tessera:persistence:save',
    /** renderer → main (sync): last-moment save on app quit (`beforeunload`). */
    saveSync: 'tessera:persistence:save-sync',
    load: 'tessera:persistence:load',
    /** renderer → main: every persisted workspace snapshot (boot restore). */
    list: 'tessera:persistence:list'
  },
  routing: {
    openUrlOnHost: 'tessera:routing:open-url-on-host',
    forwardCallback: 'tessera:routing:forward-callback'
  },
  update: {
    /** main → renderer: a newer version is available and downloading. */
    available: 'tessera:update:available',
    /** main → renderer: download progress (percent + byte counters). */
    progress: 'tessera:update:progress',
    /** main → renderer: an update finished downloading and is ready to install. */
    downloaded: 'tessera:update:downloaded',
    /** main → renderer: the updater hit an error. */
    error: 'tessera:update:error',
    /** renderer → main: ask the updater to check the feed now. */
    check: 'tessera:update:check',
    /** renderer → main: quit and install the downloaded update. */
    quitAndInstall: 'tessera:update:quit-and-install'
  }
} as const

/** Union of every channel string, handy for typing/iteration. */
export type IpcChannel =
  | (typeof IpcChannels.backend)[keyof typeof IpcChannels.backend]
  | (typeof IpcChannels.workspace)[keyof typeof IpcChannels.workspace]
  | (typeof IpcChannels.surface)[keyof typeof IpcChannels.surface]
  | (typeof IpcChannels.persistence)[keyof typeof IpcChannels.persistence]
  | (typeof IpcChannels.routing)[keyof typeof IpcChannels.routing]
  | (typeof IpcChannels.update)[keyof typeof IpcChannels.update]
