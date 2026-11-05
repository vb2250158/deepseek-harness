import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { Data, NtExecutable, NtExecutableResource, Resource } from 'resedit'
import { describe, expect, it } from 'vitest'
import { prepareWindowsProcessRuntime } from './windows-process-runtime.ts'

const execute = promisify(execFile)
const icon = resolve('apps/desktop/resources/tray-windows.ico')
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const iconDigest = (item: Data.IconItem | Data.RawIconItem): string => digest(new Uint8Array(item.isIcon() ? item.generate() : item.bin))
const sections = (executable: NtExecutable): { name: string; digest: string }[] => executable.getAllSections()
  .filter(section => section.info.name !== '.rsrc')
  .map(section => ({ name: section.info.name, digest: digest(new Uint8Array(section.data ?? new ArrayBuffer(0))) }))

describe.runIf(process.platform === 'win32')('Windows process runtime', () => {
  it('runs both branded roles with unchanged Node code, copyright and DSH icon images', { timeout: 30_000 }, async () => {
    const temporary = await mkdtemp(join(tmpdir(), 'dsh-process-runtime-'))
    try {
      const output = join(temporary, 'runtime with spaces')
      const originalBytes = await readFile(process.execPath)
      const original = NtExecutable.from(originalBytes, { ignoreCert: true })
      const originalVersion = Resource.VersionInfo.fromEntries(NtExecutableResource.from(original).entries)[0]!
      const language = originalVersion.getAllLanguagesForStringValues()[0]!
      const originalStrings = originalVersion.getStringValues(language)
      const receipt = await prepareWindowsProcessRuntime({ node: process.execPath, icon, output })
      expect(receipt.signature).toBe('unsigned-local-copy')
      expect(receipt.source.sha256).toBe(digest(originalBytes))
      const sourceIcon = Data.IconFile.from(await readFile(icon))
      const expectedIcons = sourceIcon.icons.map(item => iconDigest(item.data))
      for (const runtime of receipt.runtimes) {
        const executable = NtExecutable.from(await readFile(runtime.executable))
        const resources = NtExecutableResource.from(executable)
        const info = Resource.VersionInfo.fromEntries(resources.entries)[0]!
        expect(info.getStringValues(language)).toMatchObject({
          FileDescription: runtime.role === 'host' ? 'DSH 主服务' : 'DSH 外卖工具',
          ProductName: 'DeepSeek Harness',
          OriginalFilename: basename(runtime.executable),
          FileVersion: originalStrings.FileVersion,
          LegalCopyright: originalStrings.LegalCopyright,
        })
        expect(sections(executable)).toEqual(sections(original))
        for (const group of Resource.IconGroupEntry.fromEntries(resources.entries)) {
          const actual = group.getIconItemsFromEntries(resources.entries).map(iconDigest)
          expect(actual).toEqual(expectedIcons)
        }
        const plain = await execute(runtime.executable, ['--version'], { timeout: 10_000, windowsHide: true })
        expect(plain.stdout.trim()).toBe(process.version)
        const esm = await execute(runtime.executable, [
          '--import', 'tsx/esm', '-e',
          'console.log(JSON.stringify({node:process.versions.node,abi:process.versions.modules,executable:process.execPath}))',
        ], {
          cwd: resolve('.'), timeout: 10_000, windowsHide: true,
        })
        expect(JSON.parse(esm.stdout)).toEqual({
          node: process.versions.node, abi: process.versions.modules, executable: runtime.executable,
        })
      }
      await expect(prepareWindowsProcessRuntime({ node: process.execPath, icon, output })).rejects.toMatchObject({ code: 'EEXIST' })
      for (const runtime of receipt.runtimes) expect(digest(await readFile(runtime.executable))).toBe(runtime.sha256)
      expect(digest(await readFile(process.execPath))).toBe(receipt.source.sha256)
    } finally {
      expect(dirname(temporary)).toBe(resolve(tmpdir()))
      expect(basename(temporary).startsWith('dsh-process-runtime-')).toBe(true)
      await rm(temporary, { recursive: true, force: true })
    }
  })

  it('rejects relative destinations before publishing runtime files', async () => {
    await expect(prepareWindowsProcessRuntime({ node: process.execPath, icon, output: 'runtime' }))
      .rejects.toThrow('output must be an absolute path')
  })
})
