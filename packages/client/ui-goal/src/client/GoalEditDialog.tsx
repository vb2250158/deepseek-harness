/**
 * The goal-edit dialog, rendered as an entry of `conversation.input.overlay`
 * so each Session owns exactly one. The Modal portals to `document.body`; the
 * overlay slot only supplies the per-session controller.
 * @module @deepseek-ai/dsh-client-ui-goal/client/GoalEditDialog
 */

import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { GoalEditDialogProps } from './slots.ts'
import css from './GoalEditDialog.module.css'

/**
 * Render one Session's goal-edit dialog.
 * @param props - the dialog hook, the draft verbs, and the locale seat.
 * @returns the modal while a draft is open.
 */
export function GoalEditDialog({ useGoalEditDialog, edit, submit, dismiss, t }: GoalEditDialogProps) {
  const state = useGoalEditDialog(s => s)
  const blank = state.draft.trim() === ''
  return (
    <Modal
      open={state.open}
      title={t('dialog.title')}
      description={t('dialog.description')}
      closeLabel={t('action.close')}
      onClose={dismiss}
      className={css.dialog as string}
      footer={(
        <>
          <Button variant="ghost" disabled={state.submitting} onClick={dismiss}>
            {t('action.cancel')}
          </Button>
          <Button
            variant="primary"
            className={css.save}
            disabled={state.submitting || blank}
            onClick={() => { void submit() }}
          >
            {state.submitting ? t('action.saving') : t('action.save')}
          </Button>
        </>
      )}
    >
      <textarea
        className={css.objective}
        aria-label={t('objective.aria')}
        value={state.draft}
        readOnly={state.submitting}
        autoFocus
        onChange={(event) => { edit(event.target.value) }}
      />
      {state.failure !== null && (
        <span className={css.error} role="alert">
          {t('error.save')} ({state.failure})
        </span>
      )}
    </Modal>
  )
}
