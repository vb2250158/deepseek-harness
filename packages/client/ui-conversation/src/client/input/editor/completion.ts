/** Editor-owned suggestion lifecycle; generated content never enters the Lexical document. */
import {
  $getSelection, $isRangeSelection, COMMAND_PRIORITY_HIGH, HISTORY_PUSH_TAG,
  KEY_ESCAPE_COMMAND, KEY_TAB_COMMAND,
} from 'lexical'
import type { LexicalEditor } from 'lexical'
import type { DraftCompletionProvider } from '../../contract/completion.ts'
import { $composerLayout, $detectOffsetOfPoint } from './projection.ts'

/**
 * Install one end-of-draft provider below the composer's critical menu keymap.
 * @param editor - the owning editor.
 * @param provider - cancellable text generator and deployment limits.
 * @returns disposer which cancels work and removes keys, listeners, and presentation.
 */
export function installDraftCompletion(editor: LexicalEditor, provider: DraftCompletionProvider): () => void {
  let root: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let request: AbortController | undefined
  let ghost = ''
  let origin = ''
  let last: string | null = null
  let composing = false
  let composingUntil = 0
  let disposed = false
  const read = (): string | null => {
    if (!editor.isEditable() || composing || Date.now() < composingUntil || editor.isComposing()
      || root === null || !root.contains(root.ownerDocument.activeElement)) return null
    return editor.getEditorState().read(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null
      const layout = $composerLayout()
      if ($detectOffsetOfPoint(layout, selection.anchor) !== layout.detectLength) return null
      const prefix = layout.clipboardText
      if (prefix.trim().length < 2 || /^[\s]*[/@]/u.test(prefix.split('\n').at(-1) ?? '')) return null
      return prefix
    })
  }
  const paint = (text: string): void => {
    ghost = text
    if (text === '') {
      root?.removeAttribute('data-completion-text')
      root?.lastElementChild?.removeAttribute('data-completion-text')
    } else {
      root?.setAttribute('data-completion-text', text)
      root?.lastElementChild?.setAttribute('data-completion-text', text)
    }
  }
  const cancel = (): void => {
    clearTimeout(timer)
    timer = undefined
    request?.abort()
    request = undefined
    paint('')
  }
  const generate = async (prefix: string): Promise<void> => {
    const controller = new AbortController()
    request = controller
    origin = prefix
    const timeout = setTimeout(() => controller.abort(new Error('completion timeout')), provider.timeoutMs)
    try {
      for await (const delta of provider.complete({ prefix, signal: controller.signal })) {
        if (disposed || controller.signal.aborted || request !== controller || read() !== prefix) break
        paint((ghost + delta).slice(0, provider.maxCharacters))
        if (ghost.includes('\n') || ghost.length >= provider.maxCharacters) {
          paint(ghost.split('\n')[0] ?? '')
          controller.abort()
          break
        }
      }
    } catch (error) {
      if (!controller.signal.aborted && request === controller && !disposed) {
        paint('')
        provider.onError(error instanceof Error ? error.message : String(error))
      }
    } finally {
      clearTimeout(timeout)
      if (request === controller) request = undefined
    }
  }
  const update = (): void => {
    const prefix = read()
    if (prefix === last) return
    last = prefix
    cancel()
    if (prefix !== null && !disposed) timer = setTimeout(() => { void generate(prefix) }, provider.debounceMs)
  }
  const start = (): void => { composing = true; update() }
  const end = (): void => {
    composing = false
    composingUntil = Date.now() + 10
    clearTimeout(timer)
    timer = setTimeout(update, 10)
  }
  const blur = (): void => { last = null; cancel() }
  const bind = (next: HTMLElement | null, previous: HTMLElement | null): void => {
    previous?.removeEventListener('focus', update)
    previous?.removeEventListener('blur', blur)
    previous?.removeEventListener('compositionstart', start)
    previous?.removeEventListener('compositionend', end)
    previous?.removeAttribute('data-completion-text')
    root = next
    next?.addEventListener('focus', update)
    next?.addEventListener('blur', blur)
    next?.addEventListener('compositionstart', start)
    next?.addEventListener('compositionend', end)
    last = null
    update()
  }
  const off = [
    editor.registerRootListener(bind),
    editor.registerUpdateListener(update),
    editor.registerEditableListener(update),
    editor.registerCommand(KEY_ESCAPE_COMMAND, (event) => {
      if (read() === null || (ghost === '' && timer === undefined && request === undefined)) return false
      event.preventDefault()
      cancel()
      return true
    }, COMMAND_PRIORITY_HIGH),
    editor.registerCommand(KEY_TAB_COMMAND, (event) => {
      if (event?.shiftKey || event?.ctrlKey || event?.metaKey || event?.altKey || event?.isComposing
        || event?.keyCode === 229 || ghost === '' || read() !== origin) return false
      const text = ghost
      cancel()
      event?.preventDefault()
      editor.update(() => {
        const selection = $getSelection()
        if ($isRangeSelection(selection) && selection.isCollapsed()) selection.insertText(text)
      }, { tag: HISTORY_PUSH_TAG, discrete: true })
      // Acceptance is one undo step; the next suggestion waits for a user edit.
      last = origin + text
      clearTimeout(timer)
      timer = undefined
      return true
    }, COMMAND_PRIORITY_HIGH),
  ]
  return () => {
    disposed = true
    cancel()
    off.forEach(dispose => dispose())
    bind(null, root)
  }
}
