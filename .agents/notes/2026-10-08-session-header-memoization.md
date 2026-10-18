# Memoize validated JSONL generation headers

English | [中文](2026-10-08-session-header-memoization.zh.md)

Repeated historical Session preparation and related-source validation enumerate the complete corpus to discover direct children. Header-only scans perform file opening, first-frame decoding, and header validation again even when the selected generation has not changed. Runtime stack and CPU samples identify this scan during slow batch title restoration.

The JSONL provider caches only validated headers, keyed by selected path and the existing stat-derived revision containing device, inode, size, modification time, and change time. A scan still enumerates all directories, chooses the highest generation, rejects duplicate identities, and removes entries for retired selected paths. Each cache hit retains the storage-identity check and returns independent metadata. Only equal pre-read and post-read revisions enter the cache; changed files, parse refusals, and missing files do not retain a previously accepted header.

Caching whole child-membership results would hide new children, replacements, and future generations unless it introduced another corpus invalidation authority. Header memoization preserves those checks and avoids adding a durable index or changing migration, Session events, model-visible inputs, or transcript output. Directory and stat work remains proportional to the corpus.

Focused regression covers unchanged first-frame reuse, caller metadata mutation, header replacement, malformed replacement, and a future successor above a warm readable generation. Existing JSONL, generation, and catalog-migration suites retain ownership of storage identity, cancellation, publication, and changing child facts. Runtime acceptance compares repeated listing and completes original unnamed Session renames with persisted-title readback; no Session IDs or original committed generations are replaced.
