/**
 * Preload bridge. Exposes the typed `window.tessera` API to the renderer over
 * contextIsolation. Each method forwards to a main-process IPC handler (which,
 * in the skeleton, rejects with `not implemented`).
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannels } from '@shared/ipc'
import type { TesseraApi } from '@shared/ipc'

const api: TesseraApi = {
  backend: {
    spawnPty: (req) => ipcRenderer.invoke(IpcChannels.backend.spawnPty, req),
    readFile: (req) => ipcRenderer.invoke(IpcChannels.backend.readFile, req),
    writeFile: (req) => ipcRenderer.invoke(IpcChannels.backend.writeFile, req),
    runProcess: (req) => ipcRenderer.invoke(IpcChannels.backend.runProcess, req),
    getEnv: (req) => ipcRenderer.invoke(IpcChannels.backend.getEnv, req),
    lifecycle: (req) => ipcRenderer.invoke(IpcChannels.backend.lifecycle, req)
  },
  workspace: {
    create: (req) => ipcRenderer.invoke(IpcChannels.workspace.create, req),
    pickDirectory: () => ipcRenderer.invoke(IpcChannels.workspace.pickDirectory)
  },
  surface: {
    create: (req) => ipcRenderer.invoke(IpcChannels.surface.create, req),
    dispose: (req) => ipcRenderer.invoke(IpcChannels.surface.dispose, req)
  },
  persistence: {
    save: (snapshot) => ipcRenderer.invoke(IpcChannels.persistence.save, snapshot),
    load: (req) => ipcRenderer.invoke(IpcChannels.persistence.load, req)
  },
  routing: {
    openUrlOnHost: (req) => ipcRenderer.invoke(IpcChannels.routing.openUrlOnHost, req),
    forwardCallback: (req) => ipcRenderer.invoke(IpcChannels.routing.forwardCallback, req)
  },
  meta: {
    backendKinds: ['host', 'container'],
    layoutVersion: 1
  }
}

contextBridge.exposeInMainWorld('tessera', api)
