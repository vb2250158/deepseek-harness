/** Auxiliary plugin metadata remains optional on readers that do not know its type. */
import { expect, it } from 'vitest'
import { Session, SessionId, snapshotSessionEvent } from '@deepseek-ai/dsh-session'
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap { 'test/completion-request': { readonly prefix: string } }
}
it('persists the explicit ignorable envelope without altering the user message history', () => {
  const session = Session.create(SessionId('completion-metadata'))
  const event = session.append('test/completion-request', { prefix: '草稿' }, { ignorable: true })
  expect(event.ignorable).toBe(true)
  expect(snapshotSessionEvent(JSON.parse(JSON.stringify(event)))).toEqual(event)
  expect(session.surface.nodes).toEqual([])
})
it('keeps ordinary event envelopes unchanged', () => {
  const session = Session.create(SessionId('ordinary-metadata'))
  expect(session.append('session/end-seed', {})).not.toHaveProperty('ignorable')
})

it('preserves explicit ignorable metadata in a batch without changing ordinary envelopes', () => {
  const session = Session.create(SessionId('batch-completion-metadata'))
  const events = session.append([
    ['test/completion-request', { prefix: 'draft' }, { ignorable: true }],
    ['session/end-seed', {}],
  ])
  expect(events[0]?.ignorable).toBe(true)
  expect(events[1]).not.toHaveProperty('ignorable')
  expect(events.map(event => event.seq)).toEqual([0, 1])
  expect(session.surface.nodes).toEqual([])
})
it('does not publish a batch when reading a later metadata getter fails', () => {
  const session = Session.create(SessionId('batch-invalid-metadata'))
  expect(() => session.append([
    ['test/completion-request', { prefix: 'first' }, { ignorable: true }],
    ['test/completion-request', { prefix: 'second' }, { get ignorable(): true { throw new Error('metadata failed') } }],
  ])).toThrow('metadata failed')
  expect(session.seq).toBe(0)
})
