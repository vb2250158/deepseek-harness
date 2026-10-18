// @vitest-environment jsdom
/** Bridge commands retain official navigation ownership and revoke replaced iframe leases. */
import { afterEach, expect, it, vi } from 'vitest'
import type { SidebarRightOpenTab, TabId } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import { SidebarBrowserBridge } from '../src/client/bridge.ts'
import { createBrowserControllers } from '../src/client/browser/BrowserController.ts'
import { createBrowserStore } from '../src/client/browser/store.ts'
import { createIframePage } from '../src/client/pages.ts'

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); localStorage.clear() })

it('keeps tabs scoped to their Session and withdraws the exact controller registration', async () => {
  const session = 'bridge-session' as SidebarRightOpenTab['sessionId']
  const other = 'other-session' as SidebarRightOpenTab['sessionId']
  const tab = 'bridge-tab' as TabId
  const store = createBrowserStore().create('bridge-fixture')
  const face = createBrowserControllers(store.actions, createIframePage, () => true)
  const service = new SidebarBrowserBridge()
  const release = service.register(session, face)
  expect(() => service.register(session, face)).toThrow('already registered')
  expect(service.read(session, tab)).toBeUndefined()
  expect(() => service.navigate(session, tab, 'https://example.test')).toThrow('not mounted')
  const host = document.createElement('div')
  host.id = 'bridge-viewport'
  document.body.append(host)
  const lifetime = new AbortController()
  try {
    face.mount({ tabId: tab, signal: lifetime.signal, viewportId: host.id, applicationOrigin: 'https://dsh.test',
      initial: undefined, initialUrl: 'https://example.test/one', openTab: vi.fn() })
    expect(() => service.reload(other, tab)).toThrow('not mounted')
    const element = host.querySelector('iframe')!
    const rect = new DOMRect(0, 0, 100, 100)
    const rects: DOMRectList = {
      0: rect,
      length: 1,
      item: (index) => index === 0 ? rect : null,
      [Symbol.iterator]: () => [rect][Symbol.iterator](),
    }
    vi.spyOn(element, 'getClientRects').mockReturnValue(rects)
    const lease = service.messageTarget(session, tab)!
    expect(lease.isVisible()).toBe(true)
    const post = vi.spyOn(lease.source, 'postMessage')
    lease.send({ challenge: 'fixture' })
    expect(post).toHaveBeenCalledWith({ challenge: 'fixture' }, '*')
    host.hidden = true
    expect(lease.isVisible()).toBe(false)
    expect(() => lease.send({ challenge: 'hidden' })).toThrow('no longer visible')
    host.hidden = false
    service.navigate(session, tab, 'https://example.test/two')
    expect(service.read(session, tab)?.frame.target?.url).toBe('https://example.test/two')
    expect(store.getSnapshot().byTab[tab]?.entries.at(-1)?.url).toBe('https://example.test/two')
    expect(lease.isVisible()).toBe(false)
    expect(() => lease.send({ challenge: 'replaced' })).toThrow('no longer visible')
    service.navigate(session, tab, 'javascript:alert(1)')
    expect(service.read(session, tab)?.addressFailure).toBeDefined()
    expect(service.read(session, tab)?.frame.target?.url).toBe('https://example.test/two')
    service.reload(session, tab)
    lifetime.abort()
    expect(service.read(session, tab)).toBeUndefined()
    expect(() => service.messageTarget(session, tab)).toThrow('not mounted')
    release()
    const next = service.register(session, face)
    release()
    expect(() => service.register(session, face)).toThrow('already registered')
    next()
  } finally { release(); lifetime.abort(); await face.dispose() }
})
