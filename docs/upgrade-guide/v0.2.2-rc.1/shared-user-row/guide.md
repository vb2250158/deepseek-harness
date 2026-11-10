---
kind: upgrade-guide
description: User-message replacements move from durable Chat nodes to a shared row Slot that also receives pending input.
---

# Share user-message rendering across admission states

English | [中文](guide.zh.md)

## Change

The default `conversation.chat.user.row.body` entry now declares `conversation.chat.user.before`; the durable `user` Chat-node entry no longer declares it. Source-decoration registrations keep the same owner props and still render only for durable user nodes.

The `conversation.chat.user.row` Factory supplies prepared content and a `UserRowInput.origin` discriminated union for durable nodes, local submissions, and Host-pending steering. Replacing only a `conversation.chat.node` user or steering entry does not replace pending messages.

## Migration

1. Move shared message chrome to a `conversation.chat.user.row.body` single-Slot registration. Read prepared `content`, `facts`, and `loadImage`, then inspect `origin` only for state-specific controls; uncommitted input has no durable node.
2. Keep existing `conversation.chat.user.before` contributions when retaining the default body. A replacement body owns its decoration; use a separately named child Slot for that decoration rather than redeclaring the default body's chain.
3. Remove the durable-node replacements, or make them thin adapters that call `renderFactorySlot('conversation.chat.user.row', input)` with the actual durable origin.
4. Delay admission in a test conversation and confirm that local, pending-steering, and durable messages use the same body, while source decoration still appears only on durable user messages.
