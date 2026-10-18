---
description: "Whole-log conversation counts and wall times for clients and maintainers choosing, composing, or debugging the sessionStats projection unit."
kind: "package-reference"
---

# @deepseek-ai/dsh-session-stats

English | [中文](README.zh.md)

## Summary

This package gives clients whole-session turn and step counts plus LLM, tool, first-token, and decode wall times through the public `sessionStats` value. The figures come from the complete durable log, so paging and compaction do not change them. Use it when a client must display consistent conversation statistics across reloads and reduced history. When whole-session statistics are unavailable, clients can use window-scoped counting instead.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the plugin beside the session store and the projection registry when clients should display whole-session conversation figures that survive paging and compaction. The unit registers only when the registry is present.

### Composition

```yaml
- name: '@deepseek-ai/dsh-session'
- name: '@deepseek-ai/dsh-session-projection'
- name: '@deepseek-ai/dsh-session-stats'
```

### What the figures mean

| Field | Meaning |
|---|---|
| `turns` | Distinct turns with at least one closed step; rejected or empty turns are uncounted |
| `steps` | Closed steps — completed, failed, cancelled, and max-tokens steps all count |
| `turnMs` | Summed matched `turn/start` → `turn/end` wall time, including failed, cancelled and empty turns; time between turns is excluded |
| `otherMs` | Closed-turn time outside recorded model, matched tool and compaction intervals; overlapping intervals count once for coverage |
| `llmMs` | Summed model wall time over message-assembling steps, excluding overlapping compaction |
| `compactionMs` | Matched compaction start-to-end wall time, including failed attempts; unfinished attempts are not yet counted |
| `toolMs` | Summed matched `tool/call` → `tool/result` wall time |
| `ttftMs` / `ttftSteps` | Summed first-token latency and the steps carrying it |
| `decodeMs` / `decodeTokens` | Summed decode wall time and provider output tokens over usage-reporting steps |

Every field is 0 until its first contributing event; the composed registry always serves the key, so clients read the value rather than key presence. Clients render whole-log figures through the projection seam's snapshot and change feed; the reference consumer is the web chat stats strip, whose window fold mirrors these field names as its no-unit fallback.

Other time includes preparation before steps, stopping after steps, waits and incomplete steps without assembled messages. Parallel tools can make summed tool time exceed their covered wall time. Compaction outside a turn contributes to `compactionMs` only. Open turns contribute only after their matching end. Older providers and paged-node fallback omit these values. Cache state version 3 rebuilds them from the existing log.

### Failures and recovery

The unit is inert without the projection registry: `inject` keeps the fiber pending and nothing registers, so other assemblies lack the `sessionStats` key. Unmounting the plugin removes the key, because registrations are effects on the mounting fiber. A crash-interrupted step counts after the session reloads, when crash recovery appends its synthetic `step/end`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the fold behind the figures; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design concept

The unit is a pure fold over committed session events: `step/end` is the counted step event because the agent loop appends exactly one per entered step in a `finally`, so completed, failed, cancelled, and max-tokens steps all land one. Counting assembled assistant messages instead would overcount max-tokens usage-host messages (empty content, excluded from the surface) and undercount cancelled steps (aborted before the message assembles). The wall-time folds mirror the client window fold field by field.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `inject`, unit registration on the mounting fiber |
| [`src/projection.ts`](src/projection.ts) | The fold: state shape, per-event transitions, wire view |
| [`src/types.ts`](src/types.ts) | One home of the `sessionStats` projection-key declaration and field types |

### Data model

State version 3 rebuilds prior cached totals from the original log. The fold state holds accumulated totals and current turn, step, tool-call and compaction intervals. The wire view contains only totals; persisted-cache validation also covers the current intervals.

### Fold rules

- Uninteresting events return the same state reference; the registry's `Object.is` gate keeps the change feed quiet.
- Compaction is paired by transaction id. Its overlap is removed from model, first-token, and decode intervals; standalone compaction contributes only its own duration.
- First-token latency records the first non-empty delta chunk and survives an in-step `llm/retry`.
- Decode time and tokens accrue only over steps carrying both a first token and a valid provider usage report; malformed usage is ignored like the window fold guards node usage.
- Tool time pairs `tool/call` → `tool/result` by callId; unresolved calls are dropped at `turn/end` because results land within their turn, and a callId colliding with an `Object` prototype name reads as unmatched.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the unit's contract is not enough. They move from the registry that drives units to adjacent session packages.

- [Session projection subsystem](../../../docs/subsystems/session-projection.md) — the registry that drives units and serves snapshot and change-feed values.
- [Session projection registry package](../session-projection/README.md) — the registry contract units register against.
- [Session package map](../README.md) — adjacent persistence, projection, title, and telemetry packages.

-----

<a id="model-experience"></a>
## Model Experience

None, as the sessionStats unit folds already-logged step boundaries into a client-facing read model and registers nothing model-facing.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define what the figures describe and when the unit is absent. They are current package constraints.

- **Steps count work attempted, not visible output** — a step that failed before producing visible content still closes with `step/end` and counts; a step interrupted by a crash counts after the session reloads, when crash recovery appends its synthetic `step/end`.
- **Cancelled steps contribute to other closed-turn time** — without an assembled message they add no model or decode time; max-tokens usage-host messages contribute model time invisible on the surface.
- **Counts are log-scoped, not surface-scoped** — steps whose messages were later compacted away stay counted; the figures describe the whole session, not the current model-visible surface.
- **Mounted only where the projection registry is composed** — other assemblies serve no `sessionStats` key, and their consumers fall back to window-scoped counting.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
