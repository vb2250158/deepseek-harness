/**
 * The `sessionStats` projection unit: mounting the plugin beside the
 * projection registry serves whole-log counts and wall times folded from step
 * boundaries, chunks, tool pairs, and assembled messages; compositions
 * without the registry are unaffected; unmounting the plugin removes the key
 * (HMR safety). The two counting regressions pinned here are the reasons the
 * fold counts step boundaries instead of assistant messages: a cancelled step
 * never assembles a message but still counts, and a max-tokens usage-host
 * message (empty content) adds no extra step. Wall-time math runs against the
 * exported definition directly, where event times are controlled.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { Context } from '@deepseek-ai/cordis'
import { createMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import * as SessionStatsPlugin from '@deepseek-ai/dsh-session-stats'
import { sessionStatsProjectionDefinition } from '@deepseek-ai/dsh-session-stats/src/projection.ts'
import type { SessionStatsProjection } from '@deepseek-ai/dsh-session-stats/types'

async function harness(withStatsPlugin: boolean): Promise<{ ctx: Context; session: Session }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  if (withStatsPlugin) await ctx.plugin(SessionStatsPlugin)
  return { ctx, session: ctx.sessions.create(SessionId('counted')) }
}

/** Close one step; returns the counted `step/end` seq. */
function closeStep(session: Session, turn: number, step: number): number {
  session.append('step/start', { turn, step })
  return session.append('step/end', { turn, step }).seq
}

/** Append the max-tokens usage-host shape: an assistant/message with empty content. */
function appendEmptyAssistantMessage(session: Session, turn: number, step: number): void {
  session.append('assistant/message', {
    stream: [],
    turn,
    step,
    message: createMessage({
      role: 'assistant',
      content: [],
      source: { kind: 'model', provider: 'mock', model: 'mock' },
    }),
  }, { surfaceOp: 'append' })
}

/** The all-zero projection value plus overrides, for exact fold expectations. */
function totals(overrides: Partial<SessionStatsProjection> = {}): SessionStatsProjection {
  return {
    turnMs: 0, otherMs: 0,
    turns: 0, steps: 0, llmMs: 0, toolMs: 0, compactionMs: 0, ttftMs: 0, ttftSteps: 0, decodeMs: 0, decodeTokens: 0,
    ...overrides,
  }
}

