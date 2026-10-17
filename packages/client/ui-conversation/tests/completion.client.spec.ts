// @vitest-environment jsdom
/** Completion preserves editor nodes, history, composition, and submission ownership. */
import { expect, it, onTestFinished, vi } from 'vitest'
import { $getRoot, KEY_TAB_COMMAND, KEY_ESCAPE_COMMAND, UNDO_COMMAND, $createParagraphNode, $createTextNode, createEditor } from 'lexical'
import { registerPlainText } from '@lexical/plain-text'
import { registerHistory, createEmptyHistoryState } from '@lexical/history'
import { installDraftCompletion } from '../src/client/input/editor/completion.ts'
import { registerComposerKeymap } from '../src/client/input/editor/keymap.ts'

function fixture(complete: (request: { prefix: string; signal: AbortSignal }) => AsyncIterable<string> = async function* () { yield '，并给出原因。' }) {
  vi.useFakeTimers()
  onTestFinished(() => { vi.useRealTimers() })
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: () => new DOMRect() })
  Object.defineProperty(Range.prototype, 'getClientRects', { configurable: true, value: () => [] })
  const root = document.createElement('div')
  root.contentEditable = 'true'; root.tabIndex = 0; document.body.append(root)
  const editor = createEditor({ namespace: 'completion-test', onError: error => { throw error } })
  const plain = registerPlainText(editor)
  const history = registerHistory(editor, createEmptyHistoryState(), 300)
  editor.setRootElement(root)
  root.focus()
  editor.update(() => { const p = $createParagraphNode(); p.append($createTextNode('检查配置')); $getRoot().append(p); p.selectEnd() }, { discrete: true })
  const spy = vi.fn(complete)
  const error = vi.fn()
  const dispose = installDraftCompletion(editor, { complete: spy, debounceMs: 100, timeoutMs: 500, maxCharacters: 200, onError: error })
  onTestFinished(() => { dispose(); history(); plain(); editor.setRootElement(null); root.remove() })
  const text = () => editor.getEditorState().read(() => $getRoot().getTextContent())
  return { editor, root, dispose, spy, error, text }
}
it('shows streamed text outside the document, accepts with Tab, and undoes one insertion', async () => {
  const f = fixture()
  const before = f.editor.getEditorState().read(() => $getRoot().getFirstChild()!.getKey())
  await vi.advanceTimersByTimeAsync(100)
  expect(f.root.getAttribute('data-completion-text')).toBe('，并给出原因。')
  expect(f.text()).toBe('检查配置')
  f.editor.dispatchCommand(KEY_TAB_COMMAND, new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }))
  await vi.advanceTimersByTimeAsync(0)
  expect(f.text()).toBe('检查配置，并给出原因。')
  expect(f.editor.getEditorState().read(() => $getRoot().getFirstChild()!.getKey())).toBe(before)
  f.editor.dispatchCommand(UNDO_COMMAND, undefined)
  await vi.advanceTimersByTimeAsync(0)
  expect(f.text()).toBe('检查配置')
})
it('Escape cancels a request and ignores a late provider result', async () => {
  let resolve!: () => void
  let signal!: AbortSignal
  const f = fixture(async function* (request) { signal = request.signal; await new Promise<void>(r => { resolve = r }); yield 'late' })
  await vi.advanceTimersByTimeAsync(100)
  f.editor.dispatchCommand(KEY_ESCAPE_COMMAND, new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }))
  expect(signal.aborted).toBe(true)
  resolve(); await vi.advanceTimersByTimeAsync(0)
  expect(f.root.hasAttribute('data-completion-text')).toBe(false)
  expect(f.text()).toBe('检查配置')
})
it('composition and selection away from the end suppress completion', async () => {
  const f = fixture()
  f.root.dispatchEvent(new CompositionEvent('compositionstart'))
  await vi.advanceTimersByTimeAsync(200)
  expect(f.spy).not.toHaveBeenCalled()
  f.root.dispatchEvent(new CompositionEvent('compositionend'))
  f.editor.update(() => { $getRoot().getAllTextNodes()[0]!.select(1, 1) }, { discrete: true })
  await vi.advanceTimersByTimeAsync(200)
  expect(f.spy).not.toHaveBeenCalled()
})
it('the existing menu owns Tab before suggestions', async () => {
  const f = fixture()
  const menu = registerComposerKeymap(f.editor, { arbitrate: () => 'consumed', dismissPopup() {}, space: () => false, canSubmit: () => true, submit() {}, intakeFiles() {}, pasteText() {} })
  onTestFinished(menu)
  await vi.advanceTimersByTimeAsync(100)
  f.editor.dispatchCommand(KEY_TAB_COMMAND, new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }))
  expect(f.text()).toBe('检查配置')
})
it('editing aborts the previous request and disposal removes presentation', async () => {
  const f = fixture()
  await vi.advanceTimersByTimeAsync(100)
  f.editor.update(() => { $getRoot().getAllTextNodes()[0]!.selectEnd().insertText('新') }, { discrete: true })
  expect(f.root.hasAttribute('data-completion-text')).toBe(false)
  await vi.advanceTimersByTimeAsync(100)
  f.dispose()
  expect(f.root.hasAttribute('data-completion-text')).toBe(false)
  expect(f.text()).toBe('检查配置新')
})
