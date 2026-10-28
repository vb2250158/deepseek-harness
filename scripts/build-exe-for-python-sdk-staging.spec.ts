import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, parse, relative } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, expect, it } from 'vitest'
import { deduplicateStagedWorkspacePackages, materializeStagedLinks, resolveDeployTarget } from './build-exe-for-python-sdk-staging.ts'

const temporaryDirectories: string[] = []
const directoryLinkType = process.platform === 'win32' ? 'junction' : 'dir'

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture(prefix: string) {
  const workspace = await mkdtemp(join(tmpdir(), prefix))
  temporaryDirectories.push(workspace)
  return workspace
}

it('creates a fresh deploy parent without creating the target leaf', async () => {
  const workspace = await fixture('dsh-python-deploy-fresh-')
  const parent = join(workspace, 'runtime')
  const target = join(parent, 'node')
  await expect(resolveDeployTarget(target, workspace)).resolves.toBe(join(await realpath(workspace), 'runtime', 'node'))
  expect(existsSync(parent)).toBe(true)
  expect(existsSync(target)).toBe(false)
})

it('resolves a directory junction before passing the deploy destination to pnpm', async () => {
  const workspace = await fixture('dsh-python-deploy-linked-')
  const physical = join(workspace, 'physical')
  const logical = join(workspace, 'logical')
  await mkdir(physical)
  await symlink(physical, logical, directoryLinkType)
  await expect(resolveDeployTarget(join(logical, 'node'), workspace))
    .resolves.toBe(join(await realpath(physical), 'node'))
  expect(existsSync(join(physical, 'node'))).toBe(false)
})

it('rejects the filesystem root as a deploy destination before clearing anything', async () => {
  const workspace = await fixture('dsh-python-deploy-root-')
  await writeFile(join(workspace, 'retained'), 'keep')
  await expect(resolveDeployTarget(parse(workspace).root, workspace))
    .rejects.toThrow('contains the repository root')
  await expect(readFile(join(workspace, 'retained'), 'utf8')).resolves.toBe('keep')
})

it.each(['repository', 'ancestor'] as const)('rejects a physical %s reached through a directory junction', async (target) => {
  const workspace = await fixture('dsh-python-deploy-protected-')
  const physical = join(workspace, 'physical')
  const repository = join(physical, 'container', 'repo')
  const logical = join(workspace, 'logical')
  await mkdir(repository, { recursive: true })
  await writeFile(join(repository, 'retained'), 'keep')
  await symlink(physical, logical, directoryLinkType)
  await expect(resolveDeployTarget(target === 'repository' ? join(logical, 'container', 'repo') : join(logical, 'container'), repository))
    .rejects.toThrow('contains the repository root')
  await expect(readFile(join(repository, 'retained'), 'utf8')).resolves.toBe('keep')
})

/** List every symbolic link below a directory. */
async function listSymlinks(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink()) return [path]
    if (entry.isDirectory()) return listSymlinks(path)
    return []
  }))
  return nested.flat()
}

it('drops the deploy root link that points back into the payload', async () => {
  const workspace = await fixture('dsh-python-staging-root-')
  const project = join(workspace, 'python', 'sdk-runtime')
  const staging = join(project, 'src', 'runtime', 'node')
  await mkdir(join(staging, 'node_modules'), { recursive: true })
  await writeFile(join(project, 'package.json'), '{"name":"dsh-python-runtime-closure"}\n')
  await symlink(project, join(staging, 'node_modules', 'dsh-python-runtime-closure'), directoryLinkType)

  await materializeStagedLinks(staging)

  expect(existsSync(join(staging, 'node_modules', 'dsh-python-runtime-closure'))).toBe(false)
  await expect(readFile(join(project, 'package.json'), 'utf8')).resolves.toContain('dsh-python-runtime-closure')
})

it('copies workspace package links as files and removes command shims', async () => {
  const workspace = await fixture('dsh-python-staging-packages-')
  const staging = join(workspace, 'runtime', 'node')
  const packageDirectory = join(workspace, 'packages', 'dsh-base')
  await mkdir(join(packageDirectory, 'lib'), { recursive: true })
  await writeFile(join(packageDirectory, 'package.json'), '{"name":"@deepseek-ai/dsh-base"}\n')
  await writeFile(join(packageDirectory, 'lib', 'index.js'), 'export {}\n')
  await mkdir(join(staging, 'node_modules', '@deepseek-ai'), { recursive: true })
  await mkdir(join(staging, 'node_modules', '.bin'), { recursive: true })
  await writeFile(join(staging, 'package.json'), '{"name":"dsh-python-runtime-closure"}\n')
  await symlink(packageDirectory, join(staging, 'node_modules', '@deepseek-ai', 'dsh-base'), directoryLinkType)
  await symlink(packageDirectory, join(staging, 'node_modules', '.bin', 'dsh'), directoryLinkType)

  await materializeStagedLinks(staging)

  expect(existsSync(join(staging, 'node_modules', '.bin'))).toBe(false)
  await expect(readFile(join(staging, 'node_modules', '@deepseek-ai', 'dsh-base', 'lib', 'index.js'), 'utf8'))
    .resolves.toBe('export {}\n')
  expect(await listSymlinks(staging)).toEqual([])
})

