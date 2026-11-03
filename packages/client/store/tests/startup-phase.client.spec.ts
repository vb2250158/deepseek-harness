import { afterEach, describe, expect, it, vi } from 'vitest'
import { recordStartupPhase } from '../src/startup-phase.ts'

afterEach(() => { vi.restoreAllMocks() })

function watchMeasurements() {
  const entries: PerformanceMeasure[] = []
  vi.spyOn(performance, 'getEntriesByName').mockImplementation(() => entries)
  const measure = vi.spyOn(performance, 'measure').mockImplementation((name, options) => {
    const detail: unknown = typeof options === 'object' ? options.detail : undefined
    const entry: PerformanceMeasure = { name, entryType: 'measure', startTime: 0, duration: 1, detail, toJSON: () => ({}) }
    entries.push(entry)
    return entry
  })
  return { entries, measure }
}

describe('first-screen startup results', () => {
  it('defaults successful commits explicitly and records each stage independently', () => {
    const { entries, measure } = watchMeasurements()
    recordStartupPhase('session-list')
    recordStartupPhase('session-content')
    expect(entries.map((entry): unknown => entry.detail)).toEqual([
      { version: 1, kind: 'phase', stage: 'session-list', outcome: 'committed' },
      { version: 1, kind: 'phase', stage: 'session-content', outcome: 'committed' },
    ])
    expect(measure).toHaveBeenCalledTimes(2)
  })

  it('retains the first non-visible result when later navigation commits the surface', () => {
    const { entries, measure } = watchMeasurements()
    recordStartupPhase('session-content', { outcome: 'not-visible', reason: 'initial-main-panel' })
    recordStartupPhase('session-content')
    expect(measure).toHaveBeenCalledTimes(1)
    expect(entries[0]?.detail).toEqual({ version: 1, kind: 'phase', stage: 'session-content', outcome: 'not-visible', reason: 'initial-main-panel' })
  })

  it('contains optional User Timing failures', () => {
    const { measure } = watchMeasurements()
    measure.mockImplementation(() => { throw new Error('User Timing unavailable') })
    expect(() => { recordStartupPhase('session-list') }).not.toThrow()
  })
})
