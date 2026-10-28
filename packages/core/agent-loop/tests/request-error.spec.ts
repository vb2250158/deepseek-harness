import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import LlmRuntime, { createUserMessage, LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, PreparedAdapterCall, LlmFailure, ResolvedRetryPolicy } from '@deepseek-ai/dsh-llm'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { MockAdapter, textResponse } from './mock-adapter.ts'

async function harness(adapter: LlmAdapter): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['mock'], adapter)
  return ctx
}

function fail(message: string, code: string): () => never {
  return () => {
    throw new LlmError(message, code)
  }
}

/** Fails preparation once after a second follow-up has reached the inbox. */
class DelayedPreparationFailureAdapter extends LlmAdapter {
  readonly preparationStarted = Promise.withResolvers<true>()
  readonly failPreparation = Promise.withResolvers<true>()
  readonly requests: GenerateOptions[] = []
  private attempts = 0

  override async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    this.attempts += 1
    if (this.attempts === 1) {
      this.preparationStarted.resolve(true)
      await this.failPreparation.promise
      throw new LlmError('model service is unavailable', 'SERVICE_UNAVAILABLE')
    }
    return super.prepareCall(provider, model, signal)
  }

  async * stream(options: GenerateOptions) {
    this.requests.push(options)
    yield* textResponse('recovered')
  }
}

/** Fails a live request only after its pending follow-up has been queued. */
class DelayedRequestFailureAdapter extends LlmAdapter {
  readonly requestStarted = Promise.withResolvers<true>()
  readonly failRequest = Promise.withResolvers<true>()
  readonly requests: GenerateOptions[] = []

  async * stream(options: GenerateOptions) {
    this.requests.push(options)
    if (this.requests.length === 1) {
      this.requestStarted.resolve(true)
      await this.failRequest.promise
      throw new LlmError('request failed after admission', 'SERVICE_UNAVAILABLE')
    }
    yield* textResponse('recovered')
  }
}

/** Replay the complete durable log and retain the admission and turn outcome trace. */
function admissionTrace(session: Session) {
  const replay = Session.create(session.id, session.snapshotEvents())
  expect(replay.deriveMessages()).toEqual(session.deriveMessages())
  return replay.snapshotEvents().map((event) => {
    switch (event.type) {
      case 'turn/start': return { type: event.type, seq: event.seq, turn: event.data.turn }
      case 'turn/end': return { type: event.type, seq: event.seq, turn: event.data.turn, reason: event.data.reason.kind }
      case 'user/message': return { type: event.type, seq: event.seq, source: event.data.source.kind, content: event.data.content }
      case 'assistant/message': return { type: event.type, seq: event.seq, content: event.data.message.content }
      // Request metadata and process-local identities do not change input admission or turn outcomes.
      default: return undefined
    }
  }).filter(event => event !== undefined)
}

