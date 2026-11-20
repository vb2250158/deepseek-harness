/** Profile and mapped package roots reflect the current directory links. */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { performance } from 'node:perf_hooks'
import { scheduler } from 'node:timers/promises'
import { expect, it, onTestFinished, vi } from 'vitest'
import { mappedDirectories, profileRoots, reloadRoots } from '../src/profile-directories.ts'

it('keeps startup observation synchronous and finishes a reload scan with the current link targets', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'dsh-root-scan-'))
  onTestFinished(() => { rmSync(temp, { recursive: true, force: true }) })
  const dir = join(temp, 'profile')
  const scope = join(dir, 'node_modules', '@scope')
  const link = join(scope, 'package')
  const first = join(temp, 'first')
  const second = join(temp, 'second')
  for (const path of [scope, first, second]) mkdirSync(path, { recursive: true })
  symlinkSync(first, link, process.platform === 'win32' ? 'junction' : 'dir')
  writeFileSync(join(scope, 'ordinary-file'), '')
  const expected = (target: string) => [...new Set([dir, target].flatMap(path =>
    [realpathSync(path) + sep, realpathSync.native(path) + sep]))]
  expect(profileRoots(dir)).toEqual(expected(first))

  const gate = Promise.withResolvers<undefined>()
  const clock = vi.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(10)
  const pause = vi.spyOn(scheduler, 'yield').mockImplementationOnce(() => gate.promise)
  onTestFinished(() => { gate.resolve(undefined); clock.mockRestore(); pause.mockRestore() })
  const roots = reloadRoots(dir)
  expect(pause).toHaveBeenCalledOnce()
  unlinkSync(link)
  symlinkSync(second, link, process.platform === 'win32' ? 'junction' : 'dir')
  gate.resolve(undefined)
  expect(await roots).toEqual(expected(second))
  expect(await mappedDirectories(undefined)).toEqual(new Set())
})
