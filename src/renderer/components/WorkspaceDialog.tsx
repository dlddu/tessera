/**
 * C-modal: "새 워크스페이스" creation dialog (M-J1-S1, P-modal-over-quiet).
 *
 * Collects name + working directory + backend, then calls
 * `window.tessera.workspace.create`. Only host creation is wired; the container
 * segment is shown but disabled (M-J2-S1). The folder picker delegates to the
 * native dialog via `workspace.pickDirectory`. On success the created workspace
 * is handed back to `App`, which switches to the single-pane surface.
 */
import { useEffect, useRef, useState } from 'react'
import type { CreateWorkspaceResult } from '@shared/ipc'
import type { BackendKind } from '@shared/types'

interface WorkspaceDialogProps {
  /** Backend kinds advertised by the bridge; drives the segmented control. */
  backendKinds: readonly BackendKind[]
  onCreated: (result: CreateWorkspaceResult) => void
  onCancel: () => void
}

export function WorkspaceDialog({ backendKinds, onCreated, onCancel }: WorkspaceDialogProps) {
  const [name, setName] = useState('')
  const [cwd, setCwd] = useState('')
  const [backendKind, setBackendKind] = useState<BackendKind>('host')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    nameRef.current?.focus()
  }, [])

  // Prefill the working directory with a sensible default (last-created cwd this
  // session, else the host home dir) so creation doesn't demand a manual pick.
  useEffect(() => {
    let cancelled = false
    window.tessera.workspace
      .defaultCwd()
      .then(({ path }) => {
        if (cancelled || !path) return
        // Only seed an untouched field; never clobber what the user has typed.
        setCwd((prev) => (prev.length === 0 ? path : prev))
      })
      .catch(() => {
        // No default available — leave it empty for the user to fill in.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const canCreate = name.trim().length > 0 && cwd.trim().length > 0 && !submitting

  async function pickDirectory() {
    const { path } = await window.tessera.workspace.pickDirectory()
    if (path) {
      setCwd(path)
      setError(null)
    }
  }

  async function create() {
    if (!canCreate) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await window.tessera.workspace.create({
        name: name.trim(),
        cwd: cwd.trim(),
        backendKind
      })
      onCreated(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '워크스페이스를 생성하지 못했습니다.')
      setSubmitting(false)
    }
  }

  const hasContainer = backendKinds.includes('container')

  return (
    <div
      className="scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ws-dialog-title"
        data-testid="workspace-dialog"
      >
        <div className="dhead">
          <span className="mark">
            <i />
            <i />
            <i />
            <i />
          </span>
          <h3 id="ws-dialog-title">새 워크스페이스</h3>
        </div>
        <div className="dbody">
          <div className="field">
            <label htmlFor="ws-name">이름</label>
            <div className="input">
              <input
                id="ws-name"
                ref={nameRef}
                value={name}
                placeholder="proj-web"
                onChange={(e) => setName(e.target.value)}
                data-testid="ws-name"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="ws-cwd">작업 디렉토리</label>
            <div className="input mono">
              <span className="ic">📁</span>
              <input
                id="ws-cwd"
                value={cwd}
                placeholder="~/proj-web"
                onChange={(e) => setCwd(e.target.value)}
                data-testid="ws-cwd"
              />
              <button type="button" className="pick" onClick={pickDirectory} data-testid="ws-pick">
                선택…
              </button>
            </div>
          </div>
          <div className="field">
            <label>Backend</label>
            <div className="segmented" role="group" aria-label="Backend">
              <button
                type="button"
                className={backendKind === 'host' ? 'seg on host' : 'seg host'}
                onClick={() => setBackendKind('host')}
                data-testid="ws-backend-host"
              >
                <span className="sdot" />
                호스트
              </button>
              {hasContainer ? (
                <button
                  type="button"
                  className="seg cont"
                  disabled
                  aria-disabled="true"
                  title="컨테이너 생성은 아직 지원되지 않습니다."
                  data-testid="ws-backend-container"
                >
                  <span className="sdot" />
                  컨테이너
                </button>
              ) : null}
            </div>
            <div className="hint">
              호스트 머신에서 직접 실행됩니다. backend는 생성 후 고정됩니다.
            </div>
          </div>
          {error ? (
            <div
              className="hint"
              role="alert"
              data-testid="ws-error"
              style={{ color: 'var(--danger)' }}
            >
              {error}
            </div>
          ) : null}
        </div>
        <div className="dfoot">
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={onCancel} data-testid="ws-cancel">
            취소
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={create}
            disabled={!canCreate}
            data-testid="ws-create"
          >
            워크스페이스 생성
          </button>
        </div>
      </div>
    </div>
  )
}
