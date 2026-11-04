import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import { snapshotCrossProfileSidecar, snapshotFixtureDirectory } from '../src/fixture-variant.ts'
import { parseSnapshotManifest } from '../src/manifest.ts'

describe('platform fixture directories', () => {
  it('selects Windows data while preserving default and unconfigured platform directories', () => {
    const manifest = parseSnapshotManifest('version: 1\nprofile: acp\nfixtureVariants:\n  win32: win-x64\n')
    expect(snapshotFixtureDirectory('scenario', manifest, 'win32')).toBe(join('scenario', 'win-x64'))
    expect(snapshotFixtureDirectory('scenario', manifest, 'linux')).toBe('scenario')
    expect(snapshotFixtureDirectory('scenario', {}, 'win32')).toBe('scenario')
  })

  it.each(['../outside', '..', '/absolute', 'C:/outside', 'C:\\outside', 'nested/child', 'nested\\child', ''])('rejects escaping or compound directory %j at the manifest parser', (directory) => {
    expect(() => parseSnapshotManifest(JSON.stringify({ version: 1, profile: 'acp', fixtureVariants: { win32: directory } }))).toThrow('manifest.fixtureVariants.win32')
  })

  it('rejects unknown platform keys instead of silently choosing a default', () => {
    expect(() => parseSnapshotManifest('version: 1\nprofile: acp\nfixtureVariants:\n  window: win-x64\n')).toThrow('unknown field(s): window')
  })

  it.each(['headless', 'sdk', 'sdk-minimal', 'web'])('rejects variant selection on the %s adapter that does not consume it', (profile) => {
    expect(() => parseSnapshotManifest(JSON.stringify({ version: 1, profile, fixtureVariants: { win32: 'win-x64' } }))).toThrow('requires the ACP adapter')
  })

  it('reads the declared cross-profile owner and fails when that owner is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-sidecar-route-'))
    try {
      const profile = join(root, 'acp'), owner = join(root, 'session', 'text-turn')
      await mkdir(profile)
      await mkdir(owner, { recursive: true })
      const manifest = parseSnapshotManifest('version: 1\nprofile: acp\nheader:\n  class: native\n  toolSchemasSource: session/text-turn\n')
      const file = snapshotCrossProfileSidecar(profile, manifest.header?.toolSchemasSource, 'tool-schemas.expected.json')
      expect(file).toBe(join(owner, 'tool-schemas.expected.json'))
      assert(file !== undefined)
      await writeFile(join(owner, 'tool-schemas.expected.json'), '{"initial":[],"changes":[]}\n')
      expect(await readFile(file, 'utf8')).toBe('{"initial":[],"changes":[]}\n')
      await rm(join(owner, 'tool-schemas.expected.json'))
      await writeFile(join(profile, 'tool-schemas.expected.json'), 'local bytes must not hide a missing owner')
      await expect(readFile(file, 'utf8')).rejects.toThrow('ENOENT')
      expect(snapshotCrossProfileSidecar(profile, 'local-case', 'tool-schemas.expected.json')).toBeUndefined()
      expect(snapshotCrossProfileSidecar(profile, undefined, 'tool-schemas.expected.json')).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
