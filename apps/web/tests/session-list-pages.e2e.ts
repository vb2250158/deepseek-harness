/** Progressive Session-list arrival through the shipped Web composition. */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { basename, join } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, seedSession, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

const SEED = fileURLToPath(new URL('../../../snapshots/web/seeded-history/session.v3.jsonl', import.meta.url))
const EXPECTED = fileURLToPath(new URL('./expected/session-list-pages/', import.meta.url))

describe('web e2e: progressive Session list', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let releaseOlder: (() => void) | undefined
  let pages = 0

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    const fixture = await readFile(SEED, 'utf8')
    const workspace = await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd)
    for (let i = 8; i >= 0; i--) {
      const id = await seedSession(scaffold, fixture, `paged-session-${i}`, undefined, {
        createdAt: Date.now() - (i + 1) * 60_000,
      })
      await workspace.attachSession(id)
      await scaffold.ctx.sessionController.rename({ sessionId: id, title: `Paged conversation ${i}` })
    }
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    await page.addInitScript((account) => {
      localStorage.setItem('dsh.workspace.view.v5', JSON.stringify({
        groupBy: 'workspace', orderBy: 'updated', groupExpansion: { [account]: true },
        sessionOrderByAccount: {}, archivedFilter: 'default',
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
    const workspaceRow = page.getByText(basename(scaffold.workspaceCwd), { exact: true }).first()
      .locator('xpath=ancestor::*[@role="treeitem"][1]')
    await workspaceRow.waitFor({ timeout: 15_000 })
    if (await workspaceRow.getAttribute('aria-expanded') !== 'true') await workspaceRow.click()
  })

  afterAll(async () => {
    releaseOlder?.()
    await browser?.close()
    await scaffold?.close()
  })

  it('renders recent rows before older pages and keeps them interactive', async () => {
    await expect.poll(() => releaseOlder !== undefined, { timeout: 30_000 }).toBe(true)
    await expect.poll(() => page.getByText('Paged conversation 0', { exact: true }).count(), { timeout: 15_000 }).toBe(1)
    expect(await page.getByText('Paged conversation 8', { exact: true }).count()).toBe(0)
    await compareOrRefreshGolden(join(EXPECTED, 'first-page.expected.md'),
      await captureStableAria(page, '[role="tree"][aria-label="Sessions"]', scaffold.workspaceCwd, {
        replacements: [[basename(scaffold.workspaceCwd), '{{workspace}}']],
      }), webSnapshotMode())
    await page.getByText('Paged conversation 0', { exact: true }).click()
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('dsh.sessions.current') ?? '{}').sessionId))
      .toBe('paged-session-0')
    releaseOlder?.()
    await expect.poll(() => page.getByRole('button', { name: 'Show 4 more sessions' }).count()).toBe(1)
    await page.getByRole('button', { name: 'Show 4 more sessions' }).click()
    await expect.poll(() => page.getByText('Paged conversation 8', { exact: true }).count()).toBe(1)
    expect(pages).toBe(2)
  })
})
