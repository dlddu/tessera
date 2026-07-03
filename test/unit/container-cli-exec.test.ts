import { describe, expect, it } from 'vitest'
import { defaultExec } from '@main/backend/ContainerRuntime'

/**
 * defaultExec runs one-shot CLI commands with file-bound stdio — never Node's
 * socketpair pipes, whose terminal probing kills `container machine run` with
 * "Operation not supported on socket" (M-J2-S3). These tests drive it against
 * real host binaries (sh/cat, present on macOS and the Linux CI) to prove the
 * plumbing itself: stdout capture, stdin delivery + immediate EOF, the
 * execFile-shaped failure object, and ENOENT for a missing binary.
 */
describe('defaultExec — file-stdio CLI runner', () => {
  it('captures stdout from a real process', async () => {
    const exec = defaultExec('/bin/sh')

    const { stdout } = await exec(['-c', 'printf hello'])

    expect(stdout).toBe('hello')
  })

  it('delivers `input` on stdin, and EOFs immediately without input', async () => {
    const exec = defaultExec('/bin/cat')

    expect((await exec([], 'from stdin')).stdout).toBe('from stdin')
    // No input → empty stdin file → cat sees EOF at once instead of hanging.
    expect((await exec([])).stdout).toBe('')
  })

  it('base64 round-trips bytes through the write-path shape (`base64 -d` + stdin)', async () => {
    const exec = defaultExec('/bin/sh')
    const raw = 'héllo, 월드'
    const encoded = Buffer.from(raw, 'utf8').toString('base64')

    const { stdout } = await exec(['-c', 'base64 -d'], encoded)

    expect(stdout).toBe(raw)
  })

  it('rejects with the exit code, stderr, and a "Command failed" message', async () => {
    const exec = defaultExec('/bin/sh')

    await expect(exec(['-c', 'echo oops >&2; exit 3'])).rejects.toMatchObject({
      code: 3,
      stderr: expect.stringContaining('oops'),
      message: expect.stringContaining('Command failed')
    })
  })

  it('keeps ENOENT so a missing binary maps to "runtime unavailable"', async () => {
    const exec = defaultExec('/no/such/tessera-binary')

    await expect(exec([])).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
