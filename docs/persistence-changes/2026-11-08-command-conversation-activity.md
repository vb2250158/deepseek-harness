---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-08-command-conversation-activity

English | [中文](2026-11-08-command-conversation-activity.zh.md)

## Summary

Adds optional explicit conversation activity to command/run, independent of model turns.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-08-command-conversation-activity
baseline: false
changes:
  - root: "event:command/run"
    previous: "2026-09-11-initial"
    after: "9aaa163d4055e222e766a34dca617fa202a1292f1d324b917a2faea29411baeb"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing records omit startsConversation and preserve control-command blankness. New readers treat only literal true as conversation activity for list visibility, ordering, reuse and preset locking. Older readers ignore this optional presentation/reuse hint and retain the command records; model history, turn boundaries, execution and recovery are unchanged. Format 4 remains valid in both directions.

<a id="verification"></a>
## Verification

Focused commands, Session list/cold restore/reuse, preset locking and SDK server tests passed. Explicit commands record only command/run and command/done; no model turn or assistant message is fabricated.

<a id="dev-note"></a>
## Dev Note

None.
