# Agent Note: Preserve local behavior during the 0.2 runtime upgrade

Status: implemented

English | [中文](2026-10-04-local-runtime-upgrade.zh.md)

## Problem

The upstream 0.2 APIs and profile configuration differ from the local runtime's earlier interfaces, so updating source alone loses local behavior or leaves incompatible plugins.

## Decision

The local source runtime retains the shared HMR connection, editable goals, environment credential selection, full-access tool admission, preparation-failure followups and legacy Session migration while adopting the current upstream APIs. Client icons use the Regular exports, HMR consumes the current event route, and preparation failures leave only admitted prompts in durable history.

Third-party packages require the same 0.2 runtime and install from fixed commits reachable from their main branches. Their runtime dependencies resolve against the active source checkout. Settings move into profile configuration; the original settings document remains available as the imported predecessor. Existing committed Session generations remain immutable.

## Consequences

The original source changes, home files, profile manifests and plugin repository heads are backed up before replacement. Local source modifications remain local and are not published to the upstream repository.

Lockfile-only plugin operations validate named specs but defer installed-content checks and bundle activation to installation. This lets a compatible upgrade replace stale modules while the actual installation still rejects incompatible content.

## Alternatives considered

Keeping separate local runtime branches duplicates maintenance. Upgrading only third-party packages leaves their dependencies incompatible. Local source patches and main-reachable plugin pins retain one upstream checkout and explicit recovery data.
