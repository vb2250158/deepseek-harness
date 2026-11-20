/** JavaScript realpath spellings for one synchronous scan of package directories. */
import { lstatSync, realpathSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/**
 * Reuse resolved parent directories. Node resolves links and non-directories itself.
 * @param path Normalized absolute directory path.
 * @param known Spellings from this scan, discarded before the next filesystem comparison.
 * @returns The spelling Node's JavaScript realpath gives this directory.
 */
export function directorySpelling(path: string, known: Map<string, string>): string {
  const cached = known.get(path)
  if (cached !== undefined) return cached
  const parent = dirname(path)
  const real = parent === path || !lstatSync(path).isDirectory()
    ? realpathSync(path)
    : join(directorySpelling(parent, known), basename(path))
  known.set(path, real)
  return real
}
