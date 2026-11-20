/** Membership of module paths under the directories inspected by HMR. */
import { sep } from 'node:path'

/**
 * Match a separator-terminated directory prefix without changing case or decoding the path.
 * @param path Filesystem path in the same spelling as the directory prefixes.
 * @param prefixes Directory names ending in the platform separator.
 * @returns Whether one of the prefixes contains the path.
 */
export function hasDirectoryPrefix(path: string, prefixes: ReadonlySet<string>): boolean {
  for (let end = path.indexOf(sep); end !== -1; end = path.indexOf(sep, end + 1)) {
    if (prefixes.has(path.slice(0, end + 1))) return true
  }
  return false
}
