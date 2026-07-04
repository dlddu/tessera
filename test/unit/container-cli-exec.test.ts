import { describe, expect, it } from 'vitest'
import { defaultExec } from '@main/backend/ContainerRuntime'

/**
 * defaultExec runs the management CLI one-shots (`system start` / `machine
 * create` / `inspect`) with file-bound stdio — never Node's socketpair pipes,
 * which some CLI stdio probing chokes on ("Operation not supported on socket",
 * M-J2-S3). `machine run` one-shots don't come through here at all; they need
 * a real terminal and ride the exec PTY. These tests drive the runner against
 * real host binaries (sh/cat, present on macOS and the Linux CI) to prove the
 * plumbing itself: stdout capture, immediate stdin EOF, the execFile-shaped
 * failure object, and ENOENT for a missing binary.
 */
describe('defaultExec — file-stdio CLI runner', () => {
  it('captures stdout from a real process', async () => {
    const exec = defaultExec('/bin/sh')

    const { stdout } = await exec(['-c', 'printf hello'])

    expect(stdout).toBe('hello')
  })

  it('gives commands immediate stdin EOF instead of a hang', async () => {
    const exec = defaultExec('/bin/cat')

    expect((await exec([])).stdout).toBe('')
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
