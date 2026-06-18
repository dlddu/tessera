/**
 * Tracks the live {@link Backend} instance for each workspace (PRD-2).
 *
 * A workspace owns one backend; surfaces (terminals, etc.) created within it
 * spawn against that backend. The `workspace.create` handler registers a
 * backend here; `surface.create` looks it up. The factory is injected so the
 * registry stays decoupled from how backends are constructed (host today,
 * container later).
 */
import type { Backend } from './Backend'

export class BackendRegistry {
  private readonly backends = new Map<string, Backend>()

  /** @param createHost builds a host backend for a given working directory. */
  constructor(private readonly createHost: (cwd: string) => Backend) {}

  /** Create + register the backend for a workspace, returning it. */
  create(workspaceId: string, cwd: string): Backend {
    const backend = this.createHost(cwd)
    this.backends.set(workspaceId, backend)
    return backend
  }

  get(workspaceId: string): Backend | undefined {
    return this.backends.get(workspaceId)
  }

  delete(workspaceId: string): void {
    this.backends.delete(workspaceId)
  }
}
