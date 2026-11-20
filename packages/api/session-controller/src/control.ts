/** Live Session projection state with reconnect baselines. */

import type { Context } from '@deepseek-ai/cordis'
import { Deque } from '@deepseek-ai/dsh-deque'
import type {
  Session, SessionId,
} from '@deepseek-ai/dsh-session'
import type {
  SessionControlBaseline,
  SessionControlFrame,
  SessionProjectionBaseline,
  SessionProjectionUpdate,
  SessionProjectionValues,
} from './types.ts'

/** Owns the Host-wide Session control stream. */
export class SessionControlController {
  private readonly streams = new Set<ControlQueue>()

  /** @param ctx - Host context carrying live Agent and projection services. */
  constructor(private readonly ctx: Context) {
    ctx.sessionProjections.onEventChanged((session, changes, seq) => {
      this.broadcast({
        type: 'projection',
        sessionId: session.id,
        seq,
        // Every projection definition validates its value before change publication.
        changes: changes as SessionProjectionUpdate['changes'],
      })
    })
    ctx.effect(() => () => {
      for (const stream of this.streams) stream.end()
      this.streams.clear()
    }, 'session-controller.control')
  }

  /**
   * Open one generation of Host-wide live control state.
   * @param signal - Remote stream cancellation.
   * @param compact - Deliver on-demand key watermarks instead of values.
   * @returns one complete baseline followed by live replacement frames.
   */
  async *control(signal: AbortSignal, compact = false): AsyncIterable<SessionControlFrame> {
    signal.throwIfAborted()
    const queue = new ControlQueue(compact)
    this.streams.add(queue)
    try {
      yield { type: 'baseline', value: this.baseline(compact) }
      yield* queue.iterate(signal)
    } finally {
      this.streams.delete(queue)
      queue.end()
    }
  }

  private baseline(compact: boolean): SessionControlBaseline {
    const sessions = this.ctx.sessions.list()
    return {
      projections: this.projectionBaseline(sessions, compact),
    }
  }

  private projectionBaseline(
    sessions: readonly Session[], compact: boolean,
  ): Readonly<Record<SessionId, SessionProjectionBaseline>> {
    const blocks = Object.create(null) as Record<SessionId, SessionProjectionBaseline>
    const selection = compact ? this.ctx.sessionProjections.controlKeys() : undefined
    const deferredKeys = selection === undefined ? [] : [...selection.deferred]
    for (const session of sessions) {
      const snapshot = this.ctx.sessionProjections.snapshot(session, selection?.eager)
      blocks[session.id] = {
        asOfSeq: snapshot.asOfSeq,
        ...(deferredKeys.length === 0 ? {} : { deferredKeys }),
        // Every projection definition validates its value before snapshot publication.
        values: snapshot.values as SessionProjectionValues,
      }
    }
    return blocks
  }

  private broadcast(frame: Extract<SessionControlFrame, { type: 'projection' }>): void {
    let compact: SessionControlFrame | undefined
    for (const stream of this.streams) {
      if (!stream.compact) { stream.push(frame); continue }
      if (compact === undefined) {
        const deferred: ReadonlySet<string> = this.ctx.sessionProjections.controlKeys().deferred
        const deferredKeys = frame.changes.map(change => change.key).filter(key => deferred.has(key))
        compact = deferredKeys.length === 0 ? frame : {
          ...frame, changes: frame.changes.filter(change => !deferred.has(change.key)), deferredKeys,
        }
      }
      stream.push(compact)
    }
  }
}

class ControlQueue {
  private readonly buffer = new Deque<SessionControlFrame>()
  private wake: (() => void) | undefined
  private done = false

  constructor(readonly compact: boolean) {}

  push(frame: SessionControlFrame): void {
    if (this.done) return
    this.buffer.pushBack(frame)
    const wake = this.wake
    this.wake = undefined
    wake?.()
  }

  end(): void {
    if (this.done) return
    this.done = true
    const wake = this.wake
    this.wake = undefined
    wake?.()
  }

  async *iterate(signal: AbortSignal): AsyncIterable<SessionControlFrame> {
    const onAbort = (): void => { this.end() }
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      while (!this.done && !signal.aborted) {
        const frame = this.buffer.popFront()
        if (frame !== undefined) {
          yield frame
          continue
        }
        await new Promise<void>((resolve) => { this.wake = resolve })
      }
      while (this.buffer.size > 0 && !signal.aborted) yield this.buffer.popFront() as SessionControlFrame
    } finally {
      signal.removeEventListener('abort', onAbort)
      this.end()
    }
  }
}
