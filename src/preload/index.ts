/**
 * Preload bridge. Exposes the typed `window.tessera` API to the renderer over
 * contextIsolation. Each method forwards to a main-process IPC handler (which,
 * in the skeleton, rejects with `not implemented`).
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannels } from '@shared/ipc'
import type {
  PtyDataEvent,
  PtyExitEvent,
  TesseraApi,
  UpdateAvailableEvent,
  UpdateDownloadedEvent,
  UpdateErrorEvent,
  UpdateProgressEvent
} from '@shared/ipc'

/** Subscribe to a main → renderer channel; returns an unsubscribe function. */
function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

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
    pickDirectory: () => ipcRenderer.invoke(IpcChannels.workspace.pickDirectory),
    defaultCwd: () => ipcRenderer.invoke(IpcChannels.workspace.defaultCwd)
  },
  surface: {
    create: (req) => ipcRenderer.invoke(IpcChannels.surface.create, req),
    dispose: (req) => ipcRenderer.invoke(IpcChannels.surface.dispose, req),
    sendInput: (req) => ipcRenderer.send(IpcChannels.surface.ptyInput, req),
    resize: (req) => ipcRenderer.send(IpcChannels.surface.ptyResize, req),
    onPtyData: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: PtyDataEvent) => listener(payload)
      ipcRenderer.on(IpcChannels.surface.ptyData, handler)
      return () => ipcRenderer.removeListener(IpcChannels.surface.ptyData, handler)
    },
    onPtyExit: (listener) => {
      const handler = (_event: IpcRendererEvent, payload: PtyExitEvent) => listener(payload)
      ipcRenderer.on(IpcChannels.surface.ptyExit, handler)
      return () => ipcRenderer.removeListener(IpcChannels.surface.ptyExit, handler)
    }
  },
  persistence: {
    save: (snapshot) => ipcRenderer.invoke(IpcChannels.persistence.save, snapshot),
    load: (req) => ipcRenderer.invoke(IpcChannels.persistence.load, req)
  },
  routing: {
    openUrlOnHost: (req) => ipcRenderer.invoke(IpcChannels.routing.openUrlOnHost, req),
    forwardCallback: (req) => ipcRenderer.invoke(IpcChannels.routing.forwardCallback, req)
  },
  update: {
    check: () => ipcRenderer.invoke(IpcChannels.update.check),
    quitAndInstall: () => ipcRenderer.send(IpcChannels.update.quitAndInstall),
    onAvailable: (listener) =>
      subscribe<UpdateAvailableEvent>(IpcChannels.update.available, listener),
    onProgress: (listener) => subscribe<UpdateProgressEvent>(IpcChannels.update.progress, listener),
    onDownloaded: (listener) =>
      subscribe<UpdateDownloadedEvent>(IpcChannels.update.downloaded, listener),
    onError: (listener) => subscribe<UpdateErrorEvent>(IpcChannels.update.error, listener)
  },
  meta: {
    backendKinds: ['host', 'container'],
    layoutVersion: 1,
    platform: process.platform
  }
}

contextBridge.exposeInMainWorld('tessera', api)
