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
 * Failures (sync throws and rejected promises) never propagate: an unhandled
 * rejection from a periodic timer would otherwise take down the main process.
 * They are handed to `onError` instead of being dropped — a silently failing
 * update poll is the classic packaged-build symptom ("it never updates") with
 * nothing to look at. The caller injects the sink so this module stays free of
 * Electron imports and unit-testable.
 */
export function startPeriodicUpdateCheck(
  check: () => Promise<unknown>,
  intervalMs: number = UPDATE_CHECK_INTERVAL_MS,
  onError: (error: unknown) => void = () => {}
): () => void {
  const timer = setInterval(() => {
    void (async () => {
      try {
        await check()
      } catch (error) {
        onError(error)
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
