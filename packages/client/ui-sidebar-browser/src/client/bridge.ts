/** Session-scoped access to the Browser controllers owned by the official tab renderer. */
import type { SidebarRightOpenTab, TabId } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { BrowserInjected, BrowserControllerState } from './browser/BrowserController.ts'
import type { BrowserMessageTarget } from './browser/BrowserPage.ts'

type SessionId = SidebarRightOpenTab['sessionId']

/** Navigation and optional iframe messaging; this service never reads website content. */
export class SidebarBrowserBridge {
  private readonly sessions = new Map<SessionId, BrowserInjected>()

  /**
   * Bind the renderer's controller to its Session.
   * @param sessionId - owning Session.
   * @param controller - renderer-owned callbacks.
   * @returns disposer for this exact binding.
   */
  register(sessionId: SessionId, controller: BrowserInjected): () => void {
    if (this.sessions.has(sessionId)) throw new Error('Browser Session already registered')
    this.sessions.set(sessionId, controller)
    let released = false
    return () => {
      if (released) return
      released = true
      if (this.sessions.get(sessionId) === controller) this.sessions.delete(sessionId)
    }
  }

  /**
   * Read the mounted tab's navigation state.
   * @param sessionId - owning Session.
   * @param tabId - Browser occurrence.
   * @returns recorded navigation, or absence before mounting.
   */
  read(sessionId: SessionId, tabId: TabId): BrowserControllerState | undefined {
    return this.sessions.get(sessionId)?.keyedHooks.browserState(tabId)?.getSnapshot()
  }

  /**
   * Navigate using the official tab controller.
   * @param sessionId - owning Session.
   * @param tabId - mounted Browser occurrence.
   * @param url - address validated by its controller.
   */
  navigate(sessionId: SessionId, tabId: TabId, url: string): void {
    this.require(sessionId, tabId).loadUrl(tabId, url)
  }

  /**
   * Reload the mounted tab.
   * @param sessionId - owning Session.
   * @param tabId - mounted Browser occurrence.
   */
  reload(sessionId: SessionId, tabId: TabId): void {
    this.require(sessionId, tabId).reload(tabId)
  }

  /**
   * Obtain the current iframe message lease.
   * @param sessionId - owning Session.
   * @param tabId - mounted Browser occurrence.
   * @returns current iframe message lease, absent for Desktop or an unmounted page.
   */
  messageTarget(sessionId: SessionId, tabId: TabId): BrowserMessageTarget | undefined {
    return this.require(sessionId, tabId).messageTarget(tabId)
  }

  private require(sessionId: SessionId, tabId: TabId): BrowserInjected {
    const controller = this.sessions.get(sessionId)
    if (controller?.keyedHooks.browserState(tabId) === undefined) throw new Error('Browser tab is not mounted in this Session')
    return controller
  }
}
