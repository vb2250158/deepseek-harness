/** Public, cancellable end-of-draft suggestion provider; the editor owns insertion and keys. */
export interface DraftCompletionRequest {
  /** Clipboard projection of the draft at a collapsed document-end selection. */
  readonly prefix: string
  /** Cancels on editing, selection changes, blur, disable, timeout, or disposal. */
  readonly signal: AbortSignal
}

/** One plugin supplies streamed text; it never receives the editor or writes the draft. */
export interface DraftCompletionProvider {
  readonly debounceMs: number
  readonly timeoutMs: number
  readonly maxCharacters: number
  /** Must settle when the request signal aborts. Yields appended plain-text deltas. */
  complete(request: DraftCompletionRequest): AsyncIterable<string>
  /** Report a failed request without blocking normal editing or submission. */
  onError(message: string): void
}

/** The single completion slot's editor-owned registration capability. */
export interface DraftCompletionOwnerProps {
  /** Register until the returned disposer runs; concurrent providers are rejected. */
  register(provider: DraftCompletionProvider): () => void
}