describe('sessionStats projection unit (registry drive)', () => {
  beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(1_000) })
  afterEach(() => { vi.restoreAllMocks() })
  it('serves zero figures on the empty log', async () => {
    const { ctx, session } = await harness(true)
    expect(ctx.sessionProjections.snapshot(session).values.sessionStats).toEqual(totals())
  })

  it('counts distinct turns and closed steps and notifies the change feed with the causing seq', async () => {
    const { ctx, session } = await harness(true)
    const changes: { key: string; value: unknown; seq: number }[] = []
    ctx.sessionProjections.onChanged((_session, key, value, seq) => {
      changes.push({ key, value, seq })
    })
    session.append('turn/start', { turn: 1 })
    const firstSeq = closeStep(session, 1, 1)
    const secondSeq = closeStep(session, 1, 2)
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    session.append('turn/start', { turn: 2 })
    const thirdSeq = closeStep(session, 2, 1)
    session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
    // Boundary events that carry no figure change (turn/start, empty-prune
    // turn/end, user input) fold to the same reference and stay silent;
    // step/start opens a boundary (internal state) and step/end commits the
    // counts, so each closed step notifies twice with the step/end value last.
    const counted = changes.filter(change => (change.value as SessionStatsProjection).steps > 0
      || change.seq === firstSeq)
    expect(changes.every(change => change.key === 'sessionStats')).toBe(true)
    expect(counted.map(change => ({ seq: change.seq, value: change.value }))).toContainEqual(
      { seq: firstSeq, value: totals({ turns: 1, steps: 1 }) },
    )
    expect(changes.at(-1)).toEqual({ key: 'sessionStats', value: totals({ turns: 2, steps: 3 }), seq: session.seq - 1 })
    const snapshot = ctx.sessionProjections.snapshot(session)
    expect(snapshot.values.sessionStats).toEqual(totals({ turns: 2, steps: 3 }))
    expect(snapshot.asOfSeq).toBe(session.seq - 1)
    expect(changes.map(change => change.seq)).toContain(secondSeq)
    expect(changes.map(change => change.seq)).toContain(thirdSeq)
  })

  it('does not count a rejected or empty turn that closes with no step', async () => {
    const { ctx, session } = await harness(true)
    session.append('turn/start', { turn: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'blocked' } })
    expect(ctx.sessionProjections.snapshot(session).values.sessionStats).toEqual(totals())
  })

  it('counts a cancelled step that closed without an assistant message', async () => {
    // Regression: an aborted stream never assembles assistant/message, but the
    // loop's finally still appends step/end — the step happened and counts.
    const { ctx, session } = await harness(true)
    session.append('turn/start', { turn: 1 })
    closeStep(session, 1, 1)
    session.append('turn/end', { turn: 1, reason: { kind: 'aborted', reason: { kind: 'legacy' } } })
    expect(ctx.sessionProjections.snapshot(session).values.sessionStats)
      .toMatchObject({ turns: 1, steps: 1 })
  })

  it('adds no extra step for a max-tokens usage-host assistant message', async () => {
    // Regression: the empty-content assistant/message exists only to host
    // usage and is excluded from the surface; the step counts once, from its
    // step/end, while the message contributes only its model wall time.
    const { ctx, session } = await harness(true)
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    appendEmptyAssistantMessage(session, 1, 1)
    session.append('step/end', { turn: 1, step: 1 })
    session.append('turn/end', { turn: 1, reason: { kind: 'max-tokens' } })
    expect(ctx.sessionProjections.snapshot(session).values.sessionStats)
      .toMatchObject({ turns: 1, steps: 1, ttftSteps: 0, decodeTokens: 0 })
  })

  it('folds steps already in the log when the plugin mounts late (lazy cell build)', async () => {
    const { ctx, session } = await harness(false)
    session.append('turn/start', { turn: 1 })
    closeStep(session, 1, 1)
    closeStep(session, 1, 2)
    session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await ctx.plugin(SessionStatsPlugin)
    expect(ctx.sessionProjections.snapshot(session).values.sessionStats)
      .toMatchObject({ turns: 1, steps: 2 })
  })

  it('has no sessionStats key without the plugin, and drops it when the plugin unloads (HMR safety)', async () => {
    const { ctx, session } = await harness(false)
    expect('sessionStats' in ctx.sessionProjections.snapshot(session).values).toBe(false)
    const fiber = await ctx.plugin(SessionStatsPlugin)
    session.append('turn/start', { turn: 1 })
    closeStep(session, 1, 1)
    expect(ctx.sessionProjections.snapshot(session).values.sessionStats)
      .toMatchObject({ turns: 1, steps: 1 })
    await fiber.dispose()
    expect('sessionStats' in ctx.sessionProjections.snapshot(session).values).toBe(false)
  })
})

/** Build one synthetic committed event with a controlled timestamp. */
function at(time: number, type: string, data: unknown): SessionEvent {
  return { type, seq: time, time, data } as unknown as SessionEvent
}

function attemptAt(
  time: number,
  chunks: readonly { readonly time: number; readonly chunk: StreamChunk }[],
  turn = 1,
  step = 1,
): SessionEvent {
  return at(time, 'assistant/attempt', {
    turn,
    step,
    stream: chunks.map(member => ({ type: 'chunk', ...member })),
  })
}

