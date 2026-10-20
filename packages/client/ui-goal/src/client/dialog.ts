/**
 * Headless state of one Session's goal-edit dialog. The strip opens it with the
 * current objective as the seed draft; the overlay view renders from the store
 * and closes it after a successful save. A failed save keeps the draft on
 * screen so the user can retry against the newer revision.
 * @module @deepseek-ai/dsh-client-ui-goal/client/dialog
 */

import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { GoalActionResult } from './slots.ts'

/** Dialog state the overlay view renders from. */
export interface GoalEditDialogState {
  /** Whether the dialog is showing. */
  readonly open: boolean
  /** The draft objective as typed; seeded from the goal on open. */
  readonly draft: string
  /** A save is in flight; the form ignores edits and submits until it settles. */
  readonly submitting: boolean
  /** Failure code of the last save; null when the last save has not failed. */
  readonly failure: string | null
}

const CLOSED: GoalEditDialogState = { open: false, draft: '', submitting: false, failure: null }

/**
 * Save one draft objective.
 * @param objective - the trimmed draft.
 * @returns the settled outcome; a failure keeps the dialog open.
 */
export type GoalEditSubmit = (objective: string) => Promise<GoalActionResult>

/** Per-session goal-edit dialog controller; one instance backs the overlay entry. */
export class GoalEditDialogController {
  /** Dialog state store (the overlay entry subscribes here). */
  readonly state: SnapshotStore<GoalEditDialogState> = createSnapshotStore<GoalEditDialogState>(CLOSED)
  /** Bumped by every open, dismiss, and dispose so a late save can tell its draft is gone. */
  private generation = 0

  /**
   * @param submit - saves one draft objective; the owner routes it to the goal Remote.
   */
  constructor(private readonly submit: GoalEditSubmit) {}

  /**
   * Open the dialog seeded with the goal's current objective, replacing any draft.
   * @param objective - the objective as currently projected.
   */
  open(objective: string): void {
    this.generation += 1
    this.state.set({ open: true, draft: objective, submitting: false, failure: null })
  }

  /** Close the dialog and discard the draft. */
  dismiss(): void {
    this.generation += 1
    this.state.set(CLOSED)
  }

  /**
   * Replace the draft while it is editable.
   * @param draft - the objective text as typed; an overlong value keeps its last
   * accepted state so the editor never shows a rejected value.
   */
  edit(draft: string): void {
    const s = this.state.getSnapshot()
    if (!s.open || s.submitting) return
    this.state.set({ ...s, draft, failure: null })
  }

  /**
   * Save the draft. A blank draft is not submittable and is ignored here as it
   * is disabled in the view. Success closes the dialog; a failure keeps it open
   * with the draft intact and publishes the code for the inline notice.
   * @returns after the save settles.
   */
  async submitDraft(): Promise<void> {
    const s = this.state.getSnapshot()
    if (!s.open || s.submitting) return
    const trimmed = s.draft.trim()
    if (trimmed === '') return
    const generation = this.generation
    this.state.set({ ...s, submitting: true, failure: null })
    const result = await this.submit(trimmed)
    if (generation !== this.generation) return
    if (result.ok) {
      this.dismiss()
      return
    }
    this.state.set({ ...this.state.getSnapshot(), submitting: false, failure: result.error.code })
  }

  /** Scope-teardown disposer: drop the draft and orphan in-flight work. */
  dispose(): void {
    this.generation += 1
    this.state.set(CLOSED)
  }
}
