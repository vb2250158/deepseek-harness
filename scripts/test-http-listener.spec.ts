import { createServer } from 'node:http'
import { expect, it, onTestFinished, vi } from 'vitest'
import { listenForFetch } from './test-http-listener.ts'

it('releases a Fetch-blocked allocation before serving HTTP on a permitted port', async () => {
  const server = createServer((_request, response) => { response.end('fixture') })
  onTestFinished(async () => {
    vi.restoreAllMocks()
    if (server.listening) await new Promise<void>(resolve => server.close(() => { resolve() }))
  })
  const close = vi.spyOn(server, 'close')
  vi.spyOn(server, 'address').mockReturnValueOnce({ address: '127.0.0.1', family: 'IPv4', port: 6667 })
  await listenForFetch(server)
  expect(close).toHaveBeenCalledOnce()
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('missing fixture address')
  expect(await (await fetch('http://127.0.0.1:' + address.port)).text()).toBe('fixture')
})
