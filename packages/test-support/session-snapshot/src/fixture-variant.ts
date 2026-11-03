/** Explicit operating-system fixture selection; scenarios without variants retain their original directory. */
import { join } from 'node:path'
import type { SnapshotManifest } from './manifest.ts'

/**
 * Select one complete fixture directory from a parsed manifest.
 * @param directory - Owning scenario directory.
 * @param manifest - Parsed manifest whose variant names are single child-directory segments.
 * @param platform - Runtime operating system, injectable for deterministic tests.
 * @returns Declared variant directory or the original directory when none applies.
 */
export function snapshotFixtureDirectory(
  directory: string,
  manifest: Pick<SnapshotManifest, 'fixtureVariants'>,
  platform: NodeJS.Platform = process.platform,
): string {
  const variant = platform === 'win32' ? manifest.fixtureVariants?.win32 : undefined
  return variant === undefined ? directory : join(directory, variant)
}

/**
 * Resolve a manifest-declared cross-profile sidecar without depending on checkout symlinks.
 * @param profileDirectory - Corpus directory containing the consuming profile's scenarios.
 * @param source - Parsed header source; local scenario names retain the suite's usual routing.
 * @param file - Header sidecar filename.
 * @returns The canonical cross-profile owner path, or undefined for a local/default source.
 */
export function snapshotCrossProfileSidecar(
  profileDirectory: string,
  source: string | undefined,
  file: 'system-prompt.expected.md' | 'tool-schemas.expected.json',
): string | undefined {
  return source?.includes('/') === true ? join(profileDirectory, '..', source, file) : undefined
}
