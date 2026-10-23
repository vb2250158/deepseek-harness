/**
 * The `sessionStats` projection unit: a pure fold of step boundaries, stream
 * embedded streams, tool and compaction pairs, and assembled messages into whole-log counts
 * and wall times.
 *
 * `step/end` — not `assistant/message` — is the counted step event because it
 * is the step lifecycle authority: the loop appends exactly one per entered
 * step, in a `finally`, so completed, failed, cancelled, and max-tokens steps
 * all land one. Counting assembled assistant messages instead would overcount
 * max-tokens usage-host messages (empty content, excluded from the surface)
 * and undercount cancelled steps (aborted before the message assembles).
 *
 * The wall-time folds mirror the client window fold field by field
 * (`deriveStats` in dsh-client-ui-conversation, that fold's whole-window
 * fallback role): model time is `step/start` → `assistant/message` excluding compaction, first
 * token is the first non-empty delta chunk and survives an in-step
 * `llm/retry`, decode spans first token → assembled message on steps that
 * also report output tokens, and tool time pairs `tool/call` → `tool/result`
 * by callId. Closed-turn time includes preparation, stopping and incomplete
 * steps. Other time is the complement of recorded activity intervals inside
 * closed turns; overlapping intervals contribute once to this coverage.
 *
 * @module @deepseek-ai/dsh-session-stats/projection
 */

import { z } from 'zod'
import { assistantStreamFirstTokenTime } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-compaction/types'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'


/** Accumulated whole-log figures (the view is exactly these totals). */
interface SessionStatsTotals {
  /** Summed matched turn/start → turn/end wall time, ms. */
  turnMs: number
  /** Closed-turn time outside assembled model, matched tool and compaction intervals, ms. */
  otherMs: number
  /** Distinct turns with at least one closed step so far. */
  turns: number
  /** Closed steps so far. */
  steps: number
  /** Summed model wall time over message-assembling steps, ms. */
  llmMs: number
  /** Summed matched tool call→result wall time, ms. */
  toolMs: number
  /** Completed compaction attempts, including failed attempts, ms. */
  compactionMs: number
  /** Summed first-token latency over `ttftSteps`, ms. */
  ttftMs: number
  /** Steps carrying a recorded first token. */
  ttftSteps: number
  /** Summed decode wall time over usage-reporting steps, ms. */
  decodeMs: number
  /** Summed provider output tokens over the same steps. */
  decodeTokens: number
}

/**
 * Fold state: the totals plus the in-flight boundaries they accrue from.
 * Turn numbers are host-assigned and monotonic per session, so a single
 * `lastTurn` slot decides "first closed step of a new turn"; the state is
 * plain JSON per the unit contract (persisted-cache precondition).
 */
interface SessionStatsState extends SessionStatsTotals {
  /** Current turn and the union of its recorded activity intervals. */
  openTurn: {
    turn: number
    startTime: number
    spans: { startTime: number; endTime: number }[]
  } | null
  /** Turn of the last counted `step/end`; null before the first. */
  lastTurn: number | null
  /** The open step's boundary facts; null outside a step or after its message assembled. */
  openStep: {
    turn: number
    step: number
    startTime: number
    firstTokenTime: number | null
    compactionSpans: { startTime: number; endTime: number }[]
  } | null
  /** Dispatch times of tool calls whose result has not landed, by callId. */
  pendingCalls: Record<string, number>
  /** Start times of compaction attempts awaiting their matching end. */
  pendingCompactions: Record<string, number>
}

const sessionStatsSchema = z.object({
  turnMs: z.number().nonnegative(),
  otherMs: z.number().nonnegative(),
  turns: z.number().int().nonnegative(),
  steps: z.number().int().nonnegative(),
  llmMs: z.number().nonnegative(),
  toolMs: z.number().nonnegative(),
  compactionMs: z.number().nonnegative().default(0),
  ttftMs: z.number().nonnegative(),
  ttftSteps: z.number().int().nonnegative(),
  decodeMs: z.number().nonnegative(),
  decodeTokens: z.number().nonnegative(),
}).strict()

/**
 * The fold state's shape (totals plus in-flight boundaries), validated on
 * persisted-cache rows after their `ver` gate — the unit's input boundary.
 * The view is a strict subset of the state, so this schema extends
 * `sessionStatsSchema` (the wire output boundary) with the boundary fields.
 */
