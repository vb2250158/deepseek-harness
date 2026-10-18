/** Auxiliary plugin provenance remains optional on readers that do not know its type. */
import { expect, it } from 'vitest'
import { Session, SessionId, snapshotSessionEvent } from '@deepseek-ai/dsh-session'
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap { 'test/completion-request': { readonly prefix: string } }
}
it('persists the explicit ignorable envelope without altering the user message history', () => {
  const session = Session.create(SessionId('completion-provenance'))
  const event = session.append('test/completion-request', { prefix: '草稿' }, { ignorable: true })
  expect(event.ignorable).toBe(true)
  expect(snapshotSessionEvent(JSON.parse(JSON.stringify(event)))).toEqual(event)
  expect(session.surface.nodes).toEqual([])
})
it('keeps ordinary event envelopes unchanged', () => {
  const session = Session.create(SessionId('ordinary-provenance'))
  expect(session.append('session/end-seed', {})).not.toHaveProperty('ignorable')
})
