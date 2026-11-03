/** Queue one input before Session-log admission, then fail the first pre-step. */
export const inject = ['loader']

/** @param {import('@deepseek-ai/cordis').Context} ctx - Scenario-owned runtime. */
export async function apply(ctx) {
  const { createUserMessage } = await ctx.loader.import('@deepseek-ai/dsh-llm')
  ctx.on('agent/pre-step', ({ agent, turn }, next) => {
    if (turn === 1) {
      agent.inbox.append('next-turn', createUserMessage({
        content: [{ type: 'text', text: 'QUEUED_AFTER_FAILURE' }], source: { kind: 'user' },
      }))
      throw new Error('Snapshot pre-step failed before admission')
    }
    return next()
  })
}
