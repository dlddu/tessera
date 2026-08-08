/**
 * Terminal input→output latency samples (PRD-2, AC2.6).
 *
 * AC2.6 asks that a container backend not "feel like a remote attachment": its
 * terminal input→output delay should be perceptually on par with the host. The
 * only place that whole round trip is visible is the renderer — a keystroke
 * leaves {@link TerminalSurface} for the PTY and the resulting output comes back
 * to the same surface — so the measurement lives here rather than in the main
 * process, which sees only the middle of the trip.
 *
 * The model is deliberately small: {@link recordTerminalInput} marks a workspace
 * as awaiting output, and the first {@link recordTerminalOutput} after it closes
 * one sample and disarms. Output that arrives with nothing pending (a background
 * process printing on its own) is ignored, so idle chatter can't fake a sample,
 * and a burst of keystrokes measures from the first one rather than counting the
 * same output several times.
 *
 * Reported latency is the **median** of the last {@link MAX_SAMPLES}: a single
 * scheduling hiccup or a command that happens to print slowly shouldn't move the
 * number a user reads as "how responsive is this backend".
 *
 * `now` is injected everywhere (no clock in this module), exactly as
 * {@link terminalScrollbackRegistry}'s throttle does, so the whole thing is
 * exercisable as a pure function in the node test environment.
 */

/** How many recent round trips the reported median is taken over. */
export const MAX_SAMPLES = 20

/**
 * The mockup's responsiveness target (M-J2-S6: "호스트에 준하는 체감 응답성
 * (목표 < 16 ms)") — one display frame at 60Hz, i.e. output lands in the same
 * frame the keystroke would have painted in.
 */
export const LATENCY_TARGET_MS = 16

/** workspaceId → epoch ms of the keystroke we're waiting on output for. */
const pending = new Map<string, number>()
/** workspaceId → recent round-trip samples in ms (most recent last). */
const samples = new Map<string, number[]>()

/**
 * Note that input was just sent for a workspace's terminal. Repeated calls while
 * a sample is already pending keep the *earliest* timestamp: the user is still
 * waiting on that first keystroke, and measuring from the newest one would
 * under-report the delay they actually feel.
 */
export function recordTerminalInput(workspaceId: string, now: number): void {
  if (pending.has(workspaceId)) return
  pending.set(workspaceId, now)
}

/**
 * Note that output arrived for a workspace's terminal, closing the pending round
 * trip if there is one. Returns the sample in ms, or `null` when nothing was
 * pending (unsolicited output) — the caller needs no branching either way.
 */
export function recordTerminalOutput(workspaceId: string, now: number): number | null {
  const startedAt = pending.get(workspaceId)
  if (startedAt === undefined) return null
  pending.delete(workspaceId)
  // A non-monotonic clock (or a same-tick round trip) floors at 0 rather than
  // poisoning the median with a negative sample.
  const elapsed = Math.max(0, now - startedAt)
  const list = samples.get(workspaceId) ?? []
  list.push(elapsed)
  if (list.length > MAX_SAMPLES) list.splice(0, list.length - MAX_SAMPLES)
  samples.set(workspaceId, list)
  return elapsed
}

/**
 * Median round-trip latency in ms over the retained samples, or `null` when the
 * workspace has none yet (a terminal nobody has typed into). Even counts take
 * the mean of the two middle samples.
 */
export function terminalLatencyMs(workspaceId: string): number | null {
  const list = samples.get(workspaceId)
  if (!list || list.length === 0) return null
  const sorted = [...list].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/**
 * How full the mockup's responsiveness gauge should be, as a 0–1 fraction. At or
 * under {@link LATENCY_TARGET_MS} the gauge is full (the bar reads "as good as
 * the host"), and it falls off inversely from there, reaching 0 at four times
 * the target. `null` latency yields 0 — nothing measured, nothing claimed.
 */
export function latencyGaugeFraction(latencyMs: number | null): number {
  if (latencyMs === null || !Number.isFinite(latencyMs)) return 0
  if (latencyMs <= LATENCY_TARGET_MS) return 1
  const worst = LATENCY_TARGET_MS * 4
  if (latencyMs >= worst) return 0
  return (worst - latencyMs) / (worst - LATENCY_TARGET_MS)
}

/** Drop a workspace's samples (its last terminal went away, or it closed). */
export function forgetTerminalLatency(workspaceId: string): void {
  pending.delete(workspaceId)
  samples.delete(workspaceId)
}

/** Test-only: clear all registry state between cases. */
export function __resetTerminalLatencyRegistry(): void {
  pending.clear()
  samples.clear()
}
