// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GoalSnapshot } from '@deepseek-ai/dsh-goal/client'
import { makeTranslate, RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { GoalBar } from '../src/client/GoalBar.tsx'
import type { GoalActionResult, GoalBarActions } from '../src/client/slots.ts'
import { zh } from '../src/client/locales.ts'

const t: Parameters<typeof GoalBar>[0]['t'] = makeTranslate(zh, commonZh)

afterEach(cleanup)

function makeGoal(over: Partial<GoalSnapshot> = {}): GoalSnapshot {
  return {
    id: 'g1' as GoalSnapshot['id'],
    revision: 1,
    objective: 'Ship the redesign',
    phase: 'active',
    maxGoalRounds: 4,
    ...over,
  }
}

function makeActions() {
  return {
    onEdit: vi.fn<GoalBarActions['onEdit']>(() => {}),
    onPause: vi.fn<GoalBarActions['onPause']>(() => Promise.resolve({ ok: true, value: undefined })),
    onResume: vi.fn<GoalBarActions['onResume']>(() => Promise.resolve({ ok: true, value: undefined })),
    onClear: vi.fn<GoalBarActions['onClear']>(() => Promise.resolve({ ok: true, value: undefined })),
  } satisfies GoalBarActions
}

describe('GoalBar', () => {
  it('renders nothing while loading, absent, or when the goal is complete', () => {
    const actions = makeActions()
    const loading = render(<GoalBar goal={undefined} {...actions} t={t} />)
    expect(loading.container.firstChild).toBeNull()
    cleanup()

    const absent = render(<GoalBar goal={null} {...actions} t={t} />)
    expect(absent.container.firstChild).toBeNull()
    cleanup()

    const complete = render(<GoalBar goal={makeGoal({ phase: 'complete' })} {...actions} t={t} />)
    expect(complete.container.firstChild).toBeNull()
  })

  it('active goal: goal glyph, "进行中的目标", truncated objective, edit and clear actions', () => {
    const actions = makeActions()
    render(<GoalBar goal={makeGoal()} {...actions} t={t} />)
    expect(screen.getByText('进行中的目标')).toBeTruthy()
    expect(screen.getByText('Ship the redesign')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '清除目标' }))
    expect(actions.onClear).toHaveBeenCalledTimes(1)
  })

  it('single-flights rapid clear clicks and hides the committed goal before its projection catches up', async () => {
    const actions = makeActions()
    let resolveClear!: (result: GoalActionResult) => void
    actions.onClear.mockImplementation(() => new Promise((resolve) => { resolveClear = resolve }))
    const { container, rerender } = render(<GoalBar goal={makeGoal()} {...actions} t={t} />)
    const clear = screen.getByRole<HTMLButtonElement>('button', { name: '清除目标' })

    act(() => {
      clear.click()
      clear.click()
    })
    expect(actions.onClear).toHaveBeenCalledTimes(1)
    expect(clear.disabled).toBe(true)

    await act(async () => { resolveClear({ ok: true, value: undefined }) })
    expect(container.firstChild).toBeNull()

    rerender(<GoalBar goal={makeGoal({ id: 'g2' as GoalSnapshot['id'], objective: 'Next goal' })} {...actions} t={t} />)
    expect(screen.getByText('Next goal')).toBeTruthy()
  })

  it('edit opens the goal-edit dialog with the projected objective as its seed', () => {
    const actions = makeActions()
    render(<GoalBar goal={makeGoal()} {...actions} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: '编辑目标' }))
    expect(actions.onEdit).toHaveBeenCalledWith('Ship the redesign')
  })

  it('the strip carries no inline editor: one click on edit never reveals a textbox', () => {
    const actions = makeActions()
    render(<GoalBar goal={makeGoal()} {...actions} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: '编辑目标' }))
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
    expect(screen.queryByRole('button', { name: '取消' })).toBeNull()
  })

  it('edit stays available while a mutation is pending so the dialog can still open', () => {
    const actions = makeActions()
    let resolveClear!: (result: GoalActionResult) => void
    actions.onClear.mockImplementation(() => new Promise((resolve) => { resolveClear = resolve }))
    render(<GoalBar goal={makeGoal()} {...actions} t={t} />)
    act(() => { screen.getByRole('button', { name: '清除目标' }).click() })

    const edit = screen.getByRole<HTMLButtonElement>('button', { name: '编辑目标' })
    expect(edit.disabled).toBe(true)
    act(() => { resolveClear({ ok: true, value: undefined }) })
  })

  it('a new goal identity reports the new objective to the dialog on the next open', () => {
    const actions = makeActions()
    const { rerender } = render(<GoalBar goal={makeGoal()} {...actions} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: '编辑目标' }))
    expect(actions.onEdit).toHaveBeenLastCalledWith('Ship the redesign')

    rerender(<GoalBar goal={makeGoal({ id: 'g2' as GoalSnapshot['id'], objective: 'New goal' })} {...actions} t={t} />)
    expect(screen.getByText('进行中的目标')).toBeTruthy()
    expect(screen.getByText('New goal')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '编辑目标' }))
    expect(actions.onEdit).toHaveBeenLastCalledWith('New goal')

    rerender(<GoalBar goal={null} {...actions} t={t} />)
    expect(screen.queryByText('进行中的目标')).toBeNull()
  })

  it('active goal: the pause action pauses', () => {
    const actions = makeActions()
    render(<GoalBar goal={makeGoal()} activation="armed" {...actions} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: '暂停目标' }))
    expect(actions.onPause).toHaveBeenCalledTimes(1)
  })

  it('active disarmed goal: "未运行的目标" with a resume action instead of pause', () => {
    const actions = makeActions()
    render(<GoalBar goal={makeGoal()} activation="disarmed" {...actions} t={t} />)
    expect(screen.getByText(zh['phase.active.disarmed'])).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '恢复目标' }))
    expect(actions.onResume).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: '暂停目标' })).toBeNull()
  })

  it('paused goal: "已暂停的目标" with a resume action before edit', () => {
    const actions = makeActions()
    render(<GoalBar goal={makeGoal({ phase: 'paused' })} {...actions} t={t} />)
    expect(screen.getByText('已暂停的目标')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '恢复目标' }))
    expect(actions.onResume).toHaveBeenCalledTimes(1)
  })

  it('portals an action tooltip out of the strip, where the input card cannot cover it', () => {
    vi.useFakeTimers()
    try {
      render(<GoalBar goal={makeGoal()} activation="armed" {...makeActions()} t={t} />)
      fireEvent.pointerEnter(screen.getByRole('button', { name: '暂停目标' }))
      act(() => { vi.advanceTimersByTime(500) })
      const tooltip = screen.getByRole('tooltip')
      expect(tooltip.textContent).toBe('暂停目标')
      expect(tooltip.parentElement).toBe(document.body)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a new goal identity drops any suppression and shows the new objective', () => {
    const actions = makeActions()
    const { rerender } = render(<GoalBar goal={makeGoal()} {...actions} t={t} />)
    rerender(<GoalBar goal={makeGoal({ id: 'g2' as GoalSnapshot['id'], objective: 'New goal' })} {...actions} t={t} />)
    expect(screen.getByText('进行中的目标')).toBeTruthy()
    expect(screen.getByText('New goal')).toBeTruthy()

    rerender(<GoalBar goal={null} {...actions} t={t} />)
    expect(screen.queryByText('进行中的目标')).toBeNull()
  })

  it('blocked goal: "受阻的目标" with the block reason as the strip tooltip', () => {
    const actions = makeActions()
    const goal = makeGoal({ phase: 'blocked', blockedReason: { code: 'stalled', message: 'No progress in 3 rounds' } })
    render(<GoalBar goal={goal} {...actions} t={t} />)
    expect(screen.getByText('受阻的目标')).toBeTruthy()
    expect(screen.getByText('受阻的目标').closest('[title]')?.getAttribute('title')).toBe('No progress in 3 rounds')
  })

  it('blocked goal: offers resume and no pause', () => {
    const actions = makeActions()
    render(<GoalBar goal={makeGoal({ phase: 'blocked' })} {...actions} t={t} />)
    expect(screen.queryByRole('button', { name: '暂停目标' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '恢复目标' }))
    expect(actions.onResume).toHaveBeenCalledTimes(1)
  })

  it('blocked goal without a reason carries no tooltip', () => {
    const actions = makeActions()
    render(<GoalBar goal={makeGoal({ phase: 'blocked' })} {...actions} t={t} />)
    expect(screen.getByText('受阻的目标')).toBeTruthy()
    expect(screen.getByText('受阻的目标').closest('[title]')).toBeNull()
  })

  it('reports resume and clear failures without hiding the goal', async () => {
    const actions = makeActions()
    actions.onResume.mockResolvedValue({ ok: false, error: new RemoteError('gateway/internal', 'resume failed', {}) })
    const { rerender } = render(<GoalBar goal={makeGoal({ phase: 'paused' })} {...actions} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: '恢复目标' }))
    expect((await screen.findByRole('alert')).textContent).toBe('resume failed (gateway/internal)')

    actions.onClear.mockResolvedValue({
      ok: false, error: new RemoteError('session/agent-busy', 'clear failed', { reason: 'clear failed' }),
    })
    rerender(<GoalBar goal={makeGoal()} {...actions} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: '清除目标' }))
    expect((await screen.findByRole('alert')).textContent).toBe('clear failed (session/agent-busy)')
    expect(screen.getByText('Ship the redesign')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '清除目标' }))
    await waitFor(() => { expect(actions.onClear).toHaveBeenCalledTimes(2) })
  })
})
