/** Default metadata views over a current snapshot provider. */
import { Context } from '@deepseek-ai/cordis'
import { SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it, vi } from 'vitest'
import SessionPersistence, { SessionPersistenceRevision } from '../src/index.ts'
import type {
  SessionAccess, SessionHandle, SessionPersistenceCreateOptions, SessionPersistenceListOptions,
  SessionPersistenceOpenOptions, SessionPersistenceSnapshot, SessionPersistenceStatOptions,
} from '../src/index.ts'

class SnapshotPersistence extends SessionPersistence {
  readonly create = vi.fn<(_header: SessionPersistenceSnapshot['header'], _options?: SessionPersistenceCreateOptions) => Promise<SessionHandle>>()
  readonly open = vi.fn<(_id: SessionId, _access: SessionAccess, _options?: SessionPersistenceOpenOptions) => Promise<SessionHandle>>()
  readonly flush = vi.fn<() => Promise<void>>()
  readonly stat = vi.fn<(_id: SessionId, _options?: SessionPersistenceStatOptions) => Promise<SessionPersistenceSnapshot | undefined>>()
  readonly list = vi.fn<(_options?: SessionPersistenceListOptions) => Promise<readonly SessionPersistenceSnapshot[]>>()
}

function snapshot(id: string): SessionPersistenceSnapshot {
  return {
    header: { version: SESSION_FORMAT_VERSION, id: SessionId(id), createdAt: 1, isSeeded: false },
    formatStatus: 'migration-required', revision: SessionPersistenceRevision(`snapshot:${id}`),
    eventCount: 3, sizeBytes: 42, modifiedAt: 10, location: { kind: 'jsonl', path: `/store/${id}` },
  }
}

describe('SessionPersistence metadata defaults', () => {
  it('projects only one header and optional format status while forwarding point-read options', async () => {
    const ctx = new Context()
    try {
      const provider = new SnapshotPersistence(ctx)
      const stored = snapshot('single')
      const options = { signal: new AbortController().signal }
      provider.stat.mockResolvedValueOnce(stored)
        .mockResolvedValueOnce({ header: stored.header, revision: stored.revision })
        .mockResolvedValueOnce(undefined)
      expect(await provider.readMetadata(stored.header.id, options)).toStrictEqual({
        header: stored.header, formatStatus: 'migration-required',
      })
      expect(provider.stat).toHaveBeenNthCalledWith(1, stored.header.id, options)
      expect(await provider.readMetadata(stored.header.id)).toStrictEqual({ header: stored.header })
      expect(await provider.readMetadata(SessionId('missing'))).toBeUndefined()
      expect(provider.stat).toHaveBeenNthCalledWith(3, SessionId('missing'), undefined)
      expect(provider.open).not.toHaveBeenCalled()
      expect(provider.list).not.toHaveBeenCalled()
    } finally { await ctx.fiber.dispose() }
  })

  it('projects a list without revision or artifact fields and preserves absent format status', async () => {
    const ctx = new Context()
    try {
      const provider = new SnapshotPersistence(ctx)
      const first = snapshot('first')
      const second = { header: snapshot('second').header, revision: SessionPersistenceRevision('second') }
      const options = { signal: new AbortController().signal }
      provider.list.mockResolvedValue([first, second])
      expect(await provider.listMetadata(options)).toStrictEqual([
        { header: first.header, formatStatus: 'migration-required' }, { header: second.header },
      ])
      expect(provider.list).toHaveBeenCalledExactlyOnceWith(options)
      expect(provider.open).not.toHaveBeenCalled()
      expect(provider.stat).not.toHaveBeenCalled()
    } finally { await ctx.fiber.dispose() }
  })

  it('preserves point and list backend failures including exact cancellation reasons', async () => {
    const ctx = new Context()
    try {
      const provider = new SnapshotPersistence(ctx)
      const reason = new Error('metadata read cancelled')
      const pointOptions = { signal: AbortSignal.abort(reason) }
      provider.stat.mockRejectedValue(reason)
      await expect(provider.readMetadata(SessionId('cancelled'), pointOptions)).rejects.toBe(reason)
      expect(provider.stat).toHaveBeenCalledExactlyOnceWith(SessionId('cancelled'), pointOptions)
      const failure = Object.assign(new Error('metadata listing denied'), { code: 'EACCES' })
      provider.list.mockRejectedValue(failure)
      await expect(provider.listMetadata()).rejects.toBe(failure)
      expect(provider.list).toHaveBeenCalledExactlyOnceWith(undefined)
      expect(provider.open).not.toHaveBeenCalled()
    } finally { await ctx.fiber.dispose() }
  })
})