describe('agent/request-error', () => {
  it.each(['user', 'runtime-context'] as const)('waits for an explicit wake after admitting %s input before a request failure', async (source) => {
    const adapter = new DelayedRequestFailureAdapter()
    const ctx = await harness(adapter)
    try {
      if (source === 'runtime-context') {
        ctx.systemPrompt.context({ name: 'test-admission', order: 0, text: 'retained runtime context' })
        ctx.on('agent/pre-step', async ({ turn }, next) => {
          const decision = await next()
          if (turn !== 1 || decision.kind !== 'enter') return decision
          return { ...decision, messages: decision.messages.filter(message => message.source.kind === 'runtime-context') }
        })
      }
      const agent = await ctx.agentLoop.create(SessionId('request-error-admitted-' + source), { provider: 'mock', model: 'mock' })
      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'first' }], source: { kind: 'user' } }))
      await adapter.requestStarted.promise
      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'second' }], source: { kind: 'user' } }))
      adapter.failRequest.resolve(true)
      await agent.whenIdle()
      expect(adapter.requests).toHaveLength(1)
      const beforeExplicitWake = admissionTrace(agent.session)
      agent.followup(createUserMessage({ content: [{ type: 'text', text: 'explicit wake' }], source: { kind: 'user' } }))
      await agent.whenIdle()
      expect(adapter.requests).toHaveLength(3)
      expect({ beforeExplicitWake, afterExplicitWake: admissionTrace(agent.session) }).toMatchSnapshot()
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('replays a follow-up queued while preparation fails', async () => {
    const adapter = new DelayedPreparationFailureAdapter()
    const ctx = await harness(adapter)
    const agent = await ctx.agentLoop.create(SessionId('request-error-queued-follow-up'), { provider: 'mock', model: 'mock' })
    const messages: string[] = []
    const reasons: string[] = []
    ctx.on('session/event', (session, event) => {
      if (session !== agent.session) return
      if (event.type === 'user/message' && event.data.content[0]?.type === 'text') messages.push(event.data.content[0].text)
      if (event.type === 'turn/end') reasons.push(event.data.reason.kind)
    })

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'first' }], source: { kind: 'user' } }))
    await adapter.preparationStarted.promise
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'second' }], source: { kind: 'user' } }))
    adapter.failPreparation.resolve(true)
    await agent.whenIdle()

    expect(adapter.requests).toHaveLength(1)
    expect(messages).toEqual(['second'])
    expect(reasons).toEqual(['error', 'completed'])
  })

  it('does not offer middleware failures to request recovery', async () => {
    const adapter = new MockAdapter([textResponse('unused')])
    const ctx = await harness(adapter)
    const agent = await ctx.agentLoop.create(SessionId('request-error-narrow'), { provider: 'mock', model: 'mock' })
    let recoveries = 0
    ctx.on('agent/request', () => {
      throw new LlmError('middleware failed', 'MIDDLEWARE')
    })
    ctx.on('agent/request-error', async () => {
      recoveries += 1
    })

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await agent.whenIdle()

    expect(recoveries).toBe(0)
    expect(adapter.requests).toHaveLength(0)
  })

  it('lets each failed request return a retry action before its turn closes', async () => {
    const adapter = new MockAdapter([
      fail('busy', 'RATE_LIMIT'),
      fail('unavailable', 'SERVICE_UNAVAILABLE'),
      textResponse('ok'),
    ])
    const ctx = await harness(adapter)
    const agent = await ctx.agentLoop.create(SessionId('request-error-retry'), { provider: 'mock', model: 'mock' })
    const seen: {
      turn: number
      step: number
      failure: LlmFailure
      retryPolicy: ResolvedRetryPolicy | undefined
    }[] = []
    const statuses: string[] = []
    ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent) statuses.push(status)
    })
    ctx.on('agent/request-error', async ({ agent: subject, turn, step, failure, retryPolicy }) => {
      expect(subject).toBe(agent)
      seen.push({ turn, step, failure, retryPolicy })
      return { kind: 'retry' }
    })

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await agent.whenIdle()

    expect(seen.map(item => ({
      turn: item.turn,
      step: item.step,
      code: item.failure.code,
    }))).toEqual([
      {
        turn: 1,
        step: 1,
        code: 'RATE_LIMIT',
      },
      {
        turn: 1,
        step: 1,
        code: 'SERVICE_UNAVAILABLE',
      },
    ])
    expect(agent.session.snapshotEvents().filter(event => event.type === 'turn/start')).toHaveLength(1)
    expect(seen.map(item => item.retryPolicy)).toEqual([
      expect.objectContaining({ mode: 'normal' }),
      expect.objectContaining({ mode: 'normal' }),
    ])
    expect(statuses).toEqual(['running', 'idle'])
    expect(agent.session.snapshotEvents().flatMap(event =>
      event.type === 'request/header' ? [event.data.reason] : [])).toEqual(['initial'])
  })

  it('lets cancellation win over a retry action', async () => {
    const adapter = new MockAdapter([fail('busy', 'RATE_LIMIT'), textResponse('unused')])
    const ctx = await harness(adapter)
    const agent = await ctx.agentLoop.create(SessionId('request-error-cancel'), { provider: 'mock', model: 'mock' })
    ctx.on('agent/request-error', async ({ agent: subject }) => {
      subject.cancel({ kind: 'user' })
      return { kind: 'retry' }
    })

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await agent.whenIdle()

    expect(adapter.requests).toHaveLength(1)
    expect(agent.session.snapshotEvents().filter(event => event.type === 'turn/start')).toHaveLength(1)
    expect(agent.session.snapshotEvents().find(event => event.type === 'turn/end')).toMatchObject({
      type: 'turn/end',
      data: { reason: { kind: 'aborted', reason: { kind: 'user' } } },
    })
  })

  it('does not retry when the recovery listener fails before returning its action', async () => {
    const adapter = new MockAdapter([fail('busy', 'RATE_LIMIT'), textResponse('unused')])
    const ctx = await harness(adapter)
    const agent = await ctx.agentLoop.create(SessionId('request-error-recovery-failed'), {
      provider: 'mock',
      model: 'mock',
    })
    ctx.on('agent/request-error', async () => {
      throw new Error('recovery failed')
    })

    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'go' }], source: { kind: 'user' } }))
    await agent.whenIdle()

    expect(adapter.requests).toHaveLength(1)
    expect(agent.session.snapshotEvents().filter(event => event.type === 'turn/start')).toHaveLength(1)
    expect(agent.session.snapshotEvents().find(event => event.type === 'turn/end')).toMatchObject({
      type: 'turn/end',
      data: { reason: { kind: 'error' } },
    })
  })
})
