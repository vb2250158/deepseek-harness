/** Progressive Session-list arrival through the shipped Web composition. */
import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, seedSession, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

const SEED = fileURLToPath(new URL('../../../snapshots/web/seeded-history/session.v3.jsonl', import.meta.url))
const EXPECTED = fileURLToPath(new URL('./expected/session-list-pages/', import.meta.url))

describe('web e2e: progressive Session list', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let workspaceId: string
  let releaseOlder: (() => void) | undefined
  let pages = 0
  const errors: string[] = []

  beforeAll(async () => {
    await mkdir(EXPECTED, { recursive: true })
    scaffold = await launchWebScaffold({})
    const fixture = await readFile(SEED, 'utf8')
    const workspace = await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd)
    workspaceId = workspace.id
    const now = Date.now()
    for (let i = 0; i < 9; i++) {
      const id = await seedSession(scaffold, fixture, `paged-session-${i}`, undefined, {
        createdAt: now - (i + 1) * 60_000,
      })
      await workspace.attachSession(id)
      await scaffold.ctx.sessionController.rename({ sessionId: id, title: `Paged conversation ${i}` })
    }
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    await page.clock.setFixedTime(now)
    page.on('pageerror', (error) => { errors.push(error.message) })
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    await page.addInitScript((account) => {
      localStorage.setItem('dsh.workspace.view.v5', JSON.stringify({
        groupBy: 'workspace', orderBy: 'updated', groupExpansion: { [account]: true },
        sessionOrderByAccount: {},
      }))
    }, workspace.id)
    await page.route('**/api/session/list', async (route) => {
      const body = route.request().postDataJSON() as { payload: { args: { _request: { cursor?: string } } } }
      const request = body.payload.args._request
      pages++
      if (request.cursor !== undefined) {
        await new Promise<void>((resolve) => { releaseOlder = resolve })
      }
      await route.continue()
    })
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  })

  afterAll(async () => {
    releaseOlder?.()
    await browser?.close()
    await scaffold?.close()
  })

  it('renders recent rows before older pages and keeps them interactive', async () => {
    onTestFailed(() => { console.info(JSON.stringify({ errors: errors.map(error => error.split('\n')[0]) })) })
    const expand = page.getByRole('button', { name: 'Open sidebar', exact: true })
    if (await expand.count() !== 0) await expand.click()
    await expect.poll(() => page.getByText('Paged conversation 0', { exact: true }).count(), { timeout: 10_000 }).toBe(1)
    expect(await page.getByText('Paged conversation 8', { exact: true }).count()).toBe(0)
    await compareOrRefreshGolden(join(EXPECTED, 'first-page.expected.md'),
      await captureStableAria(page, '[data-dsh-session-list]', scaffold.workspaceCwd, { normalizeAge: true }), webSnapshotMode())
    await page.getByText('Paged conversation 0', { exact: true }).click()
    await expect.poll(() => page.evaluate(() => {
      const selection: unknown = JSON.parse(localStorage.getItem('dsh.sessions.current') ?? '{}')
      return typeof selection === 'object' && selection !== null && 'sessionId' in selection ? selection.sessionId : undefined
    }))
      .toBe('paged-session-0')
    expect(pages).toBe(1)
    await page.getByRole('button', { name: 'Load more sessions', exact: true }).click()
    await expect.poll(() => releaseOlder !== undefined, { timeout: 10_000 }).toBe(true)
    releaseOlder?.()
    await expect.poll(() => page.getByRole('button', { name: 'Show 4 more sessions' }).count()).toBe(1)
    await page.getByRole('button', { name: 'Show 4 more sessions' }).click()
    await expect.poll(() => page.getByText('Paged conversation 8', { exact: true }).count()).toBe(1)
    expect(pages).toBe(2)
    expect(errors).toEqual([])
  })

  it('restores an older saved selection without draining historical pages', async () => {
    const restored = await newEnglishPage(browser)
    const requests: { cursor?: string; sessionIds?: string[] }[] = []
    try {
      await restored.addInitScript((workspaceId) => {
        localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId: 'paged-session-8' }))
        localStorage.setItem('dsh.workspace.view.v5', JSON.stringify({
          groupBy: 'workspace', orderBy: 'updated', groupExpansion: { [workspaceId]: true }, sessionOrderByAccount: {},
        }))
      }, workspaceId)
      await restored.route('**/api/session/list', async (route) => {
        const body = route.request().postDataJSON() as { payload: { args: { _request: typeof requests[number] } } }
        requests.push(body.payload.args._request)
        await route.continue()
      })
      await restored.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      await expect.poll(async () => restored.locator('[data-row-key="session:paged-session-8"]').getAttribute('aria-selected'), { timeout: 15_000 })
        .toBe('true')
      expect(requests.some(request => request.sessionIds?.includes('paged-session-8'))).toBe(true)
      expect(requests.every(request => request.cursor === undefined)).toBe(true)
    } finally {
      await restored.close()
    }
  })
})
