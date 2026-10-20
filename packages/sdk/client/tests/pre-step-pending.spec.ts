/** Both SDKs consume this real-loop trace; only the subprocess protocol peer is scripted. */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createUserMessage, MessageId } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import { createProcessDeepSeekHarness, validatedSessionEvent } from '../src/api.ts'
import type { HarnessNotification } from '../src/index.ts'

const tracePath = fileURLToPath(new URL('./expected/pre-step-pending-trace.json', import.meta.url))
const expectedPath = fileURLToPath(new URL('./expected/pre-step-pending-result.json', import.meta.url))
const fakeRuntime = fileURLToPath(new URL('./fake-runtime.ts', import.meta.url))

it('ends the failed run at its first idle while projecting pending work as a separate turn', async () => {
  const ctx = new Context()
  const trace: HarnessNotification[] = []
  const adapter = new MockAdapter([textResponse('after')])
  try {
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(AgentLoop, { agents: [] })
    ctx.llm.registerAdapter(['mock'], adapter)
    const agent = await ctx.agentLoop.create(SessionId('sdk-pre-step-pending'), { provider: 'mock', model: 'mock' })
    let failed = false
    ctx.on('agent/pre-step', async ({ messages }) => {
      if (!failed) { failed = true; throw new Error('prompt hook broke') }
      return { kind: 'enter' as const, messages }
    })
    ctx.on('agent/error', () => {})
    ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent) trace.push({ method: 'session.status', params: { sessionId: agent.id, status } })
    })
    const relevant = new Set(['turn/start', 'turn/end', 'step/start', 'user/message', 'assistant/message'])
    ctx.on('session/event', (session, event) => {
      if (session === agent.session && relevant.has(event.type)) {
        trace.push({ method: 'session.event', params: { sessionId: agent.id, event } })
      }
    })
    const firstIdle = new Promise<void>((resolve) => {
      const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
        if (subject === agent && status === 'idle') { dispose(); resolve() }
      })
    })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'first' }], source: { kind: 'user' } }))
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'second' }], source: { kind: 'user' } }))
    await firstIdle
    await agent.whenIdle()
    expect(adapter.requests).toHaveLength(1)
    expect(JSON.stringify(adapter.requests[0]?.messages)).toContain('second')
    expect(JSON.stringify(adapter.requests[0]?.messages)).not.toContain('first')
    expect(agent.inbox.nextTurn).toHaveLength(0)
    expect(agent.inbox.nextStep).toHaveLength(0)
  } finally {
    await ctx.fiber.dispose()
  }
  // SDK projection consumes these event fields; volatile frame timing and ids stay outside the fixture.
  const stable = trace.map(notification => notification.method !== 'session.event' ? notification : {
    ...notification,
    params: {
      ...notification.params,
      event: stableEvent(validatedSessionEvent(notification.params.event)),
    },
  })
  await expect(JSON.stringify(stable, null, 2) + '\n').toMatchFileSnapshot(tracePath)
  const harness = createProcessDeepSeekHarness({
    command: process.execPath, args: [fakeRuntime],
    environment: () => ({ ...process.env, FAKE_NOTIFICATION_TRACE: JSON.stringify(stable) }),
    description: 'real-loop pending input projection', initializeTimeoutMs: 5000,
  })
  try {
    await harness.start()
    const subscription = harness.client.subscribeSessionTree('sdk-pre-step-pending')
    try {
      const result = await harness.run('first', { sessionId: 'sdk-pre-step-pending' })
      const notifications: HarnessNotification[] = []
      let idles = 0
      while (idles < 2) {
        const notification = await subscription.next()
        notifications.push(notification)
        if (notification.method === 'session.status' && notification.params.status === 'idle') idles++
      }
      const events = notifications.flatMap(notification => notification.method === 'session.event'
        ? [validatedSessionEvent(notification.params.event)] : [])
      const projection = {
        finalResponse: result.finalResponse,
        runEventTypes: result.events.map(event => event.type),
        runReasons: result.events.filter(event => event.type === 'turn/end').map(event => event.data.reason),
        statuses: notifications.flatMap(notification => notification.method === 'session.status' ? [notification.params.status] : []),
        turns: events.filter(event => event.type === 'turn/start').map(event => event.data.turn),
        reasons: events.filter(event => event.type === 'turn/end').map(event => event.data.reason),
        userTexts: events.filter(event => event.type === 'user/message').flatMap(event => event.data.content.flatMap(block => block.type === 'text' ? [block.text] : [])),
        assistantTexts: events.filter(event => event.type === 'assistant/message').flatMap(event => event.data.message.content.flatMap(block => block.type === 'text' ? [block.text] : [])),
      }
      expect(projection).toEqual(JSON.parse(await readFile(expectedPath, 'utf8')))
    } finally {
      subscription.close()
    }
  } finally {
    await harness.close()
  }
})

/** Keep the event fields read by the two SDK projections, preserving seq and turn ordering. */
function stableEvent(event: SessionEvent): SessionEvent {
  if (event.type === 'assistant/message') return { ...event, time: 0, data: {
    ...event.data, stream: [], message: { ...event.data.message, id: MessageId('assistant-after') },
  } }
  if (event.type === 'user/message') return { ...event, time: 0, data: { ...event.data, id: MessageId('pending-second') } }
  return { ...event, time: 0 }
}
