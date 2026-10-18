// @vitest-environment jsdom
/**
 * The goal-edit dialog: its headless controller's open/edit/save/dispose
 * transitions, and the overlay view's user-visible behavior — seeding, a
 * disabled save on a blank draft, a failure that keeps the draft on screen,
 * and dismissal.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { GoalEditDialogController, type GoalEditSubmit } from '../src/client/dialog.ts'
import { GoalEditDialog } from '../src/client/GoalEditDialog.tsx'
import type { GoalActionResult } from '../src/client/slots.ts'
import { zh } from '../src/client/locales.ts'

const t: Parameters<typeof GoalEditDialog>[0]['t'] = makeTranslate(zh, commonZh)

afterEach(cleanup)

const ok: GoalActionResult = { ok: true, value: undefined }

function makeSubmit() {
  return vi.fn<GoalEditSubmit>(() => Promise.resolve(ok))
}

describe('GoalEditDialogController', () => {
  it('opens seeded with the objective, replacing any earlier draft', () => {
    const controller = new GoalEditDialogController(makeSubmit())
    expect(controller.state.getSnapshot()).toEqual({ open: false, draft: '', submitting: false, failure: null })

    controller.open('Ship it')
    expect(controller.state.getSnapshot()).toEqual({ open: true, draft: 'Ship it', submitting: false, failure: null })

    controller.open('Another goal')
    expect(controller.state.getSnapshot().draft).toBe('Another goal')
  })

  it('edits the draft and clears a stale failure while the dialog is editable', () => {
    const controller = new GoalEditDialogController(makeSubmit())
    controller.open('Ship it')
    controller.open('Ship it')
    expect(controller.state.getSnapshot().failure).toBeNull()

    controller.edit('Ship v2')
    expect(controller.state.getSnapshot().draft).toBe('Ship v2')
  })

  it('ignores edits while closed or while a save is in flight', async () => {
    let resolveSave!: (result: GoalActionResult) => void
    const submit = vi.fn<GoalEditSubmit>(() => new Promise((resolve) => { resolveSave = resolve }))
    const controller = new GoalEditDialogController(submit)

    controller.edit('ignored while closed')
    expect(controller.state.getSnapshot().draft).toBe('')

    controller.open('Ship it')
    const saving = controller.submitDraft()
    controller.edit('ignored while saving')
    expect(controller.state.getSnapshot().draft).toBe('Ship it')

    resolveSave(ok)
    await saving
  })

  it('saves the trimmed draft and closes on success', async () => {
    const submit = makeSubmit()
    const controller = new GoalEditDialogController(submit)
    controller.open('  Ship it  ')
    await controller.submitDraft()

    expect(submit).toHaveBeenCalledWith('Ship it')
    expect(controller.state.getSnapshot()).toEqual({ open: false, draft: '', submitting: false, failure: null })
  })

  it('ignores a blank draft and a save while closed', async () => {
    const submit = makeSubmit()
    const controller = new GoalEditDialogController(submit)

    await controller.submitDraft()
    expect(submit).not.toHaveBeenCalled()

    controller.open('   ')
    await controller.submitDraft()
    expect(submit).not.toHaveBeenCalled()
    expect(controller.state.getSnapshot().open).toBe(true)
  })

  it('keeps the draft open and publishes the failure code when the save is rejected', async () => {
    const submit = vi.fn<GoalEditSubmit>(() => Promise.resolve({
      ok: false as const,
      error: new RemoteError('session/agent-busy', 'stale revision', { reason: 'stale revision' }),
    }))
    const controller = new GoalEditDialogController(submit)
    controller.open('Ship it')
    await controller.submitDraft()

    expect(controller.state.getSnapshot()).toMatchObject({
      open: true, draft: 'Ship it', submitting: false, failure: 'session/agent-busy',
    })
  })

  it('single-flights a save so a second call while pending is ignored', async () => {
    let resolveSave!: (result: GoalActionResult) => void
    const submit = vi.fn<GoalEditSubmit>(() => new Promise((resolve) => { resolveSave = resolve }))
    const controller = new GoalEditDialogController(submit)
    controller.open('Ship it')

    const first = controller.submitDraft()
    await controller.submitDraft()
    expect(submit).toHaveBeenCalledTimes(1)

    resolveSave(ok)
    await first
  })

  it('drops a late settlement once the dialog has been dismissed or reopened', async () => {
    let resolveSave!: (result: GoalActionResult) => void
    const submit = vi.fn<GoalEditSubmit>(() => new Promise((resolve) => { resolveSave = resolve }))
    const controller = new GoalEditDialogController(submit)

    controller.open('Ship it')
    const saving = controller.submitDraft()
    controller.dismiss()
    resolveSave(ok)
    await saving
    expect(controller.state.getSnapshot().open).toBe(false)

    controller.open('Reopened')
    const reopened = controller.submitDraft()
    controller.open('Third draft')
    resolveSave({ ok: false, error: new RemoteError('gateway/internal', 'stale', {}) })
    await reopened
    expect(controller.state.getSnapshot()).toMatchObject({ open: true, draft: 'Third draft', failure: null })
  })

  it('dispose returns the controller to its closed state', () => {
    const controller = new GoalEditDialogController(makeSubmit())
    controller.open('Ship it')
    controller.dispose()
    expect(controller.state.getSnapshot()).toEqual({ open: false, draft: '', submitting: false, failure: null })
  })
})

describe('GoalEditDialog', () => {
  function renderDialog(over: { open?: boolean; draft?: string; submitting?: boolean; failure?: string | null } = {}) {
    const edit = vi.fn()
    const submit = vi.fn(() => Promise.resolve())
    const dismiss = vi.fn()
    const state = {
      open: over.open ?? true,
      draft: over.draft ?? 'Ship the redesign',
      submitting: over.submitting ?? false,
      failure: over.failure ?? null,
    }
    const useGoalEditDialog = (selector: (s: typeof state) => unknown) => selector(state)
    render(
      <GoalEditDialog
        useGoalEditDialog={useGoalEditDialog as never}
        edit={edit}
        submit={submit}
        dismiss={dismiss}
        t={t}
      />,
    )
    return { edit, submit, dismiss }
  }

  it('renders nothing while closed', () => {
    renderDialog({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('seeds a multi-line field with the objective and saves the typed draft', () => {
    const { edit, submit } = renderDialog()
    const box = screen.getByRole('textbox', { name: '目标内容' })
    expect(box).toHaveProperty('value', 'Ship the redesign')
    expect(box.tagName).toBe('TEXTAREA')

    fireEvent.change(box, { target: { value: 'Ship v2\nwith a second line' } })
    expect(edit).toHaveBeenCalledWith('Ship v2\nwith a second line')

    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('disables save on a blank draft', () => {
    renderDialog({ draft: '   ' })
    expect(screen.getByRole('button', { name: '保存' })).toHaveProperty('disabled', true)
  })

  it('shows the failure notice and keeps the draft on a rejected save', () => {
    renderDialog({ draft: 'retry this draft', failure: 'session/agent-busy' })
    expect(screen.getByRole('alert').textContent).toBe('目标保存失败 (session/agent-busy)')
    expect(screen.getByRole('textbox', { name: '目标内容' })).toHaveProperty('value', 'retry this draft')
  })

  it('locks the field and labels the button while a save is in flight', () => {
    renderDialog({ submitting: true })
    expect(screen.getByRole('textbox', { name: '目标内容' })).toHaveProperty('readOnly', true)
    const saving = screen.getByRole('button', { name: '保存中' })
    expect(saving).toHaveProperty('disabled', true)
  })

  it('cancels from both the footer button and Escape', () => {
    const { dismiss } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(dismiss).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(dismiss).toHaveBeenCalledTimes(2)
  })

  it('closes on a mask click', async () => {
    const { dismiss } = renderDialog()
    const mask = document.querySelector('[aria-hidden="true"]')
    expect(mask).not.toBeNull()
    fireEvent.click(mask!)
    await waitFor(() => { expect(dismiss).toHaveBeenCalled() })
  })
})
