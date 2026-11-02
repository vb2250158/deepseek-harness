/** Compare repeated display-metadata reads with the profile service's generation cache. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { readPluginMeta } from '../src/package-meta.ts'
import { PluginPackages } from '../src/profile-resolution/service.ts'

const mode = process.argv[2]
if (mode !== 'direct' && mode !== 'cached') throw new Error('Expected direct or cached')
const root = mkdtempSync(join(tmpdir(), 'dsh-metadata-perf-'))
const context = new Context()
try {
  const names = Array.from({ length: 4 }, (_, index) => `dsh-perf-plugin-${index}`)
  for (const name of names) {
    const dir = join(root, 'node_modules', name)
    mkdirSync(join(dir, 'locale'), { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name, type: 'module', exports: { './package.json': './package.json', './locale/*.json': './locale/*.json' },
    }))
    for (const language of ['en', 'zh', 'ja', 'de', 'fr', 'es', 'pt', 'ru']) {
      writeFileSync(join(dir, 'locale', `${language}.json`), JSON.stringify({ meta: { title: `${name} ${language}` } }))
    }
  }
  await context.plugin(PluginPackages)
  const base = pathToFileURL(join(root, 'entry.mjs')).href
  const read = mode === 'direct' ? readPluginMeta : (name: string, parent: string) => context.pluginPackages.metaOf(name, parent)
  global.gc?.()
  const initialHeap = process.memoryUsage().heapUsed
  const started = performance.now()
  let bytes = 0
  for (let repeat = 0; repeat < 20; repeat++) {
    for (const name of names) bytes += JSON.stringify(read(name, base)).length
  }
  const elapsedMs = performance.now() - started
  const peakRssKiB = process.resourceUsage().maxRSS
  global.gc?.()
  const retainedHeapBytes = process.memoryUsage().heapUsed - initialHeap
  console.log(JSON.stringify({ mode, calls: 80, elapsedMs, peakRssKiB, retainedHeapBytes, bytes }))
} finally {
  await context.fiber.dispose()
  rmSync(root, { recursive: true, force: true })
}
