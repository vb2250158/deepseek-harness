# Agent Note: Preserve local behavior during the 0.2 runtime upgrade

Status: implemented

English | [中文](2026-10-04-local-runtime-upgrade.zh.md)

## Problem

The local runtime includes fixes and UI behavior that the upstream release does not provide. Replacing the checkout without preserving these changes loses working behavior; retaining older interfaces prevents current plugins from loading.

## Decision

The local source runtime retains the shared HMR connection, editable goals, environment credential selection, full-access tool admission, preparation-failure followups and legacy Session migration while adopting the current upstream APIs. Client icons use the Regular exports, HMR consumes the current event route, and preparation failures leave only admitted prompts in durable history.

Third-party packages require the same 0.2 runtime and install from fixed commits reachable from their main branches. Their runtime dependencies resolve against the active source checkout. Settings move into profile configuration; the original settings document remains available as the imported predecessor. Existing committed Session generations remain immutable.

## Recovery

The original source changes, home files, profile manifests and plugin repository heads are backed up before replacement. Local source modifications remain local and are not published to the upstream repository.

Lockfile-only plugin operations validate named specs but defer installed-content checks and bundle activation to installation. This lets a compatible upgrade replace stale modules while the actual installation still rejects incompatible content.

## Alternatives considered

Discarding the local changes loses the existing fixes. Keeping the older runtime prevents installation of plugins that require the current public APIs.

## Consequences

The local modifications require a cumulative patch for other computers and need review when upstream interfaces change. The official checkout retains its upstream history, while shared plugins remain independently installable from their fixed commits.
