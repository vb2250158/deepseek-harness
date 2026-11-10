/** Shared user-message row entry for all admission states. */
import type { ReactNode } from 'react'
import type {
  FactoryComponentPropsOf, PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { UserRowInput } from '../contract/slots.ts'
import { MessageIconActions } from './MessageIconActions.tsx'
import css from './MessageItem.module.css'

/**
 * Route every user-message origin through the same replaceable row body.
 * @param props - prepared content, actual origin, and the declared body renderer.
 * @returns the selected user-row presentation.
 */
export function UserRow({ origin, content, loadImage, facts, interactive, ellipsis, renderSlot }:
FactoryComponentPropsOf<'conversation.chat.user.row'>): ReactNode {
  const input: UserRowInput = {
    origin, content, loadImage, facts,
    ...(interactive === undefined ? {} : { interactive }),
    ...(ellipsis === undefined ? {} : { ellipsis }),
  }
  return renderSlot('conversation.chat.user.row.body', input)
}

/** Default row chrome; user-source decoration remains exclusive to durable user nodes. */
type UserRowBodyProps = PropsRuntime<'conversation.chat.user.row.body'>
  & PropsRenderSlots<'conversation.chat.user.before'> & PropsRenderFactories & PropsLocale<'chat'>

/**
 * Draw the default user row, admission markers, and message actions.
 * @param props - prepared contents, actual origin, source-decoration seat, and Chat locale.
 * @returns the default row with the shared content Factory.
 */
export function UserRowBody({ origin, content, loadImage, facts, interactive, ellipsis, renderSlotChain, renderFactorySlot, t }:
UserRowBodyProps): ReactNode {
  const node = origin.kind === 'durable' ? origin.node : undefined
  const submission = origin.kind === 'submission' ? origin.submission : undefined
  const pending = origin.kind === 'pending-steering' || submission?.placement === 'steering'
  const time = node?.data.time ?? submission?.time
  return (
    <div className={css.userRow}
      data-pending-steering={pending || undefined}
      data-submission-echo={submission === undefined ? undefined : true}
      data-chat-steering-batch={node?.kind === 'steering' && node.data.batchStart === true ? 'start' : undefined}>
      {node?.kind === 'user'
        ? renderSlotChain('conversation.chat.user.before', { source: node.data.source, kind: node.kind }, { fallback: null })
        : null}
      {renderFactorySlot('conversation.chat.user.content', {
        content, loadImage, facts,
        ...(interactive === undefined ? {} : { interactive }),
        ...(ellipsis === undefined ? {} : { ellipsis }),
      })}
      <MessageIconActions text={content.text} clock="start" className={css.actions} t={t}
        {...time === undefined ? {} : { time }} />
    </div>
  )
}
