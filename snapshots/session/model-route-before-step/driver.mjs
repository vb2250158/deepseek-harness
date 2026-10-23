/** Deterministic model routing before the recorded request is assembled. */
import assert from 'node:assert/strict'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'model-route-before-step-driver'
export const inject = ['agentLoop', 'tools']

/**
 * Route the source model while preserving the pending source choice.
 * @param {import('@deepseek-ai/cordis').Context} ctx - scenario composition context.
 */
export function apply(ctx) {
  assert.equal(ctx.agentLoop.modelResolutionVersion, 1)
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'routed_target',
    description: 'Available only after routing to the target model.',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    execute: async () => 'unused',
  }), { when: ({ modelSelection }) => modelSelection.model === 'deepseek-v4-pro' }))
  ctx.on('agent/resolve-model', async ({ agent, sourceSelection }, next) => {
    assert.equal(sourceSelection.model, 'deepseek-v4-flash')
    assert.deepEqual(await next(), sourceSelection)
    agent.model.select(sourceSelection)
    return { ...sourceSelection, model: 'deepseek-v4-pro' }
  })
}
