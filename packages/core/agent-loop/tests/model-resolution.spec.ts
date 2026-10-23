import { expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent, type ModelSelection } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage, LlmError } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as NativeToolExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { MockAdapter, textResponse } from './mock-adapter.ts'

async function harness(adapter: MockAdapter) {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NativeToolExecutor)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['source', 'target'], adapter)
  return ctx
}

async function prompt(agent: Agent, text: string): Promise<void> {
  agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
  await agent.whenIdle()
}

it('shares one effective route with tools, assembly and the header, then restores the original choice when routing ends', async () => {
  const adapter = new MockAdapter([textResponse('first'), textResponse('second'), textResponse('third')])
  const ctx = await harness(adapter)
  try {
    let enabled = true
    let destination = 'first-target'
    ctx.on('agent/resolve-model', async ({ agent, sourceSelection }, next) => {
      const selection = await next()
      if (!enabled) return selection
      agent.model.select(sourceSelection)
      return { ...selection, provider: 'target', model: destination }
    })
    const tools = vi.spyOn(ctx.tools, 'resolve')
    const assemble = ctx.systemPrompt.assemble.bind(ctx.systemPrompt)
    const assembled: Readonly<ModelSelection>[] = []
    vi.spyOn(ctx.systemPrompt, 'assemble').mockImplementation(async (input) => {
      if (input?.modelSelection !== undefined) assembled.push(input.modelSelection)
      destination = 'second-target'
      return assemble(input)
    })
    const agent = await ctx.agentLoop.create(SessionId('step-model-route'), { provider: 'source', model: 'original' })
    const headers: { provider: string; model: string }[] = []
    for (const text of ['one', 'two', 'three']) {
      if (text === 'three') enabled = false
      await prompt(agent, text)
      const config = agent.session.requestHeader()?.config
      if (config === undefined) throw new Error('No model request was recorded')
      headers.push({ provider: config.provider, model: config.model })
      expect(agent.model.current()).toEqual({ provider: 'source', model: 'original' })
    }
    const expected = [
      { provider: 'target', model: 'first-target' },
      { provider: 'target', model: 'second-target' },
      { provider: 'source', model: 'original' },
    ]
    expect(headers).toEqual(expected)
    expect(assembled).toEqual(expected)
    expect(tools.mock.calls.map(([input]) => input.modelSelection)).toEqual(expected)
    expect(adapter.requests).toHaveLength(3)
  } finally { await ctx.fiber.dispose() }
})

it('retains the captured route through a retry after the routing rule changes', async () => {
  const effective = { provider: 'target', model: 'first-target' }
  const adapter = new MockAdapter([
    () => { effective.model = 'changed-rule'; throw new LlmError('retry this request', 'RETRY') },
    textResponse('done'),
  ])
  const ctx = await harness(adapter)
  try {
    const resolve = vi.fn(async (_payload: unknown, next: () => Promise<Readonly<ModelSelection>>) => {
      await next()
      return effective
    })
    ctx.on('agent/resolve-model', resolve)
    ctx.on('agent/request-error', async () => ({ kind: 'retry' as const }))
    const agent = await ctx.agentLoop.create(SessionId('step-model-route-retry'), { provider: 'source', model: 'original' })
    await prompt(agent, 'go')
    expect(adapter.requests).toHaveLength(2)
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(agent.session.requestHeader()?.config).toMatchObject({ provider: 'target', model: 'first-target' })
  } finally { await ctx.fiber.dispose() }
})

it('contains routing failure before tools, assembly, user admission or model dispatch', async () => {
  const adapter = new MockAdapter([textResponse('unused')])
  const ctx = await harness(adapter)
  try {
    const tools = vi.spyOn(ctx.tools, 'resolve')
    const assembly = vi.spyOn(ctx.systemPrompt, 'assemble')
    const admitted: string[] = []
    ctx.on('session/event', (_session, event) => {
      if (event.type === 'user/message' || event.type === 'step/start') admitted.push(event.type)
    })
    const errors: unknown[] = []
    ctx.on('agent/error', ({ error }) => { errors.push(error) })
    ctx.on('agent/resolve-model', async (_payload, next) => { await next(); throw new Error('route denied') })
    const agent = await ctx.agentLoop.create(SessionId('step-model-route-failed'), { provider: 'source', model: 'original' })
    await prompt(agent, 'not admitted')
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ message: 'route denied' })
    expect(tools).not.toHaveBeenCalled()
    expect(assembly).not.toHaveBeenCalled()
    expect(adapter.requests).toHaveLength(0)
    expect(admitted).toEqual([])
  } finally { await ctx.fiber.dispose() }
})

it('does not use a route resolved after its turn was cancelled', async () => {
  const adapter = new MockAdapter([textResponse('unused')])
  const ctx = await harness(adapter)
  const route = Promise.withResolvers<ModelSelection>()
  try {
    const admitted: string[] = []
    ctx.on('session/event', (_session, event) => {
      if (event.type === 'user/message' || event.type === 'step/start') admitted.push(event.type)
    })
    const started = Promise.withResolvers<true>()
    const tools = vi.spyOn(ctx.tools, 'resolve')
    ctx.on('agent/resolve-model', async (_payload, next) => { await next(); started.resolve(true); return route.promise })
    const agent = await ctx.agentLoop.create(SessionId('step-model-route-cancelled'), { provider: 'source', model: 'original' })
    agent.followup(createUserMessage({ content: [{ type: 'text', text: 'cancelled' }], source: { kind: 'user' } }))
    await started.promise
    agent.cancel({ kind: 'user' })
    route.resolve({ provider: 'target', model: 'too-late' })
    await agent.whenIdle()
    expect(tools).not.toHaveBeenCalled()
    expect(adapter.requests).toHaveLength(0)
    expect(admitted).toEqual([])
  } finally {
    route.resolve({ provider: 'target', model: 'cleanup' })
    await ctx.fiber.dispose()
  }
})