const sessionStatsStateSchema = sessionStatsSchema.extend({
  turnMs: z.number().nonnegative(),
  otherMs: z.number().nonnegative(),
  openTurn: z.object({
    turn: z.number().int().nonnegative(),
    startTime: z.number().nonnegative(),
    spans: z.array(z.object({ startTime: z.number().nonnegative(), endTime: z.number().nonnegative() })),
  }).nullable(),
  compactionMs: z.number().nonnegative(),
  lastTurn: z.number().int().nonnegative().nullable(),
  openStep: z.object({
    turn: z.number().int().nonnegative(),
    step: z.number().int().nonnegative(),
    startTime: z.number().nonnegative(),
    firstTokenTime: z.number().nonnegative().nullable(),
    compactionSpans: z.array(z.object({ startTime: z.number().nonnegative(), endTime: z.number().nonnegative() })),
  }).nullable(),
  pendingCalls: z.record(z.string(), z.number().nonnegative()),
  pendingCompactions: z.record(z.string(), z.number().nonnegative()),
})

/** Add a recorded interval to the current turn without counting overlaps twice. */
function accountTurn(state: SessionStatsState, start: number, end: number): SessionStatsState['openTurn'] {
  const open = state.openTurn
  if (open === null || end <= Math.max(start, open.startTime)) return open
  const ordered = [...open.spans, { startTime: Math.max(start, open.startTime), endTime: end }]
    .sort((a, b) => a.startTime - b.startTime)
  const spans: NonNullable<SessionStatsState['openTurn']>['spans'] = []
  for (const span of ordered) {
    const previous = spans.at(-1)
    if (previous !== undefined && span.startTime <= previous.endTime) {
      spans[spans.length - 1] = { startTime: previous.startTime, endTime: Math.max(previous.endTime, span.endTime) }
    } else spans.push(span)
  }
  return { ...open, spans }
}

/** Model interval excluding disjoint, session-serialized compaction attempts. */
function modelElapsed(start: number, end: number, spans: readonly { startTime: number; endTime: number }[]): number {
  const excluded = spans.reduce((sum, span) => sum + Math.max(0, Math.min(end, span.endTime) - Math.max(start, span.startTime)), 0)
  return Math.max(0, end - start - excluded)
}

/**
 * Provider-reported completion tokens, guarded the way the window fold guards
 * node usage.
 * @param usage - the assistant/message event's optional usage record.
 * @returns the output-token count, or null when unreported or invalid.
 */
