/**
 * Container directory browser (M-J2-S3, AC2.3): the editor's open / Save-As
 * affordance on a container workspace, where the native host picker would show
 * the wrong filesystem. It lists the *machine's* directories over
 * `backend.listDir` and lets the user walk them — click (or ↑↓ + ⏎) a
 * directory to enter, `../` / ⌫ to go up, pick a file to open, or type an
 * absolute path in the header field and ⏎ to jump straight there. Save-As mode
 * adds a filename field so a scratch buffer can be written to the browsed
 * directory.
 *
 * Split for testability the same way as {@link WorkspaceRail}-style components:
 * {@link ContainerFileBrowserView} is pure (props in, markup out) and unit
 * -tested with static rendering; {@link ContainerFileBrowser} layers the
 * `listDir` fetching, path/selection state, and keyboard handling on top. Path
 * math lives in `containerPath.ts` — guest paths are POSIX, never the host's
 * path module.
 */
import { useEffect, useMemo, useRef, useState, type Ref } from 'react'
import type { DirEntry } from '@shared/types'
import { joinContainerPath, parentContainerPath, sortEntries } from './containerPath'

export type FileBrowserMode = 'open' | 'save'

export interface ContainerFileBrowserViewProps {
  mode: FileBrowserMode
  /** Directory currently listed — drives the `../` affordance. */
  path: string
  /** Path field value (editable draft; ⏎ jumps to it). */
  pathDraft: string
  /**
   * Entries of `path` in final display order (pre-sorted by the owner), or
   * null while the listing is in flight.
   */
  entries: DirEntry[] | null
  /** listDir failure for `path`, when it failed. */
  error: string | null
  /** Save-As filename field value. */
  filename: string
  /** Keyboard cursor: 0 = the `../` row when present, then the entries. */
  selectedIndex: number
  /** Focus target so keyboard browsing works while CodeMirror sits below. */
  listRef?: Ref<HTMLDivElement>
  onPathDraftChange: (value: string) => void
  onPathSubmit: () => void
  onEnterDir: (name: string) => void
  onUp: () => void
  onPickFile: (name: string) => void
  onFilenameChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

/** Pure browser chrome: title + path field, entry rows, Save-As / cancel bar. */
export function ContainerFileBrowserView({
  mode,
  path,
  pathDraft,
  entries,
  error,
  filename,
  selectedIndex,
  listRef,
  onPathDraftChange,
  onPathSubmit,
  onEnterDir,
  onUp,
  onPickFile,
  onFilenameChange,
  onSave,
  onCancel
}: ContainerFileBrowserViewProps) {
  const hasUp = path !== '/'
  /** Scrolls the keyboard-selected row into view as the cursor moves. */
  const selectedRowRef = (el: HTMLButtonElement | null) => el?.scrollIntoView({ block: 'nearest' })
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
          <input
            className="cfb-path"
            data-testid="cfb-path"
            aria-label="경로"
            spellCheck={false}
            value={pathDraft}
            onChange={(e) => onPathDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onPathSubmit()
            }}
          />
        </div>
        <div className="cfb-list" tabIndex={-1} ref={listRef}>
          {hasUp ? (
            <button
              type="button"
              className={selectedIndex === 0 ? 'cfb-row dir selected' : 'cfb-row dir'}
              data-testid="cfb-up"
              ref={selectedIndex === 0 ? selectedRowRef : undefined}
              onClick={onUp}
            >
              ../
            </button>
          ) : null}
          {error ? (
            <div className="cfb-error" data-testid="cfb-error">
              디렉토리를 읽지 못했습니다: {error}
            </div>
          ) : null}
          {entries?.map((entry, i) => {
            const index = i + (hasUp ? 1 : 0)
            const selected = index === selectedIndex
            const classes = `cfb-row${entry.isDir ? ' dir' : ''}${selected ? ' selected' : ''}`
            return (
              <button
                key={entry.name}
                type="button"
                className={classes}
                data-testid={`cfb-entry-${entry.name}`}
                ref={selected ? selectedRowRef : undefined}
                onClick={() => (entry.isDir ? onEnterDir(entry.name) : onPickFile(entry.name))}
              >
                {entry.isDir ? `${entry.name}/` : entry.name}
              </button>
            )
          })}
          {entries && entries.length === 0 && !error ? (
            <div className="cfb-empty">빈 디렉토리</div>
          ) : null}
          {!entries && !error ? <div className="cfb-empty">불러오는 중…</div> : null}
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
            <>
              <span className="cfb-keys">↑↓ 이동 · ⏎ 열기 · ⌫ 상위 · esc 닫기</span>
              <span className="spacer" />
            </>
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

/** One keyboard-navigable row: the `../` affordance or a directory entry. */
type BrowserItem = { kind: 'up' } | { kind: 'entry'; entry: DirEntry }

/** Normalize a typed path: force absolute, strip trailing slashes (keep root). */
function normalizeTypedPath(draft: string): string | null {
  const trimmed = draft.trim()
  if (!trimmed) return null
  const absolute = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  const stripped = absolute.replace(/\/+$/, '')
  return stripped === '' ? '/' : stripped
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
  const [pathDraft, setPathDraft] = useState(initialPath)
  const [entries, setEntries] = useState<DirEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filename, setFilename] = useState('')
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const sorted = useMemo(() => (entries ? sortEntries(entries) : null), [entries])

