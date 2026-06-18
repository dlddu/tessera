/**
 * Tracks the live PTY behind each surface (M-J1-S2).
 *
 * A surface is created via `surface.create` (which spawns a PTY) and addressed
 * by its `surfaceId` for the rest of its life — input, resize, output, and
 * disposal all key off this map. Disposal kills the PTY; `delete` removes the
 * entry without killing (used after the PTY exits on its own).
 */
import type { PtyProcess } from '@main/backend'

export class SurfaceRegistry {
  private readonly surfaces = new Map<string, PtyProcess>()

  register(surfaceId: string, pty: PtyProcess): void {
    this.surfaces.set(surfaceId, pty)
  }

  get(surfaceId: string): PtyProcess | undefined {
    return this.surfaces.get(surfaceId)
  }

  has(surfaceId: string): boolean {
    return this.surfaces.has(surfaceId)
  }

  /** Kill and remove a surface's PTY. Returns false if it was unknown. */
  dispose(surfaceId: string): boolean {
    const pty = this.surfaces.get(surfaceId)
    if (!pty) {
      return false
    }
    pty.kill()
    this.surfaces.delete(surfaceId)
    return true
  }

  /** Remove the entry without killing (the PTY already exited). */
  delete(surfaceId: string): void {
    this.surfaces.delete(surfaceId)
  }

  /** Kill and forget every surface (window/app teardown). */
  disposeAll(): void {
    for (const pty of this.surfaces.values()) {
      pty.kill()
    }
    this.surfaces.clear()
  }

  get size(): number {
    return this.surfaces.size
  }
}
