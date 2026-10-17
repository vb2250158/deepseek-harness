/**
 * GoalBar's injected face. The target 'conversation.input.dock' slot is
 * declared (children table) and typed by ui-conversation; this package only
 * contributes the entry, so no SlotMap merge lives here. The durable goal
 * value arrives through `useProjection('goal')` (the framework standard kit);
 * the injected face carries mutation verbs and a registrant-private
 * activation hook source.
 */

import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { HostObservable, InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { GoalActivation, GoalId } from '@deepseek-ai/dsh-goal/client'
import type { GoalEditDialogState } from './dialog.ts'

/**
 * The one failure the strip reports without a wire call: the session projects
 * no goal, so no CAS ref exists to address a mutation to.
 */
export interface GoalLocalFailure {
  readonly ok: false
  readonly error: { readonly code: 'no-current-goal'; readonly message: string }
}

/**
 * Settled outcome of one goal mutation, rendered inline by the strip. The
 * strip renders the failure only — the mutated goal arrives through the
 * projection — so the success value stays unread here.
 */
export type GoalActionResult = RemoteResult<unknown> | GoalLocalFailure

/** Process-local activation matched to one exact goal revision. */
export interface GoalActivationSnapshot {
  /** Exact current goal id, absent before create or after clear. */
  readonly id?: GoalId
  /** Exact current revision for the activation edge. */
  readonly revision?: number
  /** Process-local continuation state; absent while no matching edge is known. */
  readonly activation?: GoalActivation
}

/** Registrant-private observable source bound by the slot renderer. */
export interface GoalActivationInjected {
  readonly hooks: {
    readonly goalActivation: HostObservable<GoalActivationSnapshot>
  }
}

/**
 * Injected business face of the Session's goal-edit dialog entry. The dialog
 * owns the draft; the strip only asks it to open, so the two entries never
 * share mutable state.
 */
export interface GoalEditDialogInjected {
  hooks: {
    /** The Session's goal-edit dialog state. */
    goalEditDialog: HostObservable<GoalEditDialogState>
  }
  /**
   * Replace the draft objective while the dialog is editable.
   * @param draft - the objective text as typed.
   */
  edit: (draft: string) => void
  /** Save the draft; a failure keeps the dialog open with the draft intact. */
  submit: () => Promise<void>
  /** Close the dialog and discard the draft. */
  dismiss: () => void
}

/** Full props of the goal-edit dialog overlay entry. */
export type GoalEditDialogProps =
  InjectFace<GoalEditDialogInjected>
  & PropsLocale<'goal'>

/** Injected business face of the GoalBar dock entry: the mutation verbs (function properties: the strip destructures them freely). */
export interface GoalBarActions {
  /**
   * Open the Session's goal-edit dialog seeded with the goal's current
   * objective. The dialog owns the draft and the save; the strip submits
   * nothing itself.
   * @param objective - the objective as currently projected, used as the seed.
   */
  onEdit: (objective: string) => void
  /** Pause an active goal. */
  onPause: () => Promise<GoalActionResult>
  /** Resume a paused goal. */
  onResume: () => Promise<GoalActionResult>
  /** Clear the current goal (tombstone). */
  onClear: () => Promise<GoalActionResult>
}

/** Injected business face of the GoalBar dock entry. */
export type GoalBarInjected = GoalBarActions & GoalActivationInjected
