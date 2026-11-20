/** HMR matches the exact directory spellings used by the module caches. */
import { sep } from 'node:path'
import { expect, it } from 'vitest'
import { hasDirectoryPrefix } from '../src/directory-prefix.ts'

it('matches complete directory prefixes and preserves distinct spellings', () => {
  const path = (...parts: string[]) => parts.join(sep)
  const prefixes = [path('profile', 'pkg', ''), path('links', 'a', 'b', '')]
  const roots = new Set(prefixes)
  for (const filename of [
    path('profile', 'pkg', 'index.js'), path('profile', 'pkg2', 'index.js'),
    path('links', 'a', 'b', 'nested', 'index.js'), path('links', 'a', 'index.js'),
    path('profile', 'Pkg', 'index.js'), path('profile', 'pkg'), path('profile', 'pkg', ''),
  ]) {
    expect(hasDirectoryPrefix(filename, roots)).toBe(prefixes.some(prefix => filename.startsWith(prefix)))
  }
})
