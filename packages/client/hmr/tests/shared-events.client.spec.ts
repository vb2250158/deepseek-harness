import { afterEach, describe, expect, it, vi } from 'vitest'
import { subscribeSharedEvents } from '../src/client/shared-events.ts'

class Events extends EventTarget {
  static opened: Events[] = []
  closed = false
  constructor(readonly url: string) { super(); Events.opened.push(this) }
  close(): void { this.closed = true }
  send(data: string): void { this.dispatchEvent(new MessageEvent('message', { data })) }
}

class Channel {
  static opened = new Set<Channel>()
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  constructor(readonly name: string) { Channel.opened.add(this) }
  postMessage(data: unknown): void {
    for (const peer of Channel.opened) {
      if (peer !== this && peer.name === this.name) peer.onmessage?.(new MessageEvent('message', { data }))
    }
  }
  close(): void { Channel.opened.delete(this) }
}

function setup(): void {
  Events.opened = []
  Channel.opened.clear()
  let tail = Promise.resolve()
  const request = (_name: string, options: { signal: AbortSignal }, callback: () => Promise<void>): Promise<void> => {
    const pending = tail.then(async () => {
      if (options.signal.aborted) throw new DOMException('Cancelled', 'AbortError')
      await callback()
    })
    // Rejected lock requests do not prevent the next waiter from acquiring.
    tail = pending.catch(() => {})
    return pending
  }
  vi.stubGlobal('EventSource', Events)
  vi.stubGlobal('BroadcastChannel', Channel)
  vi.stubGlobal('navigator', { locks: { request } })
}

afterEach(() => { vi.unstubAllGlobals() })

describe('shared dev event connection', () => {
  it('delivers rebuilt frames to eight tabs over one connection and hands off when the owner closes', async () => {
    setup()
    const receive = Array.from({ length: 8 }, () => vi.fn())
    const error = vi.fn()
    const dispose = receive.map(callback => subscribeSharedEvents(callback, error))
    await vi.waitFor(() => { expect(Events.opened).toHaveLength(1) })
    const frame = JSON.stringify({ type: 'rebuilt', id: 'plugin', rev: 'new' })
    Events.opened[0]!.send(frame)
    for (const callback of receive) expect(callback).toHaveBeenCalledWith(frame)
    dispose[0]!()
    await vi.waitFor(() => { expect(Events.opened).toHaveLength(2) })
    expect(Events.opened.filter(source => !source.closed)).toHaveLength(1)
    Events.opened[1]!.send('next')
    expect(receive[0]).toHaveBeenCalledTimes(1)
    for (const callback of receive.slice(1)) expect(callback).toHaveBeenLastCalledWith('next')
    for (const close of dispose.slice(1)) close()
    await vi.waitFor(() => { expect(Channel.opened.size).toBe(0) })
    expect(Events.opened.every(source => source.closed)).toBe(true)
    expect(error).not.toHaveBeenCalled()
  })

  it('cancels waiting subscribers without acquiring a connection or reporting a failure', async () => {
    setup()
    const error = vi.fn()
    const owner = subscribeSharedEvents(vi.fn(), error)
    const waiting = subscribeSharedEvents(vi.fn(), error)
    await vi.waitFor(() => { expect(Events.opened).toHaveLength(1) })
    waiting()
    owner()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(Events.opened).toHaveLength(1)
    expect(error).not.toHaveBeenCalled()
  })

  it('retains direct events without browser coordination APIs', () => {
    setup()
    vi.stubGlobal('BroadcastChannel', undefined)
    const receive = vi.fn()
    const dispose = subscribeSharedEvents(receive, vi.fn())
    Events.opened[0]!.send('frame')
    expect(receive).toHaveBeenCalledWith('frame')
    dispose()
    expect(Events.opened[0]!.closed).toBe(true)
  })

  it('retains direct events when Web Locks is unavailable', () => {
    setup()
    vi.stubGlobal('navigator', {})
    const dispose = subscribeSharedEvents(vi.fn(), vi.fn())
    expect(Events.opened).toHaveLength(1)
    expect(Channel.opened.size).toBe(0)
    dispose()
    expect(Events.opened[0]!.closed).toBe(true)
  })

  it('reports a rejected ownership request and disposes its channel', async () => {
    setup()
    const failure = new Error('Lock service unavailable')
    vi.stubGlobal('navigator', { locks: { request: () => Promise.reject(failure) } })
    const error = vi.fn()
    const dispose = subscribeSharedEvents(vi.fn(), error)
    await vi.waitFor(() => { expect(error).toHaveBeenCalledWith(failure) })
    expect(Events.opened).toHaveLength(0)
    dispose()
    expect(Channel.opened.size).toBe(0)
  })
})
