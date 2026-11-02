/** Dependency updates must retain early limits on untrusted collection inputs. */
import { expect, it } from 'vitest'
import { z } from 'zod'

const kinds = ['array', 'set', 'map'] as const

it.each(kinds)('rejects an oversized %s before validating its elements', (kind) => {
  let visited = 0
  const element = z.string().refine(() => { visited++; return true })
  const schemas = {
    array: z.array(element).max(2),
    set: z.set(element).max(2),
    map: z.map(z.string(), element).max(2),
  }
  const input = {
    array: ['a', 'b', 'c'],
    set: new Set(['a', 'b', 'c']),
    map: new Map([['one', 'a'], ['two', 'b'], ['three', 'c']]),
  }
  const result = schemas[kind].safeParse(input[kind])
  expect(result.success).toBe(false)
  expect(visited).toBe(0)
  expect(result.error?.issues).toMatchObject([{ code: 'too_big', origin: kind }])
})

it.each(kinds)('validates every element of an accepted %s', (kind) => {
  let visited = 0
  const element = z.string().refine(() => { visited++; return true })
  const schemas = {
    array: z.array(element).max(2),
    set: z.set(element).max(2),
    map: z.map(z.string(), element).max(2),
  }
  const input = {
    array: ['a', 'b'],
    set: new Set(['a', 'b']),
    map: new Map([['one', 'a'], ['two', 'b']]),
  }
  expect(schemas[kind].safeParse(input[kind]).success).toBe(true)
  expect(visited).toBe(2)
})
