---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-25-session-history-cleared

English | [中文](2026-11-25-session-history-cleared.zh.md)

## Summary

Marks a conversation reset within its replacement Session log.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-25-session-history-cleared
baseline: false
changes:
  - root: "event:session/history-cleared"
    previous: null
    after: "ce7d7beacf158c2b402b3a8fe0791b117b2f2327b1e0b87de87790ba8fdcb7bf"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

New writers mark this log-only event ignorable. Earlier V4 readers can skip it without restoring any old messages. Its explicit conversation activity flag keeps the same Session row discoverable. New readers continue to accept existing V4 logs without the marker.

<a id="verification"></a>
## Verification

The Windows JSONL replacement test passed on Node 24.22.3. It verifies that an active writer blocks replacement, a rejected rewrite preserves the old revision, and the replacement reads back under the original Session ID.

<a id="dev-note"></a>
## Dev Note

None.
