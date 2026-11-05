/** Live-default scoped reads preserve handle cleanup and instance-local revision checks. */
import { Context } from '@deepseek-ai/cordis'
import { SESSION_FORMAT_VERSION, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionPersistence, SessionPersistenceRevision, SessionPersistenceReadScopeChangedError } from '../src/index.ts'
import type { SessionHandle, SessionPersistenceSnapshot, SessionPersistenceReadScope, SessionPersistenceListOptions } from '../src/index.ts'

const contexts: Context[] = []
afterEach(async () => { await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose())) })

function fixture() {
  const ctx = new Context()
  contexts.push(ctx)
  const header: SessionPersistenceSnapshot['header'] = { version: SESSION_FORMAT_VERSION, id: SessionId('scoped'), createdAt: 1, isSeeded: false }
  let snapshot: SessionPersistenceSnapshot = { header, revision: SessionPersistenceRevision('first') }
  const read = vi.fn<SessionHandle['read']>(async () => ({ eventState: 'detached', events: [] }))
  const close = vi.fn<SessionHandle['close']>(async () => {})
  const handle: SessionHandle = {
    id: header.id, header, inheritedEventCount: SessionLogOffset(0), access: 'read',
    read, close, append: vi.fn(), flush: vi.fn(), [Symbol.asyncDispose]: vi.fn(),
  }
  class Provider extends SessionPersistence {
    create = vi.fn()
    open = vi.fn(async () => handle)
    flush = vi.fn()
    stat = vi.fn(async () => snapshot)
    list = vi.fn(async (_options?: SessionPersistenceListOptions) => [snapshot])
  }
  const provider = new Provider(ctx)
  return { provider, read, close, ctx, id: header.id,
    replace() { snapshot = { ...snapshot, revision: SessionPersistenceRevision('second') } },
  }
}

it('labels fallback reads live, closes handles, and refuses reads after scope release', async () => {
  const f = fixture()
  let escaped: SessionPersistenceReadScope | undefined
  await f.provider.withReadScope(async (scope) => {
    escaped = scope
    expect(scope.consistency).toBe('live')
    expect((await scope.read(f.id)).events).toEqual([])
    expect(f.close).toHaveBeenCalledOnce()
  })
  await expect(escaped!.read(f.id)).rejects.toMatchObject({ name: 'AbortError' })
})

it('rejects a replaced source instead of returning events under the old listed revision', async () => {
  const f = fixture()
  await f.provider.withReadScope(async (scope) => {
    f.replace()
    await expect(scope.read(f.id)).rejects.toBeInstanceOf(SessionPersistenceReadScopeChangedError)
    expect(f.provider.open).not.toHaveBeenCalled()
  })
})

it('closes a handle when its source changes during the read', async () => {
  const f = fixture()
  f.read.mockImplementation(async () => {
    f.replace()
    return { eventState: 'detached', events: [] }
  })
  await f.provider.withReadScope(async (scope) => {
    await expect(scope.read(f.id)).rejects.toBeInstanceOf(SessionPersistenceReadScopeChangedError)
  })
  expect(f.close).toHaveBeenCalledOnce()
})

it('cancels in-flight reads when the owning service is disposed and awaits their cleanup', async () => {
  const f = fixture()
  const entered = Promise.withResolvers<undefined>()
  f.read.mockImplementation(async (_offset, _length, options) => {
    entered.resolve(undefined)
    const signal = options!.signal!
    await new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => { reject(new Error('synthetic read aborted')) }, { once: true })
    })
    return { eventState: 'detached', events: [] }
  })
  const pass = f.provider.withReadScope(async (scope) => {
    const read = scope.read(f.id)
    await entered.promise
    await f.ctx.fiber.dispose()
    await expect(read).rejects.toMatchObject({ name: 'AbortError' })
  })
  await expect(pass).rejects.toMatchObject({ name: 'AbortError' })
  expect(f.close).toHaveBeenCalledOnce()
})

it('owns discovery before it starts and never calls the consumer after provider disposal', async () => {
  const f = fixture()
  const snapshots = await f.provider.list()
  const entered = Promise.withResolvers<undefined>()
  const aborted = Promise.withResolvers<undefined>()
  const resume = Promise.withResolvers<undefined>()
  f.provider.list.mockImplementation(async (options) => {
    options!.signal!.addEventListener('abort', () => { aborted.resolve(undefined) }, { once: true })
    entered.resolve(undefined)
    await resume.promise
    return snapshots
  })
  const callback = vi.fn(async () => {})
  const pass = f.provider.withReadScope(callback)
  void pass.catch(() => {})
  await entered.promise
  let disposed = false
  const stopping = f.ctx.fiber.dispose().then(() => { disposed = true })
  await aborted.promise
  expect(disposed).toBe(false)
  resume.resolve(undefined)
  await stopping
  await expect(pass).rejects.toMatchObject({ name: 'AbortError' })
  expect(callback).not.toHaveBeenCalled()
})