  // The keyboard model — MUST mirror the view's render order exactly.
  const items = useMemo<BrowserItem[]>(
    () => [
      ...(path !== '/' ? [{ kind: 'up' } as BrowserItem] : []),
      ...(sorted ?? []).map((entry): BrowserItem => ({ kind: 'entry', entry }))
    ],
    [path, sorted]
  )

  function enterDir(name: string) {
    setPath((current) => joinContainerPath(current, name))
  }

  function goUp() {
    setPath((current) => parentContainerPath(current))
  }

  function pickEntry(name: string) {
    if (mode === 'open') {
      onPick(joinContainerPath(path, name))
    } else {
      // Save-As: picking an existing file prefills the name (overwrite).
      setFilename(name)
    }
  }

  function activate(item: BrowserItem | undefined) {
    if (!item) return
    if (item.kind === 'up') {
      goUp()
    } else if (item.entry.isDir) {
      enterDir(item.entry.name)
    } else {
      pickEntry(item.entry.name)
    }
  }

  function submitPath() {
    const normalized = normalizeTypedPath(pathDraft)
    if (normalized) setPath(normalized)
  }

  function save() {
    const trimmed = filename.trim()
    if (trimmed) onPick(joinContainerPath(path, trimmed))
  }

  // Latest state for the mount-once keyboard handler.
  const itemsRef = useRef(items)
  itemsRef.current = items
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  const pathRef = useRef(path)
  pathRef.current = path
  const activateRef = useRef(activate)
  activateRef.current = activate
  const goUpRef = useRef(goUp)
  goUpRef.current = goUp
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel

  // (Re)list on every path change; the keyboard cursor restarts at the top. A
  // failed listing keeps the previous path's rows hidden and shows the error
  // instead — `../` and the path field still work to escape.
  useEffect(() => {
    let cancelled = false
    setEntries(null)
    setError(null)
    setSelected(0)
    setPathDraft(path)
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

  // In open mode, pull focus off the CodeMirror buffer underneath so typing
  // can't leak into the document (save mode's filename field autofocuses).
  useEffect(() => {
    if (mode === 'open') listRef.current?.focus()
  }, [mode])

  // Keyboard driving, captured so it beats the surfaces below: Esc cancels,
  // ↑↓ move the cursor, ⏎ activates, ⌫ goes up. Keys aimed at the path or
  // filename fields are left alone so typing there stays ordinary.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cancelRef.current()
        return
      }
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        const length = itemsRef.current.length
        if (length === 0) return
        setSelected((i) =>
          e.key === 'ArrowDown' ? Math.min(i + 1, length - 1) : Math.max(i - 1, 0)
        )
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        activateRef.current(itemsRef.current[selectedRef.current])
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        e.stopPropagation()
        if (pathRef.current !== '/') goUpRef.current()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  return (
    <ContainerFileBrowserView
      mode={mode}
      path={path}
      pathDraft={pathDraft}
      entries={sorted}
      error={error}
      filename={filename}
      selectedIndex={selected}
      listRef={listRef}
      onPathDraftChange={setPathDraft}
      onPathSubmit={submitPath}
      onEnterDir={enterDir}
      onUp={goUp}
      onPickFile={pickEntry}
      onFilenameChange={setFilename}
      onSave={save}
      onCancel={onCancel}
    />
  )
}
