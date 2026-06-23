/**
 * Background polling for the update feed.
 *
 * `initUpdater` checks once at launch; a long-running session would otherwise
 * never notice releases published after that. This re-runs the same check on a
 * fixed interval. Kept free of Electron imports so it stays unit-testable.
 */

/** How often the background updater re-polls the release feed: every 5 minutes. */
export const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000

/**
 * Call `check` every `intervalMs` (default {@link UPDATE_CHECK_INTERVAL_MS}),
 * starting one interval from now. Returns a disposer that stops the polling;
 * calling it more than once is a no-op.
 *
 * Failures (sync throws and rejected promises) are swallowed: the updater
 * already forwards errors to the renderer via its `error` event, and an
 * unhandled rejection from a periodic timer would otherwise take down the main
 * process.
 */
export function startPeriodicUpdateCheck(
  check: () => Promise<unknown>,
  intervalMs: number = UPDATE_CHECK_INTERVAL_MS
): () => void {
  const timer = setInterval(() => {
    void (async () => {
      try {
        await check()
      } catch {
        // Surfaced to the renderer via the updater's `error` event; swallow
        // here so a failed poll can't crash the main process.
      }
    })()
  }, intervalMs)
  // The poll alone shouldn't keep the process (or test runner) alive.
  timer.unref?.()

  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    clearInterval(timer)
  }
}
