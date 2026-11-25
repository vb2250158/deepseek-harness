/** Confirmation for clearing a Session's durable messages and context. */
import { useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionClearProps, SessionClearTarget } from '../contract/slots.ts'
import css from '../rows/WorkspaceBrowser.module.css'

/**
 * Show the clear-history confirmation for the row whose action was selected.
 * @param props - pending target, action callbacks, and localized labels.
 * @returns the pending confirmation or null.
 */
export function SessionClearDialog({ useClearTarget, ...props }: SessionClearProps) {
  const target = useClearTarget(value => value)
  return target === null ? null : <ClearForm key={target.sessionId} {...props} target={target} />
}

function ClearForm({ target, clearHistory, dismissClear, t }:
Pick<SessionClearProps, 'clearHistory' | 'dismissClear' | 't'> & { target: SessionClearTarget }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => { if (!pending) dismissClear() }
  const confirm = () => {
    setPending(true)
    setError(null)
    clearHistory(target.sessionId).then(dismissClear).catch((reason: unknown) => {
      setPending(false)
      setError(reason instanceof Error ? reason.message : t('clearHistory.failed'))
    })
  }
  return (
    <Modal open onClose={close} closeLabel={t('close')}
      title={t('clearHistory.action')} description={t('clearHistory.description', { title: target.displayTitle })}
      footer={(
        <>
          <Button variant="outline" data-modal-autofocus disabled={pending} onClick={close}>{t('cancel')}</Button>
          <Button variant="outline" className={css.deleteAction} disabled={pending} onClick={confirm}>
            {t('clearHistory.action')}
          </Button>
        </>
      )}
    >
      {pending && <div className={css.deleteStatus} role="status">{t('clearHistory.pending')}</div>}
      {error !== null && <div className={css.renameError} role="alert">{error}</div>}
    </Modal>
  )
}
