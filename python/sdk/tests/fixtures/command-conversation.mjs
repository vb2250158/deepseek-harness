/** Exercise the SDK's native command route without invoking a model. */
export const name = 'test-command-conversation'
export const inject = ['commands']

export function apply(ctx) {
  ctx.on('agent/created', async ({ agent }) => {
    const permission = ctx.commands.find(agent, 'permission')
    if (permission === undefined) throw new Error('Fixture requires the native permission command')
    await agent.ctx.plugin({
      name: 'test-conversation-permission',
      inject: ['commands'],
      apply(inner) {
        inner.effect(() => inner.commands.register({
          ...permission,
          startsConversation: true,
          handler: () => ({ kind: 'success', text: 'Command conversation reply.' }),
        }))
      },
    })
  })
}
