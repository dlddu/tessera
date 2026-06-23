import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UPDATE_CHECK_INTERVAL_MS, startPeriodicUpdateCheck } from '@main/update/periodicCheck'

describe('startPeriodicUpdateCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('defaults to a 5-minute interval', () => {
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(5 * 60 * 1000)
  })

  it('waits one interval before the first check, then checks each interval', async () => {
    const check = vi.fn().mockResolvedValue(undefined)
    const stop = startPeriodicUpdateCheck(check, 1000)

    // Nothing fires immediately — the launch-time check is initUpdater's job.
    expect(check).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1000)
    expect(check).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(2000)
    expect(check).toHaveBeenCalledTimes(3)

    stop()
  })

  it('uses the 5-minute default when no interval is given', async () => {
    const check = vi.fn().mockResolvedValue(undefined)
    const stop = startPeriodicUpdateCheck(check)

    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS - 1)
    expect(check).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledTimes(1)

    stop()
  })

  it('stops polling after the disposer runs, and the disposer is idempotent', async () => {
    const check = vi.fn().mockResolvedValue(undefined)
    const stop = startPeriodicUpdateCheck(check, 1000)

    await vi.advanceTimersByTimeAsync(1000)
    expect(check).toHaveBeenCalledTimes(1)

    stop()
    stop() // second call must not throw or schedule anything

    await vi.advanceTimersByTimeAsync(5000)
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('swallows a rejected check so the timer keeps polling', async () => {
    const check = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValue(undefined)
    const stop = startPeriodicUpdateCheck(check, 1000)

    await vi.advanceTimersByTimeAsync(1000) // rejects — must not crash
    await vi.advanceTimersByTimeAsync(1000) // resolves
    expect(check).toHaveBeenCalledTimes(2)

    stop()
  })

  it('swallows a synchronous throw from the check', async () => {
    const check = vi.fn<() => Promise<unknown>>(() => {
      throw new Error('boom')
    })
    const stop = startPeriodicUpdateCheck(check, 1000)

    await vi.advanceTimersByTimeAsync(1000)
    expect(check).toHaveBeenCalledTimes(1)

    stop()
  })
})