/** Fold a synthetic event list through the definition and view the result. */
function fold(events: readonly SessionEvent[]): SessionStatsProjection {
  const state = events.reduce<Parameters<typeof sessionStatsProjectionDefinition.apply>[0]>(
    (folded, event) => sessionStatsProjectionDefinition.apply(folded, event),
    sessionStatsProjectionDefinition.init(),
  )
  return sessionStatsProjectionDefinition.wire.view(state)
}

describe('sessionStats Loader composition', () => {
  it('publishes whole-turn coverage from the composed providers and durable lifecycle', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-stats-coverage-'))
    const config = join(dir, 'cordis.yml')
    writeFileSync(config, '- name: cordis:session-store\n- name: cordis:projection-registry\n- name: cordis:session-stats\n')
    const ctx = new Context()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    try {
      await ctx.plugin(Loader)
      ctx.loader.builtins.include = Include
      ctx.loader.builtins['session-store'] = SessionStore
      ctx.loader.builtins['projection-registry'] = SessionProjectionRegistry
      ctx.loader.builtins['session-stats'] = SessionStatsPlugin
      await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
      await ctx.loader.await()
      const session = ctx.sessions.create(SessionId('composed-coverage'))
      session.append('turn/start', { turn: 1 })
      clock.mockReturnValue(4_000)
      session.append('step/start', { turn: 1, step: 1 })
      clock.mockReturnValue(5_000)
      appendEmptyAssistantMessage(session, 1, 1)
      session.append('step/end', { turn: 1, step: 1 })
      clock.mockReturnValue(9_000)
      session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
      expect(ctx.sessionProjections.snapshot(session).values.sessionStats)
        .toEqual(totals({ turns: 1, steps: 1, turnMs: 8_000, otherMs: 7_000, llmMs: 1_000 }))
    } finally {
      clock.mockRestore()
      await ctx.fiber.dispose()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('sessionStats wall-time fold (controlled timestamps)', () => {
  const message = createMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'answer' }],
    source: { kind: 'model', provider: 'mock', model: 'mock' },
  })

  function messageAt(
    time: number,
    chunks: readonly { readonly time: number; readonly chunk: StreamChunk }[] = [],
    usage?: TokenUsage,
  ): SessionEvent {
    return at(time, 'assistant/message', {
      turn: 1,
      step: 1,
      message,
      stream: chunks.map(member => ({ type: 'chunk', ...member })),
      ...usage === undefined ? {} : { usage },
    })
  }


  it('replays recorded preparation and stopping gaps without including the gap between two turns', () => {
    // Relative timestamps from a recorded two-turn lifecycle; content and ids are fixture-owned.
    const intervals = [
      [501_666, 510_133, 510_135, 524_175, 524_181],
      [703_304, 714_875, 714_878, 724_898, 724_899],
      [884_632, 891_963, 891_966, 908_256, 908_263],
      [1_135_008, 1_144_915, 1_144_917, 1_149_715, 1_149_717],
      [1_218_549, 1_226_010, 1_226_013, 1_238_761, 1_238_763],
    ] as const
    const events = [
      at(0, 'turn/start', { turn: 1 }),
      at(119_083, 'step/start', { turn: 1, step: 1 }),
      attemptAt(121_563, []),
      at(121_603, 'step/end', { turn: 1, step: 1 }),
      at(121_608, 'turn/end', { turn: 1, reason: { kind: 'error' } }),
      at(376_270, 'turn/start', { turn: 2 }),
      ...intervals.flatMap(([start, response, call, result, end], index) => [
        at(start, 'step/start', { turn: 2, step: index + 1 }),
        at(response, 'assistant/message', { turn: 2, step: index + 1, message, stream: [] }),
        at(call, 'tool/call', { callId: String(index) }),
        at(result, 'tool/result', { message: { source: { callId: String(index) } } }),
        at(end, 'step/end', { turn: 2, step: index + 1 }),
      ]),
      at(1_374_229, 'step/start', { turn: 2, step: 6 }),
      at(1_389_843, 'assistant/message', { turn: 2, step: 6, message, stream: [] }),
      at(1_389_845, 'step/end', { turn: 2, step: 6 }),
      at(1_441_270, 'turn/end', { turn: 2, reason: { kind: 'completed' } }),
    ]
    expect(fold(events)).toEqual(totals({
      turns: 2, steps: 7, llmMs: 60_351, toolMs: 57_896, turnMs: 1_186_608, otherMs: 1_068_361,
    }))
  })

  it('separates pressure compaction from model and first-token time in the same step', () => {
    expect(fold([
      at(1_000, 'step/start', { turn: 1, step: 1 }),
      at(1_200, 'compaction/start', { compactionId: 'pressure' }),
      at(3_200, 'compaction/end', { compactionId: 'pressure' }),
      messageAt(4_800, [{ time:3_800,chunk:{ type:'text-delta',index:0,text:'answer' } }], { inputTokens:10,outputTokens:60 }),
      at(4_900, 'step/end', { turn:1,step:1 }),
    ])).toEqual(totals({ turns:1,steps:1,llmMs:1_800,compactionMs:2_000,ttftMs:800,ttftSteps:1,decodeMs:1_000,decodeTokens:60 }))
  })

  it('excludes retry compaction after the first token from decoding, including failed attempts', () => {
    expect(fold([
      at(1_000,'step/start',{ turn:1,step:1 }),
      attemptAt(1_600,[{ time:1_500,chunk:{ type:'text-delta',index:0,text:'partial' } }]),
      at(1_800,'compaction/start',{ compactionId:'retry' }),
      at(2_800,'compaction/end',{ compactionId:'retry',error:[] }),
      messageAt(4_800,[],{ inputTokens:10,outputTokens:60 }),
      at(4_900,'step/end',{ turn:1,step:1 }),
    ])).toEqual(totals({ turns:1,steps:1,llmMs:2_800,compactionMs:1_000,ttftMs:500,ttftSteps:1,decodeMs:2_300,decodeTokens:60 }))
  })

  it('counts idle compaction once without reducing a later model interval', () => {
    expect(fold([
      at(100,'compaction/start',{ compactionId:'manual' }),
      at(1_100,'compaction/end',{ compactionId:'manual' }),
      at(1_150,'compaction/end',{ compactionId:'manual' }),
      at(1_200,'step/start',{ turn:1,step:1 }),messageAt(2_200),
    ])).toEqual(totals({ compactionMs:1_000,llmMs:1_000 }))
  })

  it('leaves unmatched ends and unfinished attempts uncounted and clamps clock rollback', () => {
    expect(fold([
      at(100,'compaction/end',{ compactionId:'missing' }),
      at(200,'compaction/start',{ compactionId:'unfinished' }),
      at(400,'compaction/start',{ compactionId:'clock' }),
      at(300,'compaction/end',{ compactionId:'clock' }),
    ])).toEqual(totals())
  })

  it('rejects the prior cached state so registry replay rebuilds closed-turn timing', () => {
    expect(sessionStatsProjectionDefinition.stateVersion).toBe(3)
    const { openTurn: _open,turnMs: _turn,otherMs: _other,...old } = sessionStatsProjectionDefinition.init()
    expect(sessionStatsProjectionDefinition.stateSchema.safeParse(old).success).toBe(false)
    expect(sessionStatsProjectionDefinition.stateSchema.safeParse(sessionStatsProjectionDefinition.init()).success).toBe(true)
  })

  it('covers preparation, time between steps and stopping without counting time between turns', () => {
    expect(fold([
      at(1_000, 'turn/start', { turn: 1 }),
      at(4_000, 'step/start', { turn: 1, step: 1 }),
      messageAt(5_000),
      at(5_000, 'tool/call', { callId: 'a' }),
      at(7_000, 'tool/result', { message: { source: { callId: 'a' } } }),
      at(7_000, 'step/end', { turn: 1, step: 1 }),
      at(9_000, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
      at(100_000, 'turn/start', { turn: 2 }),
      at(102_000, 'turn/end', { turn: 2, reason: { kind: 'blocked' } }),
    ])).toEqual(totals({ turns: 1, steps: 1, turnMs: 10_000, otherMs: 7_000, llmMs: 1_000, toolMs: 2_000 }))
  })

  it('unions parallel tools and overlapping compaction when finding other time', () => {
    expect(fold([
      at(1_000, 'turn/start', { turn: 1 }),
      at(2_000, 'step/start', { turn: 1, step: 1 }),
      at(3_000, 'compaction/start', { compactionId: 'pressure' }),
      at(4_000, 'compaction/end', { compactionId: 'pressure' }),
      messageAt(5_000),
      at(5_000, 'tool/call', { callId: 'a' }),
      at(5_500, 'tool/call', { callId: 'b' }),
      at(6_000, 'tool/result', { message: { source: { callId: 'a' } } }),
      at(6_000, 'compaction/start', { compactionId: 'parallel' }),
      at(7_000, 'compaction/end', { compactionId: 'parallel' }),
      at(8_000, 'tool/result', { message: { source: { callId: 'b' } } }),
      at(9_000, 'step/end', { turn: 1, step: 1 }),
      at(10_000, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
    ])).toEqual(totals({ turns: 1, steps: 1, turnMs: 9_000, otherMs: 3_000,
      llmMs: 2_000, toolMs: 3_500, compactionMs: 2_000 }))
  })

  it('includes interrupted steps and unresolved tools in other time only when the turn closes', () => {
    const events = [
      at(1_000, 'turn/start', { turn: 1 }),
      at(2_000, 'step/start', { turn: 1, step: 1 }),
      attemptAt(3_000, []),
      at(3_100, 'tool/call', { callId: 'unfinished' }),
      at(3_200, 'compaction/start', { compactionId: 'unfinished' }),
      at(4_000, 'step/end', { turn: 1, step: 1 }),
    ]
    expect(fold(events)).toEqual(totals({ turns: 1, steps: 1 }))
    expect(fold([...events,
      at(5_000, 'turn/end', { turn: 1, reason: { kind: 'error' } }),
      at(5_100, 'turn/end', { turn: 1, reason: { kind: 'error' } }),
    ])).toEqual(totals({ turns: 1, steps: 1, turnMs: 4_000, otherMs: 4_000 }))
  })

  it('ignores unmatched turn ends and clamps turn clock rollback', () => {
    expect(fold([
      at(1_000, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
      at(3_000, 'turn/start', { turn: 2 }),
      at(2_000, 'turn/end', { turn: 2, reason: { kind: 'completed' } }),
    ])).toEqual(totals())
  })

  it('accrues model, first-token, and decode time from one fully recorded step', () => {
    expect(fold([
      at(1_000, 'step/start', { turn: 1, step: 1 }),
      messageAt(4_800, [{
        time: 1_800, chunk: { type: 'text-delta', index: 0, text: 'a' },
      }], { inputTokens: 10, outputTokens: 60 }),
      at(4_900, 'step/end', { turn: 1, step: 1 }),
    ])).toEqual(totals({
      turns: 1, steps: 1, llmMs: 3_800, ttftMs: 800, ttftSteps: 1, decodeMs: 3_000, decodeTokens: 60,
    }))
  })

  it('keeps the first attempt token boundary across an in-step retry (window resetForRetry parity)', () => {
    expect(fold([
      at(1_000, 'step/start', { turn: 1, step: 1 }),
      attemptAt(1_100, [{
        time: 1_100, chunk: { type: 'text-delta', index: 0, text: '' },
      }]),
      attemptAt(2_000, [{
        time: 1_200, chunk: { type: 'reasoning-delta', index: 0, text: 'x' },
      }]),
      attemptAt(2_500, [{
        time: 1_500, chunk: { type: 'text-delta', index: 0, text: 'later' },
      }]),
      at(2_000, 'llm/retry', { turn: 1, step: 1 }),
      messageAt(5_000, [{
        time: 3_000, chunk: { type: 'text-delta', index: 0, text: 'y' },
      }]),
      at(5_100, 'step/end', { turn: 1, step: 1 }),
    ])).toEqual(totals({ turns: 1, steps: 1, llmMs: 4_000, ttftMs: 200, ttftSteps: 1 }))
  })

  it('ignores empty deltas, non-token chunks, and chunks outside the open step', () => {
    expect(fold([
      // Attempt before any step/start: no open boundary.
      attemptAt(500, [{
        time: 500, chunk: { type: 'text-delta', index: 0, text: 'stray' },
      }]),
      at(1_000, 'step/start', { turn: 1, step: 1 }),
      attemptAt(1_300, [{
        time: 1_300, chunk: { type: 'text-delta', index: 0, text: 'other' },
      }], 2, 9),
      messageAt(2_000, [
        { time: 1_100, chunk: { type: 'block-start', index: 0, blockType: 'text' } },
        { time: 1_200, chunk: { type: 'text-delta', index: 0, text: '' } },
        { time: 1_400, chunk: { type: 'text-delta', index: 0, text: 'first' } },
      ]),
      at(2_100, 'step/end', { turn: 1, step: 1 }),
    ])).toEqual(totals({ turns: 1, steps: 1, llmMs: 1_000, ttftMs: 400, ttftSteps: 1 }))
  })

  it('uses non-empty Tool-call names or arguments as the first token', () => {
    expect(fold([
      at(1_000, 'step/start', { turn: 1, step: 1 }),
      messageAt(2_000, [
        { time: 1_100, chunk: { type: 'tool-call-delta', index: 0, id: ToolCallId('call-1'), argumentsDelta: '' } },
        {
          time: 1_200,
          chunk: { type: 'tool-call-delta', index: 0, id: ToolCallId('call-1'), name: 'read', argumentsDelta: '' },
        },
      ]),
      at(2_100, 'step/end', { turn: 1, step: 1 }),
    ])).toEqual(totals({ turns: 1, steps: 1, llmMs: 1_000, ttftMs: 200, ttftSteps: 1 }))

    expect(fold([
      at(1_000, 'step/start', { turn: 1, step: 1 }),
      messageAt(2_000, [{
        time: 1_300,
        chunk: { type: 'tool-call-delta', index: 0, id: ToolCallId('call-1'), argumentsDelta: '{' },
      }]),
      at(2_100, 'step/end', { turn: 1, step: 1 }),
    ])).toEqual(totals({ turns: 1, steps: 1, llmMs: 1_000, ttftMs: 300, ttftSteps: 1 }))
  })

  it('leaves a cancelled step untimed: counted by step/end, no assembled message to accrue from', () => {
    expect(fold([
      at(1_000, 'step/start', { turn: 1, step: 1 }),
      attemptAt(1_500, [{
        time: 1_500, chunk: { type: 'text-delta', index: 0, text: 'partial' },
      }]),
      at(2_000, 'step/end', { turn: 1, step: 1 }),
    ])).toEqual(totals({ turns: 1, steps: 1 }))
  })

  it('pairs tool wall time by callId, ignores orphan results, and prunes leftovers at turn/end', () => {
    const result = (callId: string): unknown =>
      ({ turn: 1, step: 1, message: { source: { kind: 'tool', callId } } })
    const paired = fold([
      at(1_000, 'step/start', { turn: 1, step: 1 }),
      at(1_100, 'tool/call', { turn: 1, step: 1, callId: 'a', name: 'read', arguments: '{}' }),
      at(1_200, 'tool/call', { turn: 1, step: 1, callId: 'b', name: 'read', arguments: '{}' }),
      // Out-of-order settlement pairs by id, not adjacency.
      at(4_200, 'tool/result', result('b')),
      at(1_600, 'tool/result', result('a')),
      at(5_000, 'tool/result', result('ghost')),
      at(5_100, 'step/end', { turn: 1, step: 1 }),
    ])
    expect(paired).toEqual(totals({ turns: 1, steps: 1, toolMs: 3_500 }))
    // An unresolved call is dropped at turn/end; a later result cannot pair.
    const pruned = fold([
      at(1_000, 'step/start', { turn: 1, step: 1 }),
      at(1_100, 'tool/call', { turn: 1, step: 1, callId: 'orphan', name: 'read', arguments: '{}' }),
      at(2_000, 'step/end', { turn: 1, step: 1 }),
      at(2_100, 'turn/end', { turn: 1, reason: { kind: 'aborted', reason: { kind: 'legacy' } } }),
      at(9_000, 'tool/result', result('orphan')),
    ])
    expect(pruned).toEqual(totals({ turns: 1, steps: 1 }))
  })

  it('pairs only own pendingCalls keys: a prototype-name callId without a recorded call stays unmatched', () => {
    const result = (callId: string): unknown =>
      ({ turn: 1, step: 1, message: { source: { kind: 'tool', callId } } })
    // Crash recovery (TOOL_NOT_STARTED) emits results with no preceding
    // tool/call; a provider-minted callId colliding with an Object prototype
    // property must read as absent, not as an inherited function that would
    // fold toolMs to NaN and fail the value schema.
    expect(fold([
      at(1_000, 'step/start', { turn: 1, step: 1 }),
      at(1_500, 'tool/result', result('toString')),
      at(2_000, 'step/end', { turn: 1, step: 1 }),
    ])).toEqual(totals({ turns: 1, steps: 1 }))
    // The same name pairs normally once its call is recorded.
    expect(fold([
      at(1_000, 'step/start', { turn: 1, step: 1 }),
      at(1_100, 'tool/call', { turn: 1, step: 1, callId: 'constructor', name: 'read', arguments: '{}' }),
      at(1_600, 'tool/result', result('constructor')),
      at(2_000, 'step/end', { turn: 1, step: 1 }),
    ])).toEqual(totals({ turns: 1, steps: 1, toolMs: 500 }))
  })

  it('skips decode for an invalid usage report and ignores a duplicate assembled message', () => {
    const events = [
      at(1_000, 'step/start', { turn: 1, step: 1 }),
      // A malformed provider report: guarded like the window fold guards node usage.
      messageAt(2_000, [{
        time: 1_400, chunk: { type: 'text-delta', index: 0, text: 'a' },
      }], { inputTokens: 1, outputTokens: -5 }),
    ]
    expect(fold([...events, at(2_100, 'step/end', { turn: 1, step: 1 })]))
      .toEqual(totals({ turns: 1, steps: 1, llmMs: 1_000, ttftMs: 400, ttftSteps: 1 }))
    // The first message closed the step boundary; a defensive duplicate finds
    // no open step and folds to the same reference.
    const state = events.reduce<Parameters<typeof sessionStatsProjectionDefinition.apply>[0]>(
      (folded, event) => sessionStatsProjectionDefinition.apply(folded, event),
      sessionStatsProjectionDefinition.init(),
    )
    expect(sessionStatsProjectionDefinition.apply(
      state,
      messageAt(2_050),
    )).toBe(state)
  })

  it('accrues nothing for unrelated events and clamps negative clock skew to zero', () => {
    const state = sessionStatsProjectionDefinition.init()
    const untouched = sessionStatsProjectionDefinition.apply(state, at(1, 'user/message', { content: [] }))
    expect(untouched).toBe(state)
    expect(fold([
      at(2_000, 'step/start', { turn: 1, step: 1 }),
      messageAt(1_000),
      at(2_100, 'step/end', { turn: 1, step: 1 }),
    ])).toEqual(totals({ turns: 1, steps: 1 }))
  })
})
