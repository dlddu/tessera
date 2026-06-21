/**
 * Workspace IPC handlers (M-J1-S1). Owns the host-side create path:
 *
 *   - `pickDirectory` → native folder picker (`dialog.showOpenDialog`).
 *   - `defaultCwd` → a sensible directory to prefill the create dialog: the cwd
 *     of the last workspace created this session, else the host home directory.
 *   - `create` → validate input, confirm the host cwd exists, build the
 *     workspace + initial single-pane layout, persist its snapshot, remember its
 *     cwd for the next `defaultCwd`, and return `{ workspace, layout }` to the
 *     renderer.
 *
 * Container creation is out of scope (M-J2-S1); only host is wired. The backend
 * runtime has no "create workspace" concept — that is a host-level concern, so
 * it lives here rather than in `src/main/backend`.
 *
 * On a successful create the workspace's live backend is registered in the
 * shared {@link BackendRegistry} so surfaces (M-J1-S2 terminals) can spawn
 * against it.
 */
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannels } from '@shared/ipc'
import type {
  CreateWorkspaceRequest,
  CreateWorkspaceResult,
  DefaultCwdResult,
  PickDirectoryResult
} from '@shared/ipc'
import { buildWorkspace, validateWorkspaceInput } from '@shared/workspace'
import type { BackendRegistry } from '@main/backend'
import { PersistenceStore } from '@main/persistence'

async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path)
    return stats.isDirectory()
  } catch {
    return false
  }
}

export interface WorkspaceIpcDeps {
  backends: BackendRegistry
  store?: PersistenceStore
}

export function registerWorkspaceIpc({
  backends,
  store = new PersistenceStore(app.getPath('userData'))
}: WorkspaceIpcDeps): void {
  // cwd of the most recently created workspace this session; seeds the next
  // create dialog so consecutive workspaces reuse the same parent path.
  // Resets to the home directory on app restart (session-scoped by design).
  let lastCreatedCwd: string | null = null

  ipcMain.handle(IpcChannels.workspace.defaultCwd, (): DefaultCwdResult => {
    return { path: lastCreatedCwd ?? homedir() }
  })

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

      // Stand up the workspace's live backend so its surfaces can spawn PTYs.
      backends.create(workspace.id, workspace.backend.cwd)

      // Remember this cwd so the next create dialog can prefill it.
      lastCreatedCwd = workspace.backend.cwd

      return { workspace, layout }
    }
  )
}