it('shares an identical workspace package while retaining different peers and third-party copies', async () => {
  const workspace = await fixture('dsh-python-staging-dedupe-')
  const staging = join(workspace, 'payload')
  const modules = join(staging, 'node_modules')
  const root = join(modules, '@fixture', 'tools')
  const duplicate = join(modules, 'app', 'node_modules', '@fixture', 'tools')
  const differentPeers = join(modules, 'other', 'node_modules', '@fixture', 'tools')
  const external = join(modules, 'external')
  const externalCopy = join(modules, 'app', 'node_modules', 'external')
  for (const directory of [root, duplicate, differentPeers, external, externalCopy]) {
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'index.js'), 'exports.scheduler = Symbol("scheduler")\n')
  }
  const locations = (paths: string[]) => paths.map(path => relative(workspace, path))
  await writeFile(join(modules, '.modules.yaml'), JSON.stringify({ hoistedLocations: {
    '@fixture/tools@file:packages/tools(peer@1)': locations([root, duplicate]),
    '@fixture/tools@file:packages/tools(peer@2)': locations([differentPeers]),
    'external@1.0.0(@fixture/tools@file:packages/tools)': locations([external, externalCopy]),
  } }))

  await deduplicateStagedWorkspacePackages(staging, workspace)

  expect(existsSync(duplicate)).toBe(false)
  for (const directory of [root, differentPeers, external, externalCopy]) {
    expect(existsSync(join(directory, 'index.js'))).toBe(true)
  }
  const fromRoot = createRequire(join(staging, 'entry.cjs'))
  const fromApp = createRequire(join(modules, 'app', 'entry.cjs'))
  const fromOther = createRequire(join(modules, 'other', 'entry.cjs'))
  expect(fromApp('@fixture/tools')).toBe(fromRoot('@fixture/tools'))
  expect(fromOther('@fixture/tools')).not.toBe(fromRoot('@fixture/tools'))
})

it('resolves a junction payload before comparing physical pnpm hoisted locations', async () => {
  const workspace = await fixture('dsh-python-staging-physical-')
  const physical = join(workspace, 'physical-runtime')
  const logical = join(workspace, 'logical-runtime')
  const staging = join(logical, 'node')
  const modules = join(physical, 'node', 'node_modules')
  const root = join(modules, 'tools')
  const duplicate = join(modules, 'app', 'node_modules', 'tools')
  const outside = join(workspace, 'source')
  for (const directory of [root, duplicate, outside]) await mkdir(directory, { recursive: true })
  await symlink(physical, logical, directoryLinkType)
  const valid = { 'tools@file:packages/tools': [root, duplicate].map(path => relative(workspace, path)) }
  await writeFile(join(modules, '.modules.yaml'), JSON.stringify({ hoistedLocations: {
    ...valid,
    'other@file:packages/other': [relative(workspace, outside)],
  } }))

  await expect(deduplicateStagedWorkspacePackages(staging, workspace)).rejects.toThrow('outside deployed node_modules')
  expect(existsSync(duplicate)).toBe(true)
  expect(existsSync(outside)).toBe(true)

  await writeFile(join(modules, '.modules.yaml'), JSON.stringify({ hoistedLocations: valid }))
  await deduplicateStagedWorkspacePackages(staging, workspace)

  expect(existsSync(join(staging, 'node_modules', 'tools'))).toBe(true)
  expect(existsSync(duplicate)).toBe(false)
  expect(existsSync(outside)).toBe(true)
})

it('rejects invalid deployment metadata before removing any package', async () => {
  const workspace = await fixture('dsh-python-staging-metadata-')
  const staging = join(workspace, 'payload')
  const modules = join(staging, 'node_modules')
  const root = join(modules, 'tools')
  const duplicate = join(modules, 'app', 'node_modules', 'tools')
  const outside = join(workspace, 'source')
  for (const directory of [root, duplicate, outside]) await mkdir(directory, { recursive: true })
  const valid = { 'tools@file:packages/tools': [root, duplicate].map(path => relative(workspace, path)) }
  for (const invalid of [
    {},
    { hoistedLocations: { invalid: [42] } },
    { hoistedLocations: { ...valid, 'other@file:packages/other': [relative(workspace, outside)] } },
  ]) {
    await writeFile(join(modules, '.modules.yaml'), JSON.stringify(invalid))
    await expect(deduplicateStagedWorkspacePackages(staging, workspace)).rejects.toThrow('hoistedLocations')
    expect(existsSync(duplicate)).toBe(true)
    expect(existsSync(outside)).toBe(true)
  }
})
