/**
 * Workspace IPC handlers (M-J1-S1). Owns the host-side create path:
 *
 *   - `pickDirectory` → native folder picker (`dialog.showOpenDialog`).
 *   - `create` → validate input, confirm the host cwd exists, build the
 *     workspace + initial single-pane layout, persist its snapshot, and return
 *     `{ workspace, layout }` to the renderer.
 *
 * Container creation is out of scope (M-J2-S1); only host is wired. The backend
 * runtime has no "create workspace" concept — that is a host-level concern, so
 * it lives here rather than in `src/main/backend`.
 */
import { stat } from 'node:fs/promises'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc'
import type {
  CreateWorkspaceRequest,
  CreateWorkspaceResult,
  PickDirectoryResult
} from '@shared/ipc'
import { buildWorkspace, validateWorkspaceInput } from '@shared/workspace'
import { PersistenceStore } from '@main/persistence'

async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path)
    return stats.isDirectory()
  } catch {
    return false
  }
}

export function registerWorkspaceIpc(store = new PersistenceStore(app.getPath('userData'))): void {
  ipcMain.handle(IpcChannels.workspace.pickDirectory, async (): Promise<PickDirectoryResult> => {
    const parent = BrowserWindow.getFocusedWindow() ?? undefined
    const result = parent
      ? await dialog.showOpenDialog(parent, {
          properties: ['openDirectory', 'createDirectory']
        })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })

    if (result.canceled || result.filePaths.length === 0) {
      return { path: null }
    }
    return { path: result.filePaths[0] ?? null }
  })

  ipcMain.handle(
    IpcChannels.workspace.create,
    async (_event, req: CreateWorkspaceRequest): Promise<CreateWorkspaceResult> => {
      const error = validateWorkspaceInput(req)
      if (error) {
        throw new Error(error)
      }

      if (!(await isDirectory(req.cwd))) {
        throw new Error('작업 디렉토리를 찾을 수 없습니다.')
      }

      const { workspace, layout, snapshot } = buildWorkspace(req)
      await store.save(snapshot)

      return { workspace, layout }
    }
  )
}
