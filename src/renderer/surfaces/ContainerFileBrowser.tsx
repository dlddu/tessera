/**
 * Container directory browser (M-J2-S3, AC2.3): the editor's open / Save-As
 * affordance on a container workspace, where the native host picker would show
 * the wrong filesystem. It lists the *machine's* directories over
 * `backend.listDir` and lets the user walk them — click a directory to enter,
 * `../` to go up, click a file to open. Save-As mode adds a filename field so a
 * scratch buffer can be written to the browsed directory.
 *
 * Split for testability the same way as {@link WorkspaceRail}-style components:
 * {@link ContainerFileBrowserView} is pure (props in, markup out) and unit
 * -tested with static rendering; {@link ContainerFileBrowser} layers the
 * `listDir` fetching, path state, and Esc handling on top. Path math lives in
 * `containerPath.ts` — guest paths are POSIX, never the host's path module.
 */
import { useEffect, useRef, useState } from 'react'
import type { DirEntry } from '@shared/types'
import { joinContainerPath, parentContainerPath } from './containerPath'

export type FileBrowserMode = 'open' | 'save'

/** Directories first, each group alphabetical — stable regardless of backend order. */
function sortEntries(entries: DirEntry[]): DirEntry[] {
  return [...entries].sort((a, b) =>
    a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name)
  )
}

export interface ContainerFileBrowserViewProps {
  mode: FileBrowserMode
  /** Directory currently listed. */
  path: string
  /** Entries of `path`, or null while the listing is in flight. */
  entries: DirEntry[] | null
  /** listDir failure for `path`, when it failed. */
  error: string | null
  /** Save-As filename field value. */
  filename: string
  onEnterDir: (name: string) => void
  onUp: () => void
  onPickFile: (name: string) => void
  onFilenameChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

/** Pure browser chrome: path header, entry rows, Save-As bar. */
export function ContainerFileBrowserView({
  mode,
  path,
  entries,
  error,
  filename,
  onEnterDir,
  onUp,
  onPickFile,
  onFilenameChange,
  onSave,
  onCancel
}: ContainerFileBrowserViewProps) {
  const sorted = entries ? sortEntries(entries) : null
  return (
    <div
      className="scrim"
      data-testid="container-file-browser"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="cfb-card"
        role="dialog"
        aria-label={mode === 'open' ? '컨테이너 파일 열기' : '컨테이너에 저장'}
      >
        <div className="cfb-head">
          <span className="cfb-title">
            {mode === 'open' ? '컨테이너 파일 열기' : '컨테이너에 저장'}
          </span>
          <span className="cfb-path" data-testid="cfb-path">
            {path}
          </span>
        </div>
        <div className="cfb-list">
          {path !== '/' ? (
            <button type="button" className="cfb-row dir" data-testid="cfb-up" onClick={onUp}>
              ../
            </button>
          ) : null}
          {error ? (
            <div className="cfb-error" data-testid="cfb-error">
              디렉토리를 읽지 못했습니다: {error}
            </div>
          ) : null}
          {sorted?.map((entry) => (
            <button
              key={entry.name}
              type="button"
              className={entry.isDir ? 'cfb-row dir' : 'cfb-row'}
              data-testid={`cfb-entry-${entry.name}`}
              onClick={() => (entry.isDir ? onEnterDir(entry.name) : onPickFile(entry.name))}
            >
              {entry.isDir ? `${entry.name}/` : entry.name}
            </button>
          ))}
          {sorted && sorted.length === 0 && !error ? (
            <div className="cfb-empty">빈 디렉토리</div>
          ) : null}
          {!sorted && !error ? <div className="cfb-empty">불러오는 중…</div> : null}
        </div>
        <div className="cfb-foot">
          {mode === 'save' ? (
            <>
              <input
                className="cfb-filename"
                data-testid="cfb-filename"
                placeholder="파일 이름"
                autoFocus
                value={filename}
                onChange={(e) => onFilenameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSave()
                }}
              />
              <button
                type="button"
                className="btn primary sm"
                data-testid="cfb-save"
                disabled={filename.trim() === ''}
                onClick={onSave}
              >
                저장
              </button>
            </>
          ) : (
            <span className="spacer" />
          )}
          <button
            type="button"
            className="btn ghost sm"
            data-testid="cfb-cancel"
            onClick={onCancel}
          >
            취소
          </button>
        </div>
      </div>
    </div>
  )
}

export interface ContainerFileBrowserProps {
  workspaceId: string
  areaId: string
  mode: FileBrowserMode
  /**
   * Directory to start browsing in — the editor seeds it with the bound file's
   * parent or the last focused container terminal's cwd, falling back to `/`
   * (the only path guaranteed to exist in any image).
   */
  initialPath: string
  /** Called with the chosen absolute container path (open: file; save: dir + name). */
  onPick: (path: string) => void
  onCancel: () => void
}

/** Stateful browser: drives `backend.listDir` as the user walks the machine fs. */
export function ContainerFileBrowser({
  workspaceId,
  areaId,
  mode,
  initialPath,
  onPick,
  onCancel
}: ContainerFileBrowserProps) {
  const [path, setPath] = useState(initialPath)
  const [entries, setEntries] = useState<DirEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filename, setFilename] = useState('')
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel

  // (Re)list on every path change. A failed listing keeps the previous path's
  // rows hidden and shows the error instead — `../` still works to escape.
  useEffect(() => {
    let cancelled = false
    setEntries(null)
    setError(null)
    window.tessera.backend
      .listDir({ workspaceId, areaId, path })
      .then(({ entries: listed }) => {
        if (!cancelled) setEntries(listed)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId, areaId, path])

  // Esc cancels. Captured so it beats the CodeMirror editor underneath.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cancelRef.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  return (
    <ContainerFileBrowserView
      mode={mode}
      path={path}
      entries={entries}
      error={error}
      filename={filename}
      onEnterDir={(name) => setPath(joinContainerPath(path, name))}
      onUp={() => setPath(parentContainerPath(path))}
      onPickFile={(name) => {
        if (mode === 'open') {
          onPick(joinContainerPath(path, name))
        } else {
          // Save-As: clicking an existing file prefills the name (overwrite).
          setFilename(name)
        }
      }}
      onFilenameChange={setFilename}
      onSave={() => {
        const trimmed = filename.trim()
        if (trimmed) onPick(joinContainerPath(path, trimmed))
      }}
      onCancel={onCancel}
    />
  )
}
