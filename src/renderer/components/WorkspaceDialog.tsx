/**
 * C-modal: "새 워크스페이스" creation dialog (M-J1-S1, P-modal-over-quiet).
 *
 * Collects name + backend, then calls `window.tessera.workspace.create`. A host
 * workspace needs a working directory (native picker via
 * `workspace.pickDirectory`); a container workspace needs an image plus a
 * home-mount mode and optional cpu/memory caps (AC2.1). On success the created
 * workspace is handed back to `App`, which switches to the single-pane surface.
 */
import { useEffect, useRef, useState } from 'react'
import type { CreateWorkspaceResult } from '@shared/ipc'
import type { BackendKind, ContainerHomeMount } from '@shared/types'

const HOME_MOUNT_MODES: ReadonlyArray<{ value: ContainerHomeMount; label: string }> = [
  { value: 'rw', label: '읽기·쓰기' },
  { value: 'ro', label: '읽기 전용' },
  { value: 'none', label: '없음' }
]

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
  // Container-only fields (ignored for host), pre-filled with sensible defaults:
  // a small image, 2 vCPU / 4G, and no host home mount.
  const [image, setImage] = useState('alpine:latest')
  const [homeMount, setHomeMount] = useState<ContainerHomeMount>('none')
  const [cpus, setCpus] = useState('2')
  const [memory, setMemory] = useState('4G')
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
      // Don't let Escape abandon the dialog while a create is in flight — the
      // backend is already being stood up; closing now would orphan it.
      if (e.key === 'Escape' && !submitting) {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, submitting])

  const isContainer = backendKind === 'container'
  const canCreate =
    name.trim().length > 0 &&
    (isContainer ? image.trim().length > 0 : cwd.trim().length > 0) &&
    !submitting

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
      const cpusValue = cpus.trim().length > 0 ? Number(cpus.trim()) : undefined
      const result = await window.tessera.workspace.create({
        name: name.trim(),
        backendKind,
        ...(isContainer
          ? {
              image: image.trim(),
              homeMount,
              ...(cpusValue !== undefined ? { cpus: cpusValue } : {}),
              ...(memory.trim().length > 0 ? { memory: memory.trim() } : {})
            }
          : { cwd: cwd.trim() })
      })
      onCreated(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : '워크스페이스를 생성하지 못했습니다.')
      setSubmitting(false)
    }
  }

  // Enter from a text field submits straight away (P-modal-over-quiet: the
  // primary action is one keystroke). `create` no-ops while required fields are
  // empty or a submit is already in flight, so this is safe to fire eagerly.
  function onFieldKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      void create()
    }
  }

  const hasContainer = backendKinds.includes('container')

  return (
    <div
      className="scrim"
      onMouseDown={(e) => {
        // Clicking the backdrop dismisses, except mid-create (would orphan the
        // backend being stood up).
        if (e.target === e.currentTarget && !submitting) onCancel()
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
                onKeyDown={onFieldKeyDown}
                data-testid="ws-name"
              />
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
                  className={isContainer ? 'seg on cont' : 'seg cont'}
                  onClick={() => setBackendKind('container')}
                  data-testid="ws-backend-container"
                >
                  <span className="sdot" />
                  컨테이너
                </button>
              ) : null}
            </div>
            <div className="hint">
              {isContainer
                ? '컨테이너 머신에서 격리되어 실행됩니다. backend는 생성 후 고정됩니다.'
                : '호스트 머신에서 직접 실행됩니다. backend는 생성 후 고정됩니다.'}
            </div>
          </div>
          {isContainer ? (
            <>
              <div className="field">
                <label htmlFor="ws-image">이미지</label>
                <div className="input mono">
                  <span className="ic">📦</span>
                  <input
                    id="ws-image"
                    value={image}
                    placeholder="node:22"
                    onChange={(e) => setImage(e.target.value)}
                    onKeyDown={onFieldKeyDown}
                    data-testid="ws-image"
                  />
                </div>
              </div>
              <div className="field">
                <label>홈 마운트</label>
                <div className="segmented" role="group" aria-label="홈 마운트">
                  {HOME_MOUNT_MODES.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      className={homeMount === mode.value ? 'seg on' : 'seg'}
                      onClick={() => setHomeMount(mode.value)}
                      data-testid={`ws-homemount-${mode.value}`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                <div className="hint">호스트 홈 디렉토리를 머신에 마운트하는 방식입니다.</div>
              </div>
              <div className="field">
                <label htmlFor="ws-cpus">리소스 (선택)</label>
                <div className="input mono">
                  <span className="ic">⚙️</span>
                  <input
                    id="ws-cpus"
                    value={cpus}
                    placeholder="CPU 수 (예: 4)"
                    inputMode="numeric"
                    onChange={(e) => setCpus(e.target.value)}
                    onKeyDown={onFieldKeyDown}
                    data-testid="ws-cpus"
                  />
                  <input
                    id="ws-memory"
                    value={memory}
                    placeholder="메모리 (예: 4G)"
                    onChange={(e) => setMemory(e.target.value)}
                    onKeyDown={onFieldKeyDown}
                    data-testid="ws-memory"
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="field">
              <label htmlFor="ws-cwd">작업 디렉토리</label>
              <div className="input mono">
                <span className="ic">📁</span>
                <input
                  id="ws-cwd"
                  value={cwd}
                  placeholder="~/proj-web"
                  onChange={(e) => setCwd(e.target.value)}
                  onKeyDown={onFieldKeyDown}
                  data-testid="ws-cwd"
                />
                <button
                  type="button"
                  className="pick"
                  onClick={pickDirectory}
                  data-testid="ws-pick"
                >
                  선택…
                </button>
              </div>
            </div>
          )}
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
          <button
            type="button"
            className="btn ghost"
            onClick={onCancel}
            disabled={submitting}
            data-testid="ws-cancel"
          >
            취소
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={create}
            disabled={!canCreate}
            aria-busy={submitting}
            data-testid="ws-create"
          >
            {submitting ? (
              <>
                <span className="spinner" aria-hidden="true" />
                {isContainer ? '머신 생성 중…' : '생성 중…'}
              </>
            ) : (
              '워크스페이스 생성'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
