/**
 * Durable session-persistence Service Definition (`ctx.sessionPersistence`). Backends store
 * {@link SessionEvent}s as the event-sourced log and carry non-replayable
 * {@link SessionHeader} metadata separately; callers address one stored
 * session through a {@link SessionHandle} obtained from `create`/`open`.
 * @module @deepseek-ai/dsh-session-persistence
 */

import { Context, Service } from '@deepseek-ai/cordis'
import type { SessionEvent, SessionHeader, SessionId, SessionLogOffset } from '@deepseek-ai/dsh-session'
import type { SessionHandle, SessionAccess } from './handle.ts'
import type { SessionLocation } from './errors.ts'
import type { SessionPersistenceRevision } from './revision.ts'
import { SessionPersistenceNotFoundError } from './errors.ts'

// Re-export the metadata vocabulary so Consumers import it from the Service Definition.
export type { SessionHeader } from '@deepseek-ai/dsh-session'
export { SessionPersistenceRevision } from './revision.ts'
export type {
  SessionAccess,
  SessionHandle,
  SessionHandleAppendOptions,
  SessionHandleFlushOptions,
  SessionHandleReadOptions,
  SessionHandleReadResult,
} from './handle.ts'
export {
  SessionAlreadyExistsError,
  SessionAlreadyOwnedError,
  SessionFormatUnsupportedError,
  SessionHandleClosedError,
  SessionOwnershipLostError,
  SessionPersistenceCorruptionError,
  SessionPersistenceNotFoundError,
  SessionReadOnlyError,
  sessionFormatVersionRefusal,
} from './errors.ts'
export type { SessionLocation } from './errors.ts'
export {
  assertContiguous,
  assertStoredId,
  assertVersion,
  materializeAppendBatch,
  materializeCreateHeader,
  validateStoredEvents,
} from './storage-contract.ts'

/**
 * Lightweight stored-session observation returned by {@link SessionPersistence.stat}
 * and {@link SessionPersistence.list} without reading the full event log.
 */
export interface SessionPersistenceSnapshot {
  /** Detached metadata for one stored session. */
  readonly header: SessionHeader
  /** Header-only format classification; absent without versioned artifact metadata. */
  readonly formatStatus?: 'current' | 'migration-required'
  /** Opaque change token; see {@link SessionPersistence.stat}. */
  readonly revision: SessionPersistenceRevision
  /** Logical event count, when the backend can provide it cheaply from metadata; otherwise absent. */
  readonly eventCount?: number
  /** Physical artifact byte size, when the backend can provide it cheaply (JSONL); otherwise absent. */
  readonly sizeBytes?: number
  /**
   * Physical artifact modification time in Unix epoch milliseconds, when cheaply available;
   * absent for unmaterialized sessions. This is not an event timestamp or a freshness token.
   */
  readonly modifiedAt?: number
  /**
   * Backend-resolved location of the selected materialized per-Session
   * artifact, for diagnostics and export. Absent when the backend has no
   * materialized per-Session file, including an unmaterialized pending Session.
   */
  readonly location?: SessionLocation
}

/** Header-only observation without a log revision or physical artifact details. */
export type SessionPersistenceMetadata = Pick<SessionPersistenceSnapshot, 'header' | 'formatStatus'>

/** Options for {@link SessionPersistence.create}. */
export interface SessionPersistenceCreateOptions {
  /** Optional cancellation observed before backend work starts. */
  readonly signal?: AbortSignal
  /**
   * Exact fork-inherited prefix length. Required when `header.isSeeded` is
   * true and must be omitted (or `0`) otherwise; the backend refuses a
   * mismatch at create.
   */
  readonly inheritedEventCount?: SessionLogOffset
}

/**
 * Logical Session header paired with its exact inherited cut for body-bearing
 * storage operations. `isSeeded` marks fork lineage on the header; the
 * numeric cut travels beside it, never inside the replayable event log.
 */
export interface SessionStorageMetadata {
  /** Validated immutable Session header. */
  readonly meta: SessionHeader
  /** Number of leading events inherited from the Session's fork parent. */
  readonly inheritedEventCount: SessionLogOffset
}

/** Immutable logical session read: storage metadata plus the complete validated event log. */
export interface SessionInspection extends SessionStorageMetadata {
  /** Contiguous validated events from seq 0. */
  readonly events: readonly SessionEvent[]
}

/** One bounded read pass; selected sources are not a cross-file atomic snapshot. */
export interface SessionPersistenceReadScope {
  /** Live reads, or a backend-captured set of selected physical sources. */
  readonly consistency: 'live' | 'selected-sources'
  /** Wall-clock time at which this pass finished discovering its source set. */
  readonly observedAt: number
  /** Detached observations for this pass, using instance-local revision tokens. */
  readonly snapshots: readonly SessionPersistenceSnapshot[]
  /** Known sources omitted because their headers were unreadable; absence then cannot prove deletion. */
  readonly omittedSourceCount: number
  /**
   * Read the complete logical log without taking write ownership. Changed sources reject.
   * @param id - Session listed in this scope.
   * @param options - optional cancellation, combined with scope cancellation.
   * @returns validated storage metadata and events, including the inherited prefix.
   */
  read(id: SessionId, options?: SessionPersistenceOpenOptions): Promise<SessionInspection>
}

