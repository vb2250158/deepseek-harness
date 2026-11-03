import { performance as nativePerformance } from 'node:perf_hooks'
import { describe, expect, it, vi } from 'vitest'
import { beginStartupPhase, StartupEntryMeasures, type StartupMeasureDetail } from '../src/startup-measures.ts'

function controlledClock() {
  let at = 0
  const entries: { name: string; start: number; end: number; detail: StartupMeasureDetail }[] = []
  return {
    entries,
    set: (value: number) => { at = value },
    now: () => at,
    measure: (name: string, options: { start: number; end: number; detail: StartupMeasureDetail }) => {
      entries.push({ name, ...options })
    },
  }
}

describe('startup measures', () => {
  it('records one completed phase in the monotonic clock coordinates', () => {
    const clock = controlledClock()
    clock.set(12)
    const end = beginStartupPhase('boot-ready', clock)
    expect(clock.entries).toEqual([])
    clock.set(29)
    end()
    end()
    expect(clock.entries).toEqual([{ name: 'dsh:startup', start: 12, end: 29, detail: { version: 1, kind: 'phase', stage: 'boot-ready' } }])
  })

  it('closes overlapping entries at first activation or audit, without measuring active residency', () => {
    const clock = controlledClock()
    const rows = new StartupEntryMeasures(new Set(['provider', 'consumer', 'missing', 'failed']), clock)
    for (const name of ['provider', 'consumer', 'missing', 'failed']) rows.update(name, 'loading')
    rows.update('nested-fiber', 'active')
    clock.set(5)
    rows.update('consumer', 'pending')
    clock.set(9)
    rows.update('provider', 'active')
    clock.set(13)
    rows.update('consumer', 'active')
    rows.update('failed', 'failed')
    clock.set(20)
    rows.update('provider', 'loading')
    rows.finish()
    clock.set(100)
    rows.update('missing', 'active')
    rows.finish()
    expect(clock.entries.map(entry => [entry.detail.plugin, entry.start, entry.end, entry.detail.state])).toEqual([
      ['provider', 0, 9, 'active'], ['consumer', 0, 13, 'active'], ['failed', 0, 13, 'failed'], ['missing', 0, 20, 'loading'],
    ])
    expect(clock.entries.every(entry => entry.detail.kind === 'plugin' && entry.detail.stage === 'plugins')).toBe(true)
  })

  it('closes a dependency-pending row with its actual state', () => {
    const clock = controlledClock()
    const rows = new StartupEntryMeasures(new Set(['waiting']), clock)
    rows.update('waiting', 'loading')
    clock.set(3)
    rows.update('waiting', 'pending')
    clock.set(8)
    rows.finish()
    expect(clock.entries[0]?.detail.state).toBe('pending')
    expect(clock.entries[0]?.end).toBe(8)
  })

  it('leaves early native measures available to a later consumer', () => {
    const end = beginStartupPhase('prefetch', nativePerformance)
    end()
    const entries = nativePerformance.getEntriesByName('dsh:startup', 'measure')
    const latest = entries.at(-1)
    expect(latest?.entryType).toBe('measure')
    expect(latest?.startTime).toBeGreaterThanOrEqual(0)
    expect(latest?.duration).toBeGreaterThanOrEqual(0)
    expect(latest?.toJSON()).toMatchObject({ name: 'dsh:startup' })
    nativePerformance.clearMeasures('dsh:startup')
  })

  it('does not change startup when Performance is absent or measure rejects', () => {
    const original = globalThis.performance
    vi.stubGlobal('performance', undefined)
    try { expect(() => { beginStartupPhase('plugins')() }).not.toThrow() } finally { vi.stubGlobal('performance', original) }
    const clock = { now: () => 1, measure: () => { throw new Error('carrier has no User Timing') } }
    const rows = new StartupEntryMeasures(new Set(['a']), clock)
    expect(() => {
      beginStartupPhase('mount', clock)()
      rows.update('a', 'loading')
      rows.update('a', 'active')
      rows.finish()
    }).not.toThrow()
  })
})
