import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'

const pkg = dirname(createRequire(import.meta.url).resolve('@yao-pkg/pkg/package.json'))
const bundle = readFileSync(join(pkg, 'prelude/sea-bootstrap.bundle.js'), 'utf8')
const workerAssignment = /^\s*module2\.exports = ((?:'(?:[^'\\]|\\.)*')|(?:"(?:[^"\\]|\\.)*"));$/gm
const workerLiteral = [...bundle.matchAll(workerAssignment)].find(match => match[1]?.includes('function insideSnapshot(f)'))?.[1]
if (workerLiteral === undefined) throw new Error('SEA worker bootstrap is missing')
const worker: unknown = runInNewContext(workerLiteral)
if (typeof worker !== 'string') throw new Error('SEA worker bootstrap is not a string')
const faces = [
  ['source', readFileSync(join(pkg, 'prelude/sea-vfs-setup.js'), 'utf8'), 'module.exports = {'],
  ['main bundle', bundle, 'module2.exports = {'],
  ['worker bundle', worker, 'module2.exports = {'],
] as const

function predicate(text: string, marker: string, platform: string): (value: unknown) => boolean {
  const start = text.indexOf('var SNAPSHOT_PREFIXES_POSIX =')
  const end = text.indexOf(marker, start)
  if (start < 0 || end < 0) throw new Error('SEA snapshot predicate is missing')
  const result: unknown = runInNewContext(`${text.slice(start, end)}\ninsideSnapshot`, { process: { platform } })
  if (typeof result !== 'function') throw new Error('SEA snapshot predicate is not callable')
  return value => Boolean(result(value))
}

it.each(faces)('%s recognizes Windows snapshot paths on every absolute drive', (_name, text, marker) => {
  const inside = predicate(text, marker, 'win32')
  for (const value of ['/snapshot', '/snapshot/node/native.node', 'C:\\snapshot\\native.node', 'V:/snapshot/node', 'D:/snapshot/node/koffi.node', 'd:\\snapshot\\node\\native.node', 'Z:/snapshot']) {
    expect(inside(value), value).toBe(true)
  }
  for (const value of ['D:snapshot/node', 'D:/snapshot-other/node', 'D:\\snapshot-other\\node', 'D:/outside/snapshot/node', '\\\\server\\snapshot\\node', '/snapshot-other', '', null, undefined, 1]) {
    expect(inside(value), String(value)).toBe(false)
  }
})

it.each(faces)('%s keeps POSIX snapshot matching independent of Windows drives', (_name, text, marker) => {
  for (const platform of ['linux', 'darwin']) {
    const inside = predicate(text, marker, platform)
    expect(inside('/snapshot')).toBe(true)
    expect(inside('/snapshot/node/native.node')).toBe(true)
    expect(inside('/snapshot-other/node')).toBe(false)
    expect(inside('D:/snapshot/node/native.node')).toBe(false)
    expect(inside('C:\\snapshot\\node\\native.node')).toBe(false)
  }
})
