import { createElement, Fragment, useLayoutEffect, type ReactNode } from 'react'

function FirstApplicationCommit(props: { committed: () => void }): ReactNode {
  useLayoutEffect(props.committed, [props.committed])
  return null
}

/**
 * Observe the first actual application commit in one renderer mount attempt.
 * @param app - Existing application factory, also used after loading-DOM hydration.
 * @returns Factory with a DOM-free marker; subsequent renders do not record another interval.
 */
export function startupApplication(app: () => ReactNode): () => ReactNode {
  const clock = (globalThis as { performance?: Performance }).performance
  let start: number | undefined
  try {
    start = clock?.now()
  } catch (_clockError) {
    // Optional diagnostic clocks cannot prevent the application from mounting.
  }
  let recorded = false
  const committed = () => {
    if (recorded) return
    recorded = true
    if (clock === undefined || start === undefined) return
    try {
      clock.measure('dsh:startup', {
        start,
        end: clock.now(),
        detail: { version: 1, kind: 'phase', stage: 'react-mount' },
      })
    } catch (_measurementError) {
      // Diagnostics are optional in embedded and test carriers without User Timing.
    }
  }
  return () => createElement(Fragment, null, app(), createElement(FirstApplicationCommit, { committed }))
}
