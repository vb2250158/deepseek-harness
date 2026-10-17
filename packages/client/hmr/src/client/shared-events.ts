/** One dev-event HTTP connection per browser origin, shared across plugin instances. */
import { EVENTS_ROUTE } from '../events.ts'

const CHANNEL = 'dsh:client-hmr:events:v1'

/**
 * Subscribe to raw dev frames. Web Locks elects the connection owner; closing it hands ownership to a waiting tab.
 * @param receive - Wire parser owned by the HMR consumer.
 * @param reportError - Logger for unexpected connection-ownership failures.
 * @returns Disposal of this subscriber and any connection it owns.
 */
export function subscribeSharedEvents(receive: (data: string) => void, reportError: (error: unknown) => void): () => void {
  // DOM declarations include APIs that older browsers and insecure origins may omit.
  const locks = (navigator as Partial<Navigator>).locks
  if (typeof BroadcastChannel === 'undefined' || locks === undefined) {
    const source = new EventSource(EVENTS_ROUTE)
    source.addEventListener('message', (event: MessageEvent<string>) => { receive(event.data) })
    return () => { source.close() }
  }

  const channel = new BroadcastChannel(CHANNEL)
  const controller = new AbortController()
  let disposed = false
  let closeOwner: (() => void) | undefined
  channel.onmessage = (event: MessageEvent<unknown>): void => {
    if (!disposed && typeof event.data === 'string') receive(event.data)
  }
  void locks.request(CHANNEL, { signal: controller.signal }, async () => {
    if (disposed) return
    await new Promise<void>((resolve) => {
      const source = new EventSource(EVENTS_ROUTE)
      closeOwner = () => { source.close(); resolve() }
      source.addEventListener('message', (event: MessageEvent<string>) => {
        if (disposed) return
        channel.postMessage(event.data)
        receive(event.data)
      })
    })
  }).catch((error: unknown) => {
    if (!controller.signal.aborted) reportError(error)
  })

  return () => {
    disposed = true
    controller.abort()
    closeOwner?.()
    channel.close()
  }
}
