/** Native User Timing records for the finite Web startup sequence. */

/** Startup work owned by the Web entry, composition, or renderer mount effect. */
export type StartupStage = 'boot-ready' | 'prefetch' | 'plugins' | 'mount' | 'react-mount'

/** Actual entry states that can close a startup activation interval. */
export type StartupEntryState = 'loading' | 'pending' | 'active' | 'failed'

/** Versioned metadata available to late-loading PerformanceObserver consumers. */
export interface StartupMeasureDetail {
  version: 1
  kind: 'phase' | 'plugin'
  stage: StartupStage
  plugin?: string
  state?: StartupEntryState
}

interface StartupClock {
  now(): number
  measure(name: string, options: { start: number; end: number; detail: StartupMeasureDetail }): unknown
}

function now(clock: StartupClock | undefined): number | undefined {
  try {
    return clock?.now()
  } catch (_clockError) {
    // Optional diagnostics never change the boot result in restricted carriers.
    return undefined
  }
}

function finish(clock: StartupClock | undefined, start: number | undefined, detail: StartupMeasureDetail): void {
  if (clock === undefined || start === undefined) return
  const end = now(clock)
  if (end === undefined) return
  try {
    clock.measure('dsh:startup', { start, end, detail })
  } catch (_measurementError) {
    // Some test and embedded carriers expose a clock without User Timing support.
  }
}

/**
 * Start a phase and return its idempotent completion callback.
 * @param stage - Owning startup phase; mount ends when its effect is installed, not at React commit.
 * @param clock - Native Performance API, or a controlled test clock.
 * @returns Closes one wall-time interval; unavailable diagnostics are a no-op.
 */
export function beginStartupPhase(stage: StartupStage, clock: StartupClock | undefined = globalThis.performance): () => void {
  const start = now(clock)
  let ended = false
  return () => {
    if (ended) return
    ended = true
    finish(clock, start, { version: 1, kind: 'phase', stage })
  }
}

/** Tracks each manifest row only until its first activation or the startup audit ends. */
export class StartupEntryMeasures {
  private readonly entries = new Map<string, { start: number | undefined; state: StartupEntryState }>()
  private readonly completed = new Set<string>()
  private ended = false

  /**
   * @param names - Exact manifest entry ids; nested fibers are not startup entries.
   * @param clock - Native Performance API, or a controlled test clock.
   */
  constructor(private readonly names: ReadonlySet<string>, private readonly clock: StartupClock | undefined = globalThis.performance) {}

  /**
   * Observe the existing boot progress callback without altering its delivery.
   * @param name - Manifest plugin id.
   * @param state - Current projected lifecycle state.
   */
  update(name: string, state: string): void {
    if (this.ended || !this.names.has(name) || this.completed.has(name)) return
    if (state !== 'loading' && state !== 'pending' && state !== 'active' && state !== 'failed') return
    const current = this.entries.get(name) ?? { start: now(this.clock), state }
    current.state = state
    this.entries.set(name, current)
    if (state === 'active' || state === 'failed') this.close(name, current)
  }

  /** Close remaining loading or pending observations when startup auditing finishes. */
  finish(): void {
    if (this.ended) return
    this.ended = true
    for (const [name, entry] of this.entries) this.close(name, entry)
  }

  private close(name: string, entry: { start: number | undefined; state: StartupEntryState }): void {
    finish(this.clock, entry.start, { version: 1, kind: 'plugin', stage: 'plugins', plugin: name, state: entry.state })
    this.entries.delete(name)
    this.completed.add(name)
  }
}
