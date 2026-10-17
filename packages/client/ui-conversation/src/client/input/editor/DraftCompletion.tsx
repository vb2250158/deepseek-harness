/** Mount the public provider slot while retaining private editor ownership. */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { LexicalEditor } from 'lexical'
import type { DraftCompletionOwnerProps, DraftCompletionProvider } from '../../contract/completion.ts'
import { installDraftCompletion } from './completion.ts'

/**
 * Bind the elected provider to the currently editable composer.
 * @param props - private editor and public slot renderer.
 * @returns the provider's presentation, without exposing editor internals.
 */
export function DraftCompletion({ editor, enabled, renderProvider }: {
  editor: LexicalEditor | null
  enabled: boolean
  renderProvider: (owner: DraftCompletionOwnerProps) => ReactNode
}): ReactNode {
  const [provider, setProvider] = useState<DraftCompletionProvider | null>(null)
  const held = useRef<DraftCompletionProvider | null>(null)
  const register = useCallback((next: DraftCompletionProvider): (() => void) => {
    if (held.current !== null) throw new Error('composer already has a completion provider')
    held.current = next
    setProvider(next)
    return () => {
      if (held.current !== next) return
      held.current = null
      setProvider(null)
    }
  }, [])
  useEffect(() => {
    if (editor !== null && enabled && provider !== null) return installDraftCompletion(editor, provider)
  }, [editor, enabled, provider])
  return renderProvider({ register })
}
