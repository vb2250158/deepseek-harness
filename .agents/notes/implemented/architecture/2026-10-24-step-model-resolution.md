# Agent Note: Resolve deployment routing before preparing a step

Status: implemented

English | [中文](2026-10-24-step-model-resolution.zh.md)

## Problem

Deployment policies can redirect a user's selected model without changing that choice. Resolving the target after prompt assembly makes conditional tools, prompt variables and the dispatched request disagree. Persistently selecting the target prevents removal of a routing rule from restoring the source.

## Decision

The Agent loop awaits `agent/resolve-model` once per proposed step, before tools and prompt assembly. Its default is the captured source selection. The loop copies and freezes the returned effective selection and retains it across retries. The existing request hook cannot change that fixed route or reasoning effort.

Routing listeners validate their target and use the existing `model/selection` event to retain an unrecorded fallback source when needed. They never select the temporary target. After asynchronous validation, they retain a later user choice instead of recording a stale source. The request header continues to record the actual dispatched route; no new durable event or replay state is introduced.

The [adapter capacity decision](2026-07-20-routed-model-context-and-compaction-policy.md) remains active: prepared adapters still own effective-route capacity and optional compaction policy. This decision adds the earlier routing operation and does not replace that responsibility.

## Alternatives considered

**Redirect in `agent/request`.** Tools and assembly have already captured the route; allowing a later change defeats their agreement.

**Select the target persistently.** Subsequent steps lose the original choice, so removing the rule cannot restore it.

**Resolve again on every retry.** Rule changes could alter the route while reusing a prompt and tool set prepared for another model.

## Consequences

Each step adds one awaited waterfall. Without listeners its selection and durable output remain unchanged. Resolution failures and cancellation prevent tool resolution, prompt assembly, user admission and model dispatch for that proposal. Rule changes apply to the next step, and middleware owns any logged explanation of its routing policy.
