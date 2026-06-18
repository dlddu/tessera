/**
 * Lazy bridge to the native `node-pty` module (AC2.2).
 *
 * node-pty is a native addon that must match Electron's ABI (rebuilt via
 * `@electron/rebuild`). It is loaded lazily — only when the first PTY is
 * spawned — so importing the backend layer (or running unit tests with an
 * injected fake) never pulls in the native binding. The resolved spawner is
 * cached for the process lifetime.
 */
import type { NativePty, PtySpawn } from './Backend'

let cached: PtySpawn | null = null

/** Resolve node-pty's `spawn`, adapted to the {@link PtySpawn} contract. */
export async function getNodePtySpawn(): Promise<PtySpawn> {
  if (!cached) {
    const mod = await import('node-pty')
    const spawn = mod.spawn ?? mod.default?.spawn
    cached = (file, args, options) => spawn(file, args, options) as unknown as NativePty
  }
  return cached
}
