import { memo, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { PendingSubmission } from '@deepseek-ai/dsh-api-session-controller/client'
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import type { UserTextFacts } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { JsonBlock, StateDot, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  ChatNodeViewProps, ChatViewSlotProps, UserContentAttachment, UserContentData, UserContentInput, UserRowOrigin,
} from '../contract/slots.ts'
import type { ModelRetryNode, TurnErrorNode, UserMessageNode } from '../contract/snapshot.ts'
import { CompactionItem } from './CompactionItem.tsx'
import { ContextInjectionRow } from './ContextInjectionRow.tsx'
import css from './MessageItem.module.css'

const EMPTY_TEXT_FACTS: Readonly<Partial<UserTextFacts>> = {}

type UserImage = Extract<UserMessageNode['content'][number], { type: 'image' }>
type UserFile = Extract<UserMessageNode['content'][number], { type: 'file' }>
function contentParts(content: readonly unknown[]): {
  text: string
  attachments: UserContentAttachment[]
  rest: unknown[]
} {
  const texts: string[] = []
  const attachments: UserContentAttachment[] = []
  const rest: unknown[] = []
  for (const block of content) {
    const b = block as { type?: string; text?: string; attachment?: unknown }
    if (b.type === 'text' && typeof b.text === 'string') texts.push(b.text)
    else if (b.type === 'image' && b.attachment !== undefined) {
      attachments.push({ type: 'image', image: { attachment: (b as UserImage).attachment } })
    }
    else if (b.type === 'file' && b.attachment !== undefined) {
      attachments.push({ type: 'file', file: (b as UserFile).attachment })
    }
    else rest.push(block)
  }
  return { text: texts.join(''), attachments, rest }
}

function retrySeconds(milliseconds: number): number {
  return Math.max(1, Math.ceil(milliseconds / 1_000))
}

interface RetryCountdown {
  deadline: number
  seconds: number
}

function failureMessage(
  message: string,
  code: unknown,
  t: ChatViewSlotProps['t'],
): string {
  if (code === 'ACCOUNT_SIGNED_OUT') return t('message.failure.accountSignedOut')
  if (code === 'INTERRUPTED') return t('message.failure.interrupted')
  if (code === 'ACCOUNT_SIGN_IN_REQUIRED') return t('message.failure.accountSignInRequired')
  if (code === 'QUOTA' || code === 'ACCOUNT_QUOTA') return t('message.failure.quota')
  return code === 'AUTH' ? t('message.failure.auth') : message
}

function ModelRetryItem({ node, active, t }: {
  node: ModelRetryNode
  active: boolean
  t: ChatViewSlotProps['t']
}) {
  // Anchor the host-scheduled delay to this browser's first render of the
  // retry node. Host event time and Date.now() may belong to different clocks.
  const deadline = useMemo(() => Date.now() + node.delayMs, [node.delayMs, node.seq])
  const scheduledSeconds = retrySeconds(node.delayMs)
  const maximum = node.mode === 'normal' ? node.maxRetries : '∞'
  const [countdown, setCountdown] = useState<RetryCountdown>(() => ({
    deadline,
    seconds: retrySeconds(deadline - Date.now()),
  }))
  const remainingSeconds = countdown.deadline === deadline
    ? countdown.seconds
    : retrySeconds(deadline - Date.now())

  useEffect(() => {
    if (!active) return
    const updateCountdown = (): number => {
      const next = retrySeconds(deadline - Date.now())
      setCountdown(current => (
        current.deadline === deadline && current.seconds === next
          ? current
          : { deadline, seconds: next }
      ))
      return next
    }
    if (updateCountdown() === 1) return
    const timer = window.setInterval(() => {
      if (updateCountdown() === 1) window.clearInterval(timer)
    }, 250)
    return () => { window.clearInterval(timer) }
  }, [active, deadline])

  const label = active
    ? t('message.retry.active')
    : node.retryState === 'cancelled'
      ? t('message.retry.cancelled')
      : node.retryState === 'started'
        ? t('message.retry.started')
        : t('message.retry.scheduled')
  const seconds = active ? remainingSeconds : scheduledSeconds

  return (
    <details className={css.retryRow} data-active={active || undefined}>
      <summary className={css.retrySummary}>
        <span className={css.retryText} role="status">
          <TextShimmer active={active}>
            {t('message.retry.status', { label, retry: node.retry, maximum, seconds })}
          </TextShimmer>
        </span>
      </summary>
      <div className={css.retryDetails}>
        <div>
          <span className={css.retryDetailLabel}>{t('message.retry.delay')}</span>
          {t('duration.milliseconds', { milliseconds: Math.round(node.delayMs) })}
        </div>
        <div>
          <span className={css.retryDetailLabel}>{t('message.retry.failure')}</span>
          {failureMessage(node.failure.message, node.failure.code, t)}
        </div>
      </div>
    </details>
  )
}

/** Persistent, turn-positioned feedback for a terminal failure. */
function TurnErrorItem({ node, t }: {
  node: TurnErrorNode
  t: ChatViewSlotProps['t']
}) {
  return (
    <div className={css.turnErrorRow} role="status">
      <StateDot state="error" className={css.turnErrorDot} />
      <div className={css.turnErrorCopy}>
        <span className={css.turnErrorTitle}>{node.code === 'ACCOUNT_SIGNED_OUT' || node.code === 'INTERRUPTED' ? t('message.taskStopped') : t('message.turnError')}</span>
        <span className={css.turnErrorMessage}>{failureMessage(node.message, node.code, t)}</span>
      </div>
      {node.code !== undefined && node.code !== 'INTERRUPTED' && <code className={css.turnErrorCode}>{node.code}</code>}
    </div>
  )
}

/** Persistent, turn-positioned notice for a turn ended at the output-token cap. */
function TurnMaxTokensItem({ t }: {
  t: ChatViewSlotProps['t']
}) {
  return (
    <div className={css.turnErrorRow} role="status">
      <StateDot state="warning" className={css.turnErrorDot} />
      <div className={css.turnErrorCopy}>
        <span className={css.maxTokensTitle}>{t('message.maxTokens')}</span>
        <span className={css.turnErrorMessage}>{t('message.maxTokens.hint')}</span>
      </div>
    </div>
  )
}

/** Prepare input contents once before entering the shared user-row presentation. */
function PreparedUserRow({ origin, content, loadImage, renderFactorySlot,
  referenceLabels, skillNames, previewAttachments, facts: inputFacts = EMPTY_TEXT_FACTS, interactive = false,
}: {
  origin: UserRowOrigin
  content: readonly unknown[]
  referenceLabels?: readonly string[]
  skillNames?: readonly string[]
  previewAttachments?: readonly UserContentAttachment[]
  facts?: Readonly<Partial<UserTextFacts>>
} & Pick<UserContentInput, 'loadImage' | 'interactive'> & PropsRenderFactories): ReactNode {
  const parts = useMemo(() => contentParts(content), [content])
  const prepared = useMemo<UserContentData>(() => ({
    text: parts.text,
    attachments: previewAttachments ?? parts.attachments,
    extraBlocks: parts.rest,
    ...(referenceLabels === undefined ? {} : { referenceLabels }),
  }), [parts, previewAttachments, referenceLabels])
  const facts = useMemo<Readonly<Partial<UserTextFacts>>>(() => ({
    ...inputFacts,
    ...(referenceLabels === undefined ? {} : { sessionLabels: referenceLabels }),
    ...(skillNames === undefined ? {} : { skillNames }),
  }), [inputFacts, referenceLabels, skillNames])
  return renderFactorySlot('conversation.chat.user.row', {
    origin, content: prepared, loadImage, facts, interactive,
  })
}

/**
 * Render a Host-pending steering input through the shared user-row presentation.
 * @param props - pending content, authorized image loader, and Factory seat.
 * @returns the pending steering row.
 */
export function PendingSteeringBubble({ content, loadImage, renderFactorySlot }: {
  content: readonly unknown[]
} & Pick<UserContentInput, 'loadImage'> & PropsRenderFactories & Pick<ChatViewSlotProps, 't'>): ReactNode {
  return <PreparedUserRow origin={{ kind: 'pending-steering' }} content={content}
    renderFactorySlot={renderFactorySlot} loadImage={loadImage} />
}

/**
 * Render a local submission with object-URL previews through the shared user row.
 * @param props - pending submission, authorized image loader, and Factory seat.
 * @returns the local echo until its durable occurrence renders.
 */
export function PendingSubmissionBubble({ submission, loadImage, renderFactorySlot }: {
  submission: PendingSubmission
} & Pick<UserContentInput, 'loadImage'> & PropsRenderFactories & Pick<ChatViewSlotProps, 't'>): ReactNode {
  const content = useMemo(
    () => (submission.text === '' ? [] : [{ type: 'text', text: submission.text }]),
    [submission.text],
  )
  const previewAttachments = useMemo<readonly UserContentAttachment[]>(
    () => submission.attachments.map(attachment => attachment.type === 'image'
      ? {
        type: 'image',
        image: {
          preview: {
            url: attachment.value.previewUrl,
            ...(attachment.value.name === undefined ? {} : { name: attachment.value.name }),
            ...(attachment.value.width === undefined ? {} : { width: attachment.value.width }),
            ...(attachment.value.height === undefined ? {} : { height: attachment.value.height }),
          },
        },
      }
      : { type: 'file', file: attachment.value }),
    [submission.attachments],
  )
  return <PreparedUserRow origin={{ kind: 'submission', submission }} content={content}
    previewAttachments={previewAttachments} renderFactorySlot={renderFactorySlot} loadImage={loadImage} />
}

/** Official user and steering nodes enter the same row presentation as pending input. */
export const UserMessageNodeView = memo(function UserMessageNodeView({
  node, renderFactorySlot, loadImage,
}: ChatNodeViewProps<'user' | 'steering'>) {
  const data = node.data
  return <PreparedUserRow origin={{ kind: 'durable', node }} content={data.content}
    interactive renderFactorySlot={renderFactorySlot} loadImage={loadImage}
    {...data.referenceLabels === undefined ? {} : { referenceLabels: data.referenceLabels }}
    {...data.skillNames === undefined ? {} : { skillNames: data.skillNames }} />
})

/** Injected-context keyed Chat renderer. */
export const ContextMessageNodeView = memo(function ContextMessageNodeView({ node, t }: ChatNodeViewProps<'context'>) {
  const data = node.data
  return (
    <ContextInjectionRow
      content={data.content}
      source={data.source}
      producer={data.producer}
      form={data.form}
      t={t}
    />
  )
})

/** Automatic compaction keyed Chat renderer. */
export const CompactionNodeView = memo(function CompactionNodeView({ node, t }: ChatNodeViewProps<'compaction'>) {
  return <CompactionItem node={node.data} t={t} />
})

/** Correlated retry-chain keyed Chat renderer. */
export const RetryNodeView = memo(function RetryNodeView({ node, t }: ChatNodeViewProps<'model-retry'>) {
  const data = node.data
  return <ModelRetryItem node={data.current} active={data.current.retryState === 'scheduled'} t={t} />
})

/** Terminal turn-error keyed Chat renderer. */
export const TurnErrorNodeView = memo(function TurnErrorNodeView({ node, t }: ChatNodeViewProps<'turn-error'>) {
  return <TurnErrorItem node={node.data} t={t} />
})

/** Max-tokens turn-end notice keyed Chat renderer. */
export const TurnMaxTokensNodeView = memo(function TurnMaxTokensNodeView({ t }: ChatNodeViewProps<'turn-max-tokens'>) {
  return <TurnMaxTokensItem t={t} />
})

/** Explicit unknown-surface keyed Chat renderer. */
export const UnknownNodeView = memo(function UnknownNodeView({ node, t }: ChatNodeViewProps<'unknown'>) {
  const data = node.data
  return (
    <div className={css.contextRow}>
      <JsonBlock
        label={t('message.unknownSurface', { type: data.type })}
        payload={data.data}
        truncatedLabel={total => t('json.truncated', { total })}
      />
    </div>
  )
})
