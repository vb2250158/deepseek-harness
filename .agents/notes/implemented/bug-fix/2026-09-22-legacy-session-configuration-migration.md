# Agent Note: Legacy session configuration migration

Status: implemented

English | [中文](2026-09-22-legacy-session-configuration-migration.zh.md)

## Problem

Released v0 logs can contain a default permission origin or a v2 subagent descriptor. Exact payload validation rejects these records, so history reads and interruption scans fail before the current restorer runs.

## Decision

The v0-to-v1 normalization removes only `permission/preset.origin: default` and preserves the preset. It promotes exact descriptor v2 fields to v3 without supplying the newly optional reasoning effort. Existing validators still check mode, paired model fields and tool restrictions. Sequence coordinates, session identity and parent ownership are unchanged; persistence writes a successor generation and retains the original bytes.

## Alternatives considered

**Ignore unknown fields or versions.** Rejected because unknown configuration may change permission or continuation semantics.

**Rewrite the original logs.** Rejected because committed generations must remain immutable and recoverable.

## Consequences

Known historical records become readable without relaxing validation for unknown variants. Unknown origin values and additional v2 fields remain errors. Reading old conversations does not submit a prompt or restart their historical work.
