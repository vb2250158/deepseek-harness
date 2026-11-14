// @vitest-environment jsdom
/** Real Slot selection applies one user-row replacement to every admission state. */
import { useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { act, cleanup } from '@testing-library/react'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { MessageId } from '@deepseek-ai/dsh-llm/types'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import type { PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatNode, UserRowInput, UserRowOrigin } from '../src/client/index.ts'
import { UserRow, UserRowBody } from '../src/client/chat/UserRow.tsx'

afterEach(cleanup)

type Seats = PropsRenderFactories & PropsRenderSlots<'conversation.approval.detail'>

const node: ChatNode<'user'> = {
  key: 'fixture:user:7', id: '7', kind: 'user', target: 'chat', anchorSeq: 7,
  location: { kind: 'session' }, visibility: 'visible',
  data: { kind: 'user', seq: 7, time: 7_000, source: null, content: [{ type: 'text', text: 'same message' }] },
}

describe('shared user-row presentation', () => {
  it('selects the same plugin body for local, Host-pending, and durable input without losing prepared content', async () => {
    const runtime = await SlotTestRuntime.create()
    onTestFinished(() => runtime.dispose())
    const received: UserRowInput[] = []
    await runtime.mount({ inject: ['slots'], apply: (ctx) => {
      ctx.slots.registerFactory({ name: 'conversation.chat.user.row', scope: 'session',
        children: { 'conversation.chat.user.row.body': { kind: 'single', scope: 'session' } },
      }, UserRow)
      ctx.slots.inject('conversation.chat.user.row.body', () => ctx.slots.register({
        name: 'conversation.chat.user.row.body', locale: 'chat',
        children: { 'conversation.chat.user.before': { kind: 'chain', scope: 'session' } },
      }, UserRowBody))
      ctx.slots.inject('conversation.chat.user.row.body', () => ctx.slots.register({
        name: 'conversation.chat.user.row.body', priority: -10,
      }, function PluginRow(props: PropsRuntime<'conversation.chat.user.row.body'>) {
        received.push(props)
        return <section data-testid="shared-row" data-origin={props.origin.kind}>
          <header>Account</header><div data-message-bubble="">{props.content.text}</div>
        </section>
      }))
    } })
    const captured: { seats?: Seats; setContent?: (value: ReactNode) => void } = {}
    await runtime.root.declare({ 'conversation.approval.detail': { kind: 'single', scope: 'session' } }, function Root(props) {
      const [content, setContent] = useState<ReactNode>(null)
      captured.seats = props
      captured.setContent = setContent
      return content
    })
    const view = runtime.renderRoot()
    const { seats, setContent } = captured
    if (seats === undefined || setContent === undefined) throw new Error('User-row fixture root did not render')
    await runtime.sessions.add({ id: 'user-row' })
    const session = runtime.sessions.retainFor(runtime.ctx, SessionId('user-row'))
    const { SessionProvider } = seats
    const loadImage = vi.fn<UserRowInput['loadImage']>(async () => 'blob:loaded')
    const content: UserRowInput['content'] = {
      text: 'same message', extraBlocks: [], referenceLabels: ['Session'],
      attachments: [{ type: 'image', image: { preview: { url: 'blob:local', name: 'preview.png' } } }],
    }
    const facts = { sessionLabels: ['Session'], skillNames: ['Skill'] }
    const origins: UserRowOrigin[] = [
      { kind: 'submission', submission: { requestId: 'request-1' as SessionRequestId, placement: 'transcript',
        time: 7_000, text: content.text, attachments: [] } },
      { kind: 'submission', submission: { requestId: 'request-2' as SessionRequestId, placement: 'steering',
        time: 7_000, text: content.text, attachments: [] } },
      { kind: 'pending-steering' },
      { kind: 'durable', node },
      { kind: 'durable', node: { ...node, kind: 'steering', data: { ...node.data, kind: 'steering',
        messageId: brandString<MessageId>('steering-1') } } },
    ]
    let firstRow: Element | undefined
    let firstBubble: Element | undefined
    for (const origin of origins) {
      act(() => { setContent(<SessionProvider session={session}>{seats.renderFactorySlot('conversation.chat.user.row', {
        origin, content, facts, loadImage, interactive: origin.kind === 'durable',
      })}</SessionProvider>) })
      const row = view.getByTestId('shared-row')
      const bubble = row.querySelector('[data-message-bubble]')!
      firstRow ??= row
      firstBubble ??= bubble
      expect(row).toBe(firstRow)
      expect(bubble).toBe(firstBubble)
      expect(row.textContent).toBe('Accountsame message')
      expect(received.at(-1)?.origin).toBe(origin)
      expect(received.at(-1)?.content).toBe(content)
      expect(received.at(-1)?.facts).toBe(facts)
      expect(received.at(-1)?.loadImage).toBe(loadImage)
      if (origin.kind !== 'durable') expect(origin).not.toHaveProperty('node')
    }
    view.unmount()
  })
})