function usageOutputTokens(usage: unknown): number | null {
  if (typeof usage !== 'object' || usage === null) return null
  const value = (usage as { outputTokens?: unknown }).outputTokens
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

/** The `sessionStats` unit registered on `ctx.sessionProjections` (exported for the unit spec). */
export const sessionStatsProjectionDefinition = {
  key: 'sessionStats',
  stateVersion: 3,
  stateSchema: sessionStatsStateSchema,
  init: () => ({
    turnMs: 0,
    otherMs: 0,
    openTurn: null,
    turns: 0,
    steps: 0,
    llmMs: 0,
    toolMs: 0,
    compactionMs: 0,
    ttftMs: 0,
    ttftSteps: 0,
    decodeMs: 0,
    decodeTokens: 0,
    lastTurn: null,
    openStep: null,
    pendingCalls: {},
    pendingCompactions: {},
  }),
  apply: (state, event) => {
    // Every uninteresting event returns the same reference (Object.is gates the change feed).
    switch (event.type) {
      case 'turn/start':
        return { ...state, openTurn: { turn: event.data.turn, startTime: event.time, spans: [] } }
      case 'step/start':
        return {
          ...state,
          openStep: { turn: event.data.turn, step: event.data.step, startTime: event.time, firstTokenTime: null, compactionSpans: [] },
        }
      case 'compaction/start':
        return { ...state, pendingCompactions: { ...state.pendingCompactions, [event.data.compactionId]: event.time } }
      case 'compaction/end': {
        const id = event.data.compactionId
        const start = Object.hasOwn(state.pendingCompactions, id) ? state.pendingCompactions[id] : undefined
        if (start === undefined) return state
        return {
          ...state,
          compactionMs: state.compactionMs + Math.max(0, event.time - start),
          openTurn: accountTurn(state, start, event.time),
          pendingCompactions: Object.fromEntries(Object.entries(state.pendingCompactions).filter(([key]) => key !== id)),
          openStep: state.openStep === null ? null : { ...state.openStep,
            compactionSpans: [...state.openStep.compactionSpans, { startTime: start, endTime: event.time }] },
        }
      }
      case 'assistant/attempt': {
        const open = state.openStep
        if (open === null || open.turn !== event.data.turn || open.step !== event.data.step) return state
        const first = assistantStreamFirstTokenTime(event.data.stream) ?? null
        if (open.firstTokenTime !== null || first === null) return state
        return { ...state, openStep: { ...open, firstTokenTime: first } }
      }
      case 'assistant/message': {
        const open = state.openStep
        if (open === null || open.turn !== event.data.turn || open.step !== event.data.step) return state
        const firstToken = open.firstTokenTime ?? assistantStreamFirstTokenTime(event.data.stream) ?? null
        // One assembled message per step: closing the boundary means a
        // defensive duplicate cannot accrue twice.
        const next: SessionStatsState = {
          ...state,
          llmMs: state.llmMs + modelElapsed(open.startTime, event.time, open.compactionSpans),
          openTurn: accountTurn(state, open.startTime, event.time),
          openStep: null,
        }
        if (firstToken !== null) {
          next.ttftMs += modelElapsed(open.startTime, firstToken, open.compactionSpans)
          next.ttftSteps += 1
          const outputTokens = usageOutputTokens(event.data.usage)
          if (outputTokens !== null) {
            next.decodeMs += modelElapsed(firstToken, event.time, open.compactionSpans)
            next.decodeTokens += outputTokens
          }
        }
        return next
      }
      case 'tool/call':
        return { ...state, pendingCalls: { ...state.pendingCalls, [event.data.callId]: event.time } }
      case 'tool/result': {
        // Own-key check: callId is provider-minted (model/tool JSON boundary),
        // so a prototype property name ('constructor', 'toString') on a result
        // with no recorded call must read as unmatched, not as an inherited
        // function that would poison toolMs with NaN.
        const callId = event.data.message.source.callId
        const dispatched = Object.hasOwn(state.pendingCalls, callId) ? state.pendingCalls[callId] : undefined
        if (dispatched === undefined) return state
        const pendingCalls = Object.fromEntries(
          Object.entries(state.pendingCalls).filter(([id]) => id !== callId),
        )
        return { ...state, toolMs: state.toolMs + Math.max(0, event.time - dispatched),
          openTurn: accountTurn(state, dispatched, event.time), pendingCalls }
      }
      case 'step/end':
        return {
          ...state,
          turns: state.lastTurn === event.data.turn ? state.turns : state.turns + 1,
          steps: state.steps + 1,
          lastTurn: event.data.turn,
          openStep: null,
        }
      case 'turn/end': {
        // A call whose result never landed belongs to a cancelled or failed
        // turn; results always land within their turn, so drop the leftovers
        // instead of growing persisted state forever.
        const open = state.openTurn
        if (open === null || open.turn !== event.data.turn) {
          return Object.keys(state.pendingCalls).length === 0 ? state : { ...state, pendingCalls: {} }
        }
        const elapsed = Math.max(0, event.time - open.startTime)
        const covered = open.spans.reduce((sum, span) => sum
          + Math.max(0, Math.min(event.time, span.endTime) - span.startTime), 0)
        return { ...state, turnMs: state.turnMs + elapsed,
          otherMs: state.otherMs + Math.max(0, elapsed - covered), openTurn: null, pendingCalls: {} }
      }
      default:
        return state
    }
  },
  wire: {
    viewSchema: sessionStatsSchema,
    view: state => ({
      turnMs: state.turnMs,
      otherMs: state.otherMs,
      turns: state.turns,
      steps: state.steps,
      llmMs: state.llmMs,
      toolMs: state.toolMs,
      compactionMs: state.compactionMs,
      ttftMs: state.ttftMs,
      ttftSteps: state.ttftSteps,
      decodeMs: state.decodeMs,
      decodeTokens: state.decodeTokens,
    }),
    summary: false,
  },
} satisfies ProjectionDefinition<'sessionStats', SessionStatsState>
