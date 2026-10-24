import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DesktopSharedWebBackend, readSharedWebBackendConfig } from '../src/shared-web-backend.ts'

const stringify = JSON.stringify

it('declines original-file authorization without requesting or interpreting a renderer resource', async () => {
  const fetch = vi.fn()
  vi.stubGlobal('fetch', fetch)
  const backend = new DesktopSharedWebBackend('unused', {
    url: 'http://127.0.0.1:3180/', timeoutMs: 1000, cookieLifetimeMs: 1000,
  })
  expect(await backend.resolveDragResource('file:///private/local-file')).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
  const aborted = new AbortController()
  aborted.abort()
  await expect(backend.resolveDragResource('resource', aborted.signal)).rejects.toThrow()
  await backend.stop()
  await expect(backend.resolveDragResource('resource')).rejects.toThrow()
})
const roots: string[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function home(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-shared-web-'))
  roots.push(root)
  return root
}

it('retains owned startup when no shared backend is selected and reads explicit machine-local settings', async () => {
  const root = await home()
  expect(await readSharedWebBackendConfig(root, {})).toBeUndefined()
  await writeFile(join(root, 'desktop-backend.json'), JSON.stringify({ mode: 'web', url: 'http://127.0.0.1:3180' }))
  expect(await readSharedWebBackendConfig(root, {})).toEqual({ url: 'http://127.0.0.1:3180/', timeoutMs: 10_000, cookieLifetimeMs: 60_000 })
  expect((await readSharedWebBackendConfig(root, { DSH_DESKTOP_WEB_BACKEND_URL: 'http://127.0.0.1:4190/' }))?.url).toBe('http://127.0.0.1:4190/')
})

it.each([
  'http://remote.example/', 'http://127.0.0.1:3180/?token=secret', 'http://user:secret@127.0.0.1:3180/',
  'http://127.0.0.1:3180/path', 'file:///private', 'invalid',
])('rejects an unsafe endpoint without echoing its input: %s', async (url) => {
  await expect(readSharedWebBackendConfig(await home(), { DSH_DESKTOP_WEB_BACKEND_URL: url }))
    .rejects.toThrow(/invalid endpoint|clean loopback/)
})

it('rejects malformed settings and invalid time limits', async () => {
  const root = await home()
  for (const config of [null, { mode: 'unknown', url: 'http://127.0.0.1:3180/' }, { mode: 'web', url: 'http://127.0.0.1:3180/', timeoutMs: 0 }, { mode: 'web', url: 'http://127.0.0.1:3180/', token: 'forbidden' }]) {
    await writeFile(join(root, 'desktop-backend.json'), JSON.stringify(config))
    await expect(readSharedWebBackendConfig(root, {})).rejects.toThrow(/invalid connection/)
  }
})

it('uses the existing signing record without changing credentials, and detaches without server task controls', async () => {
  const root = await home()
  const source = stringify({ version: 1, refs: {}, records: { 'client-connection/browser-session': { kind: 'grant', payload: { version: 1, secret: Buffer.alloc(32, 7).toString('base64url') } } } })
  await writeFile(join(root, '.credentials.yaml'), source)
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('Web document'))
  vi.stubGlobal('fetch', send)
  const config = await readSharedWebBackendConfig(root, { DSH_DESKTOP_WEB_BACKEND_URL: 'http://127.0.0.1:3180/' })
  if (!config) throw new Error('Missing test configuration')
  const backend = new DesktopSharedWebBackend(root, config)
  expect(await backend.start()).toEqual({ url: config.url, injections: [] })
  expect(new Headers(send.mock.calls[0]?.[1]?.headers).get('cookie')).toMatch(/^dsh-auth-/)
  expect(await readFile(join(root, '.credentials.yaml'), 'utf8')).toBe(source)
  expect(() => backend.request('http://127.0.0.1:4190/')).toThrow('another origin')
  for (const action of ['inspect', 'lock', 'unlock'] as const) expect(await backend.updateTasks(action)).toBe(false)
  expect(await backend.inspectQuit()).toEqual({ activeTasks: false, scheduledTasks: false })
  await backend.stop(true)
  expect(send).toHaveBeenCalledTimes(1)
  expect(send.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
  expect(() => backend.cookie()).toThrow('credential is missing')
})

it('fails on missing credentials or authentication refusal without starting another backend', async () => {
  const root = await home()
  const config = { url: 'http://127.0.0.1:3180/', timeoutMs: 1000, cookieLifetimeMs: 1000 }
  const send = vi.fn<typeof fetch>().mockResolvedValue(new Response('unauthorized', { status: 401 }))
  vi.stubGlobal('fetch', send)
  await writeFile(join(root, '.credentials.yaml'), stringify({ version: 1, refs: {}, records: {} }))
  await expect(new DesktopSharedWebBackend(root, config).start()).rejects.toThrow('credential is missing')
  expect(send).not.toHaveBeenCalled()
  await writeFile(join(root, '.credentials.yaml'), stringify({ version: 1, refs: {}, records: { 'client-connection/browser-session': { kind: 'grant', payload: { version: 1, secret: Buffer.alloc(32, 7).toString('base64url') } } } }))
  const backend = new DesktopSharedWebBackend(root, config)
  await expect(backend.start()).rejects.toThrow('authentication failed')
  await backend.stop()
  expect(send).toHaveBeenCalledTimes(1)
})
