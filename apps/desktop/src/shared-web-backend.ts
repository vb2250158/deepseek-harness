/** Attach the desktop carrier to a running local Web application without owning its process or profile. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createBrowserSessionCookie } from '@deepseek-ai/dsh-client-connection'
import { parseCredentialsDocument } from '@deepseek-ai/dsh-credentials-local'
import type { CredentialRecord } from '@deepseek-ai/dsh-credentials'
import type { DesktopHostReady } from './host-process.ts'

/** Explicit connection settings for a Web backend using the same Harness home. */
export interface SharedWebBackendConfig {
  readonly url: string
  readonly timeoutMs: number
  readonly cookieLifetimeMs: number
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function bounded(value: unknown, fallback: number, maximum: number): number {
  const result = value ?? fallback
  if (typeof result !== 'number' || !Number.isSafeInteger(result) || result < 1 || result > maximum) {
    throw new Error('desktop shared backend: invalid connection timing')
  }
  return result
}

/**
 * Read explicit shared-backend selection; absence retains the owned Desktop Host.
 * @param home - Harness home containing the local connection settings.
 * @param environment - Optional process-local URL override.
 * @returns Validated loopback endpoint and timings, or undefined for the owned Host.
 */
export async function readSharedWebBackendConfig(
  home: string,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<SharedWebBackendConfig | undefined> {
  let config: unknown
  const override = environment.DSH_DESKTOP_WEB_BACKEND_URL
  if (override !== undefined) config = { mode: 'web', url: override }
  else {
    try { config = JSON.parse(await readFile(join(home, 'desktop-backend.json'), 'utf8')) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw new Error('desktop shared backend: cannot read desktop-backend.json')
    }
  }
  if (!object(config) || config.mode !== 'web' || typeof config.url !== 'string'
    || Object.keys(config).some(key => !['mode', 'url', 'timeoutMs', 'cookieLifetimeMs'].includes(key))) {
    throw new Error('desktop shared backend: invalid connection settings')
  }
  let url: URL
  try { url = new URL(config.url) } catch { throw new Error('desktop shared backend: invalid endpoint') }
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)
    || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || url.pathname !== '/') {
    throw new Error('desktop shared backend: endpoint must be a clean loopback HTTP origin')
  }
  return {
    url: url.origin + '/', timeoutMs: bounded(config.timeoutMs, 10_000, 60_000),
    cookieLifetimeMs: bounded(config.cookieLifetimeMs, 60_000, 300_000),
  }
}

/** Authenticated attachment with no child process, profile mutation, or remote task ownership. */
export class DesktopSharedWebBackend {
  private credential: CredentialRecord | undefined
  private readonly abort = new AbortController()
  private readonly requests = new Set<Promise<Response>>()

  /**
   * @param home - The running Web backend's Harness home; credentials are read-only.
   * @param config - Explicit validated loopback connection settings.
   */
  constructor(private readonly home: string, readonly config: SharedWebBackendConfig) {}

  /** @returns A fresh request cookie retained only in the native carrier. */
  cookie(): string {
    return createBrowserSessionCookie(this.credential, new URL(this.config.url).host, this.config.cookieLifetimeMs)
  }

  /**
   * Read existing credentials and require the selected Web backend to authenticate a request.
   * @returns The clean endpoint; Web serves its own boot injections and frontend assets.
   */
  async start(): Promise<DesktopHostReady> {
    const filename = join(this.home, '.credentials.yaml')
    const document = parseCredentialsDocument(await readFile(filename, 'utf8'), filename)
    this.credential = document.records.get('client-connection/browser-session')
    const response = await this.request(this.config.url, { signal: AbortSignal.timeout(this.config.timeoutMs) })
    await response.body?.cancel()
    if (!response.ok) throw new Error('desktop shared backend: Web backend is unavailable or authentication failed')
    return { url: this.config.url, injections: [] }
  }

  /**
   * Send a native RPC or stream request to the explicitly selected backend.
   * @param input - URL under the selected origin.
   * @param init - Request body, method and cancellation.
   * @returns Authenticated response without following redirects to another authority.
   */
  request(input: string, init: RequestInit = {}): Promise<Response> {
    if (new URL(input).origin !== new URL(this.config.url).origin) throw new Error('desktop shared backend: rejected another origin')
    const headers = new Headers(init.headers)
    headers.set('cookie', this.cookie())
    const signal = init.signal === undefined || init.signal === null ? this.abort.signal : AbortSignal.any([this.abort.signal, init.signal])
    const request = fetch(input, { ...init, headers, signal, redirect: 'error' })
    this.requests.add(request)
    void request.then(() => { this.requests.delete(request) }, () => { this.requests.delete(request) })
    return request
  }

  /** @returns Completion of attachment cancellation; the shared backend keeps running. */
  async stop(_requireCleanStop?: boolean): Promise<void> {
    this.abort.abort()
    this.credential = undefined
    await Promise.allSettled([...this.requests])
  }

  /**
   * Desktop updates do not lock or interrupt the independently managed Web backend.
   * @param _action - Desktop's local update stage.
   * @returns false because this carrier owns no backend tasks.
   */
  updateTasks(_action: 'inspect' | 'lock' | 'unlock'): Promise<boolean> { return Promise.resolve(false) }

  /** @returns No owned tasks; closing this carrier cannot interrupt shared work. */
  inspectQuit(): Promise<{ activeTasks: boolean; scheduledTasks: boolean }> {
    return Promise.resolve({ activeTasks: false, scheduledTasks: false })
  }
}
