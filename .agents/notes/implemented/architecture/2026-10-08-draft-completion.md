# Agent Note: Input completion extension

Status: implemented

English | [中文](2026-10-08-draft-completion.zh.md)

## Problem

Third-party completion providers need to generate suggestions without owning the editor or changing submitted drafts before acceptance.

## Decision

`conversation.input.completion` is a single-occupancy Session slot. Its registration supplies an asynchronous text generator; the editor owns debounce, deadlines, IME state, end-of-caret checks, cancellation and Tab insertion. Providers receive no editor object. Ghost text is absent from drafts and submitted content until accepted.

Command and reference menus retain keyboard priority. Accepted suggestions use the existing `RangeSelection` and a separate undo step, preserving reference nodes. Blur, editing or disposal cancels generation.

## Consequences

Non-surface events can explicitly carry `ignorable: true` to retain auxiliary model-request source records. Unknown ignorable events follow existing decoding policy without changing committed generations or the Session format version. Auxiliary events never enter the primary model's surface.

Third-party providers own model, provider and completion prompts. The host owns editor operations, while the provider supplies deployment-varying controls. Tests cover ghost text, acceptance, undo, menu precedence, IME and late results.

## Alternatives considered

Giving each provider editor ownership duplicates cancellation, key handling and reference preservation. A host-owned completion slot keeps those operations in the existing editor while leaving model selection with providers.
