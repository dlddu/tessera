import { afterEach, describe, expect, it } from 'vitest'
import { connect } from 'node:net'
import { IpcChannels } from '@shared/ipc'
// Import the routing pieces directly (not the barrel, which re-exports the
// electron-bound `registerRoutingIpc`) so this runs in a plain node env.
import { RoutingChannel } from '@main/routing/RoutingChannel'
import { BrowserRouter } from '@main/routing/BrowserRouter'

/** Bind to loopback in tests (the vmnet gateway isn't reachable here). */
const LOCAL = { bindHost: '127.0.0.1', advertiseHost: '127.0.0.1' } as const

/** Open a connection, write `payload`, resolve when the server half-closes. */
function post(port: number, payload: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: '127.0.0.1', port }, () => socket.write(payload))
    socket.on('close', () => resolve())
    socket.on('error', reject)
  })
}

/** Let any synchronous onUrl handlers settle after a post resolves. */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5))

describe('RoutingChannel', () => {
  const open: RoutingChannel[] = []
  afterEach(() => {
    for (const channel of open.splice(0)) channel.close()
  })

  async function listen(onUrl: (url: string) => void): Promise<RoutingChannel> {
    const channel = new RoutingChannel(onUrl, LOCAL)
    open.push(channel)
    await channel.listen()
    return channel
  }

  it('delivers a token-authenticated JSON line as a URL', async () => {
    const urls: string[] = []
    const channel = await listen((url) => urls.push(url))
    const { port, token } = channel.endpointInfo!

    await post(port, JSON.stringify({ token, url: 'https://idp.acme.dev/authorize' }) + '\n')
    await tick()

    expect(urls).toEqual(['https://idp.acme.dev/authorize'])
  })

  it('advertises the configured gateway host + a random port and token', async () => {
    const channel = await listen(() => {})
    const endpoint = channel.endpointInfo!
    expect(endpoint.host).toBe('127.0.0.1')
    expect(endpoint.port).toBeGreaterThan(0)
    // 16 random bytes → 32 hex chars.
    expect(endpoint.token).toMatch(/^[0-9a-f]{32}$/)
  })

  it('drops a line whose token does not match (isolation, AC3.5)', async () => {
    const urls: string[] = []
    const channel = await listen((url) => urls.push(url))
    const { port } = channel.endpointInfo!

    await post(port, JSON.stringify({ token: 'wrong-token', url: 'https://evil.example' }) + '\n')
    await tick()

    expect(urls).toEqual([])
  })

  it('ignores a malformed line and a line missing a url', async () => {
    const urls: string[] = []
    const channel = await listen((url) => urls.push(url))
    const { port, token } = channel.endpointInfo!

    await post(port, 'not json at all\n')
    await post(port, JSON.stringify({ token }) + '\n')
    await tick()

    expect(urls).toEqual([])
  })

  it('closing the channel stops listening', async () => {
    const channel = await listen(() => {})
    const { port } = channel.endpointInfo!
    channel.close()
    expect(channel.endpointInfo).toBeNull()
    await expect(post(port, 'x\n')).rejects.toMatchObject({ code: expect.stringMatching(/ECONN/) })
  })
})

describe('BrowserRouter', () => {
  const routers: BrowserRouter[] = []
  afterEach(() => {
    for (const router of routers.splice(0)) router.closeAll()
  })

  function makeRouter() {
    const emitted: Array<{ channel: string; payload: unknown }> = []
    const router = new BrowserRouter({ channel: LOCAL })
    router.setEmitter((channel, payload) => emitted.push({ channel, payload }))
    routers.push(router)
    return { router, emitted }
  }

  it('emits routing.openUrl for an http(s) URL, tagged with its workspace', () => {
    const { router, emitted } = makeRouter()
    router.openUrlOnHost('ws-1', 'https://example.com/path')
    expect(emitted).toEqual([
      {
        channel: IpcChannels.routing.openUrl,
        payload: { workspaceId: 'ws-1', url: 'https://example.com/path' }
      }
    ])
  })

  it('drops non-web schemes and malformed URLs (no emit)', () => {
    const { router, emitted } = makeRouter()
    router.openUrlOnHost('ws-1', 'file:///etc/passwd')
    router.openUrlOnHost('ws-1', 'javascript:alert(1)')
    router.openUrlOnHost('ws-1', 'not a url')
    expect(emitted).toEqual([])
  })

  it('does not emit before an emitter is attached', () => {
    const router = new BrowserRouter({ channel: LOCAL })
    routers.push(router)
    // No throw, no sink — simply dropped.
    expect(() => router.openUrlOnHost('ws-1', 'https://example.com')).not.toThrow()
  })

  it('ensureChannel is idempotent per workspace (same endpoint)', async () => {
    const { router } = makeRouter()
    const a = await router.ensureChannel('ws-1')
    const b = await router.ensureChannel('ws-1')
    expect(b).toEqual(a)
    expect(a.port).toBeGreaterThan(0)
  })

  it('routes a guest post on a workspace channel to that workspace only (AC3.5)', async () => {
    const { router, emitted } = makeRouter()
    const one = await router.ensureChannel('ws-one')
    const two = await router.ensureChannel('ws-two')
    expect(one.port).not.toBe(two.port)

    // Post to ws-two's channel with ITS token → emitted as ws-two.
    await post(two.port, JSON.stringify({ token: two.token, url: 'https://two.example' }) + '\n')
    // A cross-token post to ws-one (ws-two's token) is rejected — no leak.
    await post(one.port, JSON.stringify({ token: two.token, url: 'https://leak.example' }) + '\n')
    await tick()

    expect(emitted).toEqual([
      {
        channel: IpcChannels.routing.openUrl,
        payload: { workspaceId: 'ws-two', url: 'https://two.example' }
      }
    ])
  })

  it('closeChannel tears down a workspace listener', async () => {
    const { router } = makeRouter()
    const endpoint = await router.ensureChannel('ws-1')
    router.closeChannel('ws-1')
    await expect(post(endpoint.port, 'x\n')).rejects.toMatchObject({
      code: expect.stringMatching(/ECONN/)
    })
  })
})
