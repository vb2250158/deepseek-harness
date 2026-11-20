/** Real directory spellings that bound HMR module comparisons and cache eviction. */
import { existsSync, readdirSync, readlinkSync, realpathSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { performance } from 'node:perf_hooks'
import { scheduler } from 'node:timers/promises'
import type { RuntimeResolution } from '@deepseek-ai/dsh-app-boot'
import { directorySpelling } from './directory-spelling.ts'

function linkedSpelling(path: string, known: Map<string, string>): string {
  let target: string
  try { target = readlinkSync(path) } catch (_error) {
    // A package may have replaced the link since the directory was listed.
    return realpathSync(path)
  }
  return directorySpelling(resolve(directorySpelling(dirname(path), known), target), known)
}

/** Node's module cache and runtime resolution can use different spellings of Windows short paths. */
function spellings(path: string, known: Map<string, string>, linked = false): string[] {
  const native: unknown = Reflect.get(realpathSync, 'native')
  if (typeof native !== 'function') return [realpathSync(path)]
  const js = linked ? linkedSpelling(path, known) : directorySpelling(resolve(path), known)
  return [js, String(Reflect.apply(native, realpathSync, [path]))]
}

function* profileDirectories(dir: string, known: Map<string, string>): Generator<string[]> {
  yield spellings(dir, known)
  const modules = join(realpathSync(dir), 'node_modules')
  if (!existsSync(modules)) return
  for (const entry of readdirSync(modules, { withFileTypes: true })) {
    const entries = entry.name.startsWith('@') ? readdirSync(join(modules, entry.name), { withFileTypes: true }) : [entry]
    for (const child of entries) {
      if (!child.isSymbolicLink()) continue
      const path = join(child.parentPath, child.name)
      if (existsSync(path)) yield spellings(path, known, true)
    }
  }
}

function* mappedPaths(resolution: RuntimeResolution | undefined, known: Map<string, string>): Generator<string[]> {
  if (resolution === undefined) return
  const dirs = [...resolution.entries.filter(entry => entry.scope === 'profile').map(entry => entry.packageDir),
    ...resolution.linkedRoots.map(root => root.realPath)]
  for (const dir of new Set(dirs)) yield existsSync(dir) ? spellings(dir, known) : [dir]
}

async function scan(rows: (known: Map<string, string>) => Iterable<string[]>): Promise<Set<string>> {
  const result = new Set<string>()
  const known = new Map<string, string>()
  let started = performance.now()
  for (const paths of rows(known)) {
    for (const path of paths) result.add(path + sep)
    if (performance.now() - started < 8) continue
    known.clear()
    await scheduler.yield()
    started = performance.now()
  }
  return result
}

/**
 * Capture the startup module roots synchronously in the application's ready notification.
 * @param dir Profile directory.
 * @returns Profile and linked package directories with trailing separators.
 */
export function profileRoots(dir: string): string[] {
  return [...new Set([...profileDirectories(dir, new Map())].flat().map(path => path + sep))]
}

/**
 * Read the current profile and linked package directories before comparing module files.
 * @param dir Profile directory.
 * @returns Both real-path spellings, with trailing separators, after the complete scan.
 */
export async function reloadRoots(dir: string): Promise<string[]> {
  return [...await scan(known => profileDirectories(dir, known))]
}

/**
 * Read the published resolution's directory spellings before or after recomposition.
 * @param resolution Current resolution, if this profile has one.
 * @returns Every mapped profile directory with its trailing separator after the complete scan.
 */
export function mappedDirectories(resolution: RuntimeResolution | undefined): Promise<Set<string>> {
  return scan(known => mappedPaths(resolution, known))
}
