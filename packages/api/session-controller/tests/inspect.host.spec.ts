/** Agent-free inspection of attached and stored Session prefixes. */
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore, { SESSION_FORMAT_VERSION, SessionId, SessionSeq, type SessionHeader } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { describe, expect, it, vi } from 'vitest'
import { createSessionTestController, testSessionPersistence } from './test-remote.ts'

describe('Session inspection', () => {
  it.each(['attached', 'stored'] as const)('reads the %s prefix without activating or repairing an Agent', async (mode) => {
    const ctx = new Context()
    try {
      await ctx.plugin(SessionStore)
      await ctx.plugin(SessionProjectionRegistry)
      await ctx.plugin(AgentRegistry)
      const id = SessionId(`inspect-${mode}`)
      const meta = { version: SESSION_FORMAT_VERSION, id, isSeeded: false, cwd: '/project', createdAt: 1 } satisfies SessionHeader
      const events = [{ type: 'turn/start' as const, seq: SessionSeq(0), time: 2, data: { turn: 1 } }]
      const read = vi.fn(async () => ({ meta, events }))
      ctx.provide('sessionPersistence', testSessionPersistence(ctx, { list: async () => [meta], inspect: read }) as never)
      if (mode === 'attached') {
        const session = ctx.sessions.create(id, { meta: { cwd: meta.cwd, createdAt: meta.createdAt } })
        session.append('turn/start', { turn: 1 })
      }
      const controller = await createSessionTestController(ctx, {
        defaultModelSelection: () => ({ provider: 'test', model: 'test' }), cwd: '/project',
      })
      const observed = await controller.inspect(id)
      expect(observed.meta.id).toBe(id)
      expect(observed.events).toHaveLength(1)
      expect(observed.events[0]?.type).toBe('turn/start')
      expect(ctx.agents.get(id)).toBeUndefined()
      expect(ctx.sessions.get(id) === undefined).toBe(mode === 'stored')
      expect(read).toHaveBeenCalledTimes(mode === 'stored' ? 1 : 0)
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
