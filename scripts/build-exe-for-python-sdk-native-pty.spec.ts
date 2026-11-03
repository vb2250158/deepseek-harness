import { existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveLinuxNodePtyAddon, resolveWindowsNodePtyAddons, stageNodePtyPrebuild } from './executable-native-pty.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('stageNodePtyPrebuild', () => {
  it('replaces hardlinked deployed files while preserving the installed source and other targets', async () => {
    const root = temporaryPackage()
    const source = join(root, 'installed', 'win32-x64')
    const destination = join(root, 'staged', 'win32-x64')
    const installed = createAddon(source, 'conpty', 'conpty.dll')
    writeFileSync(installed, 'installed addon')
    const deployed = join(destination, 'conpty', 'conpty.dll')
    mkdirSync(dirname(deployed), { recursive: true })
    linkSync(installed, deployed)
    expect(statSync(installed).ino).toBe(statSync(deployed).ino)
    const stale = createAddon(destination, 'obsolete.node')
    const sibling = createAddon(join(root, 'staged', 'linux-x64'), 'pty.node')

    await stageNodePtyPrebuild(source, destination)

    expect(readFileSync(deployed, 'utf8')).toBe('installed addon')
    expect(existsSync(stale)).toBe(false)
    expect(existsSync(sibling)).toBe(true)
    writeFileSync(deployed, 'staged addon')
    expect(readFileSync(installed, 'utf8')).toBe('installed addon')
  })

  it('copies a prebuild into a missing staging directory', async () => {
    const root = temporaryPackage()
    const source = join(root, 'installed', 'linux-arm64')
    createAddon(source, 'pty.node')
    const destination = join(root, 'staged', 'linux-arm64')

    await stageNodePtyPrebuild(source, destination)

    expect(existsSync(join(destination, 'pty.node'))).toBe(true)
  })

  it('rejects the source directory as its own staging target without removing its files', async () => {
    const source = temporaryPackage()
    const addon = createAddon(source, 'conpty.node')

    await expect(stageNodePtyPrebuild(source, source)).rejects.toThrow('must be separate directories')

    expect(existsSync(addon)).toBe(true)
  })
})

describe('resolveLinuxNodePtyAddon', () => {
  it('prefers the manylinux build produced by the release workflow', () => {
    const root = temporaryPackage()
    const built = createAddon(root, 'build', 'Release', 'pty.node')
    createAddon(root, 'prebuilds', 'linux-x64', 'pty.node')

    expect(resolveLinuxNodePtyAddon(root, 'x64')).toBe(built)
  })

  it('uses the target prebuild after an ordinary beta install', () => {
    const root = temporaryPackage()
    const prebuilt = createAddon(root, 'prebuilds', 'linux-arm64', 'pty.node')

    expect(resolveLinuxNodePtyAddon(root, 'arm64')).toBe(prebuilt)
  })

  it('reports both expected locations when no addon is installed', () => {
    const root = temporaryPackage()

    expect(() => resolveLinuxNodePtyAddon(root, 'x64')).toThrow(
      `node-pty addon is absent from both ${join(root, 'build', 'Release', 'pty.node')} and ${join(root, 'prebuilds', 'linux-x64', 'pty.node')}`,
    )
  })
})

describe('resolveWindowsNodePtyAddons', () => {
  it('requires both ConPTY addons from the x64 prebuild', () => {
    const root = temporaryPackage()
    const conpty = createAddon(root, 'prebuilds', 'win32-x64', 'conpty.node')
    const consoleList = createAddon(root, 'prebuilds', 'win32-x64', 'conpty_console_list.node')

    expect(resolveWindowsNodePtyAddons(root, 'x64')).toEqual([conpty, consoleList])
  })

  it('names every missing Windows addon', () => {
    const root = temporaryPackage()

    expect(() => resolveWindowsNodePtyAddons(root, 'x64')).toThrow(
      `Windows node-pty addons are missing: ${join(root, 'prebuilds', 'win32-x64', 'conpty.node')}, ${join(root, 'prebuilds', 'win32-x64', 'conpty_console_list.node')}`,
    )
  })
})

function temporaryPackage(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-node-pty-addon-'))
  roots.push(root)
  return root
}

function createAddon(root: string, ...segments: string[]): string {
  const path = join(root, ...segments)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, '')
  return path
}
