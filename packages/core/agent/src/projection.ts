/** Shared pure fold of the Session's turn and step events. */
import type { TurnBoundaryProjection } from './types.ts'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { isConversationActivityEvent, type SessionSeq } from '@deepseek-ai/dsh-session'
import { brandNumber } from '@deepseek-ai/dsh-brand'
import { z as zod } from 'zod'

const sessionSeqSchema = zod.number().int().nonnegative().transform(brandNumber<SessionSeq>)

/** Whether committed activity prevents reusing a Session for a new conversation. */
export const conversationActivityProjectionDefinition = {
  key: 'conversationActivity',
  stateVersion: 1,
  stateSchema: zod.boolean(),
  init: () => false,
  apply: (state, event) => state || isConversationActivityEvent(event),
} satisfies ProjectionDefinition<'conversationActivity', boolean>

const turnBoundaryProjectionSchema: zod.ZodType<TurnBoundaryProjection> = zod.object({
  openTurnStartSeq: sessionSeqSchema.nullable(),
  lastStepStartSeq: sessionSeqSchema.nullable(),
  lastStepBoundary: zod.object({
    kind: zod.union([zod.literal('start'), zod.literal('end')]),
    seq: sessionSeqSchema,
  }).nullable(),
  lastTurn: zod.number().int().nonnegative(),
})

/** Host projection of agent turn and step boundaries. */
export const turnBoundaryProjectionDefinition = {
  key: 'turnBoundary',
  stateVersion: 2,
  stateSchema: turnBoundaryProjectionSchema,
  init: () => ({
    openTurnStartSeq: null,
    lastStepStartSeq: null,
    lastStepBoundary: null,
    lastTurn: 0,
  }),
  apply: (state, event) => {
    switch (event.type) {
      case 'turn/start':
        return {
          ...state,
          openTurnStartSeq: event.seq,
          lastTurn: event.data.turn,
        }
      case 'turn/end':
        return {
          ...state,
          openTurnStartSeq: null,
        }
      case 'step/start':
        return {
          ...state,
          lastStepStartSeq: event.seq,
          lastStepBoundary: { kind: 'start', seq: event.seq },
        }
      case 'step/end':
        return {
          ...state,
          lastStepBoundary: { kind: 'end', seq: event.seq },
        }
      default:
        return state
    }
  },
} satisfies ProjectionDefinition<'turnBoundary', TurnBoundaryProjection>
