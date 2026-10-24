/** Deterministic local recording and replay of proactive request-context compaction. */
import assert from 'node:assert/strict'
import { LlmAdapter, ToolCallId } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'request-context-compaction-driver'
export const inject = ['tools', 'llm', 'systemPrompt']

class LocalRecordingAdapter extends LlmAdapter {
  requests = 0

  resolveModel(provider, model) {
    return Promise.resolve({ provider, id: model, name: model, context: { contextWindow: 2048 }, defaultMaxTokens: 32 })
  }

  async *stream(options) {
    const summary = options.messages.at(-1)?.content.some(block => block.type === 'text'
      && block.text.includes('acting as a compaction engine')) === true
    if (!summary && ++this.requests === 1) {
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: ToolCallId('work-call'), name: 'work', arguments: '{}' } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const text = summary ? 'Earlier work completed.' : 'ADMISSION COMPLETE'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

/**
 * Register deterministic work and compact only after the first admitted tool step.
 * @param {import('@deepseek-ai/cordis').Context} ctx - scenario composition context.
 */
export function apply(ctx) {
  if (process.env.DSH_SNAPSHOT === 'record') {
    ctx.effect(() => ctx.llm.registerAdapter(['deepseek-official'], new LocalRecordingAdapter()))
  }
  let steps = 0
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'work', description: 'Do deterministic local work.', parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async () => 'work done',
  })))
  ctx.systemPrompt.context({
    name: 'scenario:required-directory', order: ctx.systemPrompt.getContextOrder('WORKING_DIRECTORY'),
    required: true, interpolate: false,
    text: 'Current working directory: "/fixture".',
  })
  ctx.on('llm/stream', (request, next) => {
    const summary = request.messages.at(-1)?.content.some(block => block.type === 'text'
      && block.text.includes('acting as a compaction engine')) === true
    if (!summary) assert(request.messages.some(message => message.role === 'user'
      && message.source?.kind === 'runtime-context'
      && message.content.some(block => block.type === 'text' && block.text.includes('"/fixture"'))),
    'required directory context was removed before model dispatch')
    return next()
  })
  ctx.on('agent/pre-step', async (_payload, next) => {
    const decision = await next()
    if (decision.kind === 'enter') steps++
    return decision
  })
  ctx.on('compaction/pressure-policy', (_request, next) => {
    const policy = next()
    return steps <= 1 ? { ...policy, thresholdTokens: Number.MAX_SAFE_INTEGER } : policy
  })
  ctx.on('agent/request-context-ready', async ({ agent }, next) => {
    await next()
    if (steps > 1) assert(agent.session.snapshotEvents().some(event => event.type === 'compaction/summary'))
  })
}