/** A scoped source changed before its read completed; retry in a new pass. */
export class SessionPersistenceReadScopeChangedError extends Error {
  constructor(readonly id: SessionId) {
    super(`session "${id}": read scope source changed; start a new read pass`)
    this.name = 'SessionPersistenceReadScopeChangedError'
  }
}

/** Backend discovery and reader, retained only until the owning read pass ends. */
interface ReadScopeSource {
  readonly consistency: SessionPersistenceReadScope['consistency']
  readonly snapshots: readonly SessionPersistenceSnapshot[]
  readonly omittedSourceCount: number
  read(id: SessionId, signal: AbortSignal): Promise<SessionInspection>
}

/** Options for {@link SessionPersistence.open}. */
export interface SessionPersistenceOpenOptions {
  /** Optional cancellation observed before backend work starts. */
  readonly signal?: AbortSignal
}

/** Options for {@link SessionPersistence.stat}. */
export interface SessionPersistenceStatOptions {
  /** Optional cancellation for backend metadata reads. */
  readonly signal?: AbortSignal
}

/** Options for {@link SessionPersistence.list}. */
export interface SessionPersistenceListOptions {
  /** Optional cancellation for backend listing work. */
  readonly signal?: AbortSignal
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    sessionPersistence: SessionPersistence
  }
}

/**
 * Durable append-only session storage addressed through per-session handles.
 *
 * Storage semantics shared by every backend: events are contiguous from seq 0
 * and never rewritten; a torn physical tail is never returned to a reader and
 * is truncated by the write path before its first append; reads validate
 * current-format records only and refuse unknown vocabulary fail-closed.
 * `append` persists best-effort; `flush` — per handle or service-wide — is
 * the durability barrier.
 *
 * Visibility: a created session is observable through `stat`/`list`/`open`
 * in this process from the moment `create` resolves, even while a backend
 * defers physical materialization (a pure optimization); other processes see
 * the session only once it materializes, and a session that never
 * materialized before a crash never existed. `SessionHandle.flush` forces
 * materialization.
 *
 * Freshness: once an `append` or `flush` resolves, reads started afterwards
 * on this backend instance observe at least that prefix.
 */
export abstract class SessionPersistence extends Service {
  /** Process-local instance identity, stable through Context proxies and distinct after service replacement. */
  readonly identity: symbol = Symbol('sessionPersistence')

  constructor(ctx: Context) {
    super(ctx, 'sessionPersistence')
  }

  /**
   * Create a new stored session and take its write ownership.
   * @param header - the immutable header (id, version, cwd, lineage) to store.
   * @param options - optional cancellation.
   * @returns a `write` handle owned by the caller; close it to release ownership.
   * @throws {SessionAlreadyExistsError} when the id already exists.
   */
  abstract create(header: SessionHeader, options?: SessionPersistenceCreateOptions): Promise<SessionHandle>

  /**
   * Open an existing stored session.
   *
   * `read` never takes ownership and works while another handle (or process)
   * holds write ownership. `write` atomically claims single-writer ownership;
   * an existing active owner rejects.
   * @param id - the stored session to open.
   * @param access - `read` or `write`.
   * @param options - optional cancellation.
   * @returns the open handle.
   * @throws {SessionPersistenceNotFoundError} when the session does not exist.
   * @throws {SessionAlreadyOwnedError} for `write` when ownership is taken.
   */
  abstract open(id: SessionId, access: SessionAccess, options?: SessionPersistenceOpenOptions): Promise<SessionHandle>

  /**
   * Flush every active write handle owned by this service instance in one
   * durability barrier: each handle's routed live events drain durably and
   * its session materializes, exactly as that handle's own
   * `SessionHandle.flush` would. Read handles buffer nothing and are
   * untouched. A handle closed concurrently counts as flushed — close itself
   * drains durably.
   * @returns resolution once every write handle active at the call has flushed.
   * @throws {AggregateError} naming each session whose flush failed; the
   *   remaining handles still flush.
   */
  abstract flush(): Promise<void>

  /**
   * Read one stored header without opening its event log or taking ownership.
   * Backends may override this snapshot projection to avoid revision work.
   * @param id - the stored session to observe.
   * @param options - optional cancellation forwarded to the backend.
   * @returns detached metadata, or undefined when the session does not exist.
   */
  async readMetadata(id: SessionId, options?: SessionPersistenceStatOptions): Promise<SessionPersistenceMetadata | undefined> {
    const snapshot = await this.stat(id, options)
    return snapshot === undefined ? undefined : {
      header: snapshot.header,
      ...(snapshot.formatStatus === undefined ? {} : { formatStatus: snapshot.formatStatus }),
    }
  }

