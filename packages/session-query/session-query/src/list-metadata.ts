/** Session-list metadata projection definition registered by `SessionQueryEngine`. */

import { isConversationActivityEvent, type SessionEvent } from '@deepseek-ai/dsh-session'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { z } from 'zod'
import type { SessionListMetadata } from './types.ts'

const sessionListMetadataSchema: z.ZodType<SessionListMetadata> = z.object({
  blank: z.boolean(),
  lastPromptAt: z.number().nullable(),
  lastActivityAt: z.number().optional(),
}).transform(({ lastActivityAt, ...state }) => ({
  ...state,
  ...lastActivityAt === undefined ? {} : { lastActivityAt },
}))

/** Advance blankness and human-prompt recency without retaining history. */
function applySessionListMetadata(
  state: SessionListMetadata,
  event: SessionEvent,
): SessionListMetadata {
  const activity = isConversationActivityEvent(event)
  const blank = state.blank && !activity
  const lastPromptAt = event.type === 'user/message' && event.data.source.kind === 'user'
    ? event.time
    : state.lastPromptAt
  const lastActivityAt = activity && event.type !== 'turn/start' ? event.time : state.lastActivityAt
  return blank === state.blank && lastPromptAt === state.lastPromptAt && lastActivityAt === state.lastActivityAt
    ? state
    : { blank, lastPromptAt, ...lastActivityAt === undefined ? {} : { lastActivityAt } }
}

/** Blankness and latest conversation activity folded per Session; persisted at state version 2. */
export const sessionListMetadataDefinition = {
  key: 'sessionListMetadata',
  stateSchema: sessionListMetadataSchema,
  init: () => ({ blank: true, lastPromptAt: null }),
  apply: applySessionListMetadata,
  wire: { viewSchema: sessionListMetadataSchema, view: state => state },
  stateVersion: 2,
} satisfies ProjectionDefinition<'sessionListMetadata', SessionListMetadata>
