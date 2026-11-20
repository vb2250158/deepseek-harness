/** Realm-specific intrinsic checks used by projection checkpoint validation. */
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { isJsonValue, snapshotJsonValue } from '../src/index.ts'

describe('lossless JSON constructor identity', () => {
  it('accepts native arrays and records from this realm and a separate realm', () => {
    const local = { samples: [{ duration: 0 }] }
    const foreign: unknown = runInNewContext('({ samples: [{ duration: 0 }] })')
    for (const value of [local, foreign]) {
      expect(isJsonValue(value)).toBe(true)
      expect(snapshotJsonValue(value)).toEqual(local)
    }
  })

  it('refuses a named substitute on its own prototype and invalid numbers inside genuine containers', () => {
    const forged: unknown = runInNewContext(`(() => {
      const Fake = function Object() {}
      Reflect.setPrototypeOf(Fake.prototype, null)
      return Reflect.construct(Fake, [])
    })()`)
    for (const value of [forged, { samples: [-0] }, { samples: [Infinity] }]) {
      expect(isJsonValue(value)).toBe(false)
      expect(snapshotJsonValue(value)).toBeUndefined()
    }
  })
})