  /**
   * List stored headers without opening event logs or taking ownership.
   * Backends may override this snapshot projection to avoid revision work.
   * @param options - optional cancellation forwarded to the backend.
   * @returns one detached metadata value per stored session, in no promised order.
   */
  async listMetadata(options?: SessionPersistenceListOptions): Promise<readonly SessionPersistenceMetadata[]> {
    return (await this.list(options)).map(({ header, formatStatus }) => ({
      header,
      ...(formatStatus === undefined ? {} : { formatStatus }),
    }))
  }

  /**
   * Observe one stored session without reading its event log or taking
   * ownership.
   *
   * The snapshot's `revision` is an opaque change token comparable only
   * against revisions from the same service instance and session id: equal
   * revisions may be treated as an unchanged log; unequal revisions promise
   * nothing. Write-ownership churn does not change a revision. It exists for
   * derived read-model caches keyed off `stat`/`list`; it plays no part in
   * open, read, or resume.
   * @param id - the stored session to observe.
   * @param options - optional cancellation.
   * @returns the snapshot, or `undefined` when the session does not exist.
   */
  abstract stat(id: SessionId, options?: SessionPersistenceStatOptions): Promise<SessionPersistenceSnapshot | undefined>

  /**
   * List every stored session visible to this process, in no promised order.
   * @param options - optional cancellation.
   * @returns one snapshot per stored session.
   */
  abstract list(options?: SessionPersistenceListOptions): Promise<readonly SessionPersistenceSnapshot[]>

  /**
   * Run a bounded read pass and cancel outstanding reads when its callback ends.
   * The default implementation uses live handles, validating each listed revision
   * before and after its read; it promises no cross-Session atomic snapshot.
   * Backends may capture selected sources instead, deferring later additions to the next pass.
   * @param callback - consumer of the pass; await every read it needs.
   * @param options - cancellation for discovery, the callback, and its reads.
   * @returns the callback result after outstanding reads have settled.
   */
  async withReadScope<T>(
    callback: (scope: SessionPersistenceReadScope) => Promise<T>,
    options?: SessionPersistenceListOptions,
  ): Promise<T> {
    return this.runReadScope(async (discoverySignal) => {
      const snapshots = await this.list({ signal: discoverySignal })
      const revisions = new Map(snapshots.map(snapshot => [snapshot.header.id, snapshot.revision]))
      return { consistency: 'live', snapshots, omittedSourceCount: 0,
        read: async (id, signal) => {
          const revision = revisions.get(id)
          if (revision === undefined) throw new SessionPersistenceNotFoundError(id)
          if ((await this.stat(id, { signal }))?.revision !== revision) throw new SessionPersistenceReadScopeChangedError(id)
          const handle = await this.open(id, 'read', { signal })
          try {
            const { events } = await handle.read(0, undefined, { signal })
            if ((await this.stat(id, { signal }))?.revision !== revision) throw new SessionPersistenceReadScopeChangedError(id)
            return { meta: handle.header, inheritedEventCount: handle.inheritedEventCount, events }
          } finally {
            await handle.close()
          }
        },
      }
    }, callback, options?.signal)
  }

  /**
   * Own discovery and read cancellation without retaining decoded logs between reads.
   * @param discover - backend discovery and reader using the combined scope/caller signal.
   * @param callback - scope consumer.
   * @param signal - optional caller cancellation.
   * @returns the callback's result after cleanup.
   */
  protected async runReadScope<T>(
    discover: (signal: AbortSignal) => Promise<ReadScopeSource>,
    callback: (scope: SessionPersistenceReadScope) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController()
    const scopeSignal = signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal])
    const pending = new Set<Promise<SessionInspection>>()
    let discovery: Promise<ReadScopeSource> | undefined
    const release = this.ctx.effect(() => async () => {
      controller.abort()
      await Promise.allSettled(discovery === undefined ? [...pending] : [discovery, ...pending])
    })
    try {
      scopeSignal.throwIfAborted()
      discovery = Promise.resolve().then(() => discover(scopeSignal))
      const source = await discovery
      scopeSignal.throwIfAborted()
      const scope: SessionPersistenceReadScope = {
        consistency: source.consistency, observedAt: Date.now(), snapshots: source.snapshots,
        omittedSourceCount: source.omittedSourceCount,
        read(id, options) {
          const readSignal = options?.signal === undefined ? scopeSignal : AbortSignal.any([scopeSignal, options.signal])
          const operation = (async () => {
            readSignal.throwIfAborted()
            try {
              const result = await source.read(id, readSignal)
              readSignal.throwIfAborted()
              return result
            } catch (error: unknown) {
              readSignal.throwIfAborted()
              throw error
            }
          })()
          pending.add(operation)
          void operation.then(() => pending.delete(operation), () => pending.delete(operation))
          return operation
        },
      }
      const result = await callback(scope)
      scopeSignal.throwIfAborted()
      return result
    } catch (error: unknown) {
      scopeSignal.throwIfAborted()
      throw error
    } finally {
      await release()
    }
  }
}

export default SessionPersistence
