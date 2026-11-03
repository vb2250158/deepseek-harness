/**
 * Record one first-screen result per document, measured from its time origin.
 * @param stage - The first-screen surface; failed loads must not call this function.
 * @param result - Successful visible commit by default, or an explicit layout-owned non-visible result.
 */
export function recordStartupPhase(
  stage: 'session-list' | 'session-content',
  result: { readonly outcome: 'committed' }
    | { readonly outcome: 'not-visible'; readonly reason: 'initial-main-panel' | 'sidebar-collapsed' }
      = { outcome: 'committed' },
): void {
  try {
    const clock = globalThis.performance
    if (clock.getEntriesByName('dsh:startup', 'measure').some((entry) => {
      const detail: unknown = (entry as PerformanceMeasure).detail
      return detail !== null && typeof detail === 'object'
        && 'version' in detail && detail.version === 1
        && 'kind' in detail && detail.kind === 'phase'
        && 'stage' in detail && detail.stage === stage
    })) return
    clock.measure('dsh:startup', {
      start: 0, end: clock.now(), detail: { version: 1, kind: 'phase', stage, ...result },
    })
  } catch (_measurementError) {
    // Optional diagnostics must not affect rendering in carriers without User Timing.
  }
}
