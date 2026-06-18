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
    pickDirectory: 'tessera:workspace:pick-directory'
  },
  surface: {
    create: 'tessera:surface:create',
    dispose: 'tessera:surface:dispose'
  },
  persistence: {
    save: 'tessera:persistence:save',
    load: 'tessera:persistence:load'
  },
  routing: {
    openUrlOnHost: 'tessera:routing:open-url-on-host',
    forwardCallback: 'tessera:routing:forward-callback'
  }
} as const

/** Union of every channel string, handy for typing/iteration. */
export type IpcChannel =
  | (typeof IpcChannels.backend)[keyof typeof IpcChannels.backend]
  | (typeof IpcChannels.workspace)[keyof typeof IpcChannels.workspace]
  | (typeof IpcChannels.surface)[keyof typeof IpcChannels.surface]
  | (typeof IpcChannels.persistence)[keyof typeof IpcChannels.persistence]
  | (typeof IpcChannels.routing)[keyof typeof IpcChannels.routing]
