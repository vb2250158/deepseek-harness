---
description: "Observable browser state stores with explicit snapshots, subscriptions, and lifecycle ownership."
kind: "package-library"
---
# @deepseek-ai/dsh-client-store

English | [中文](README.zh.md)

## Summary

React-free observable and snapshot-store primitives shared by Client controllers and renderer adapters. The package owns synchronous and animation-frame publication, Immer-backed updates, shallow equality, and optional browser persistence; React hook construction remains in `@deepseek-ai/dsh-client-ui-renderer`. Use it when Client state must publish stable snapshots without depending on React.

## Table of Contents

- [Startup diagnostics](#startup-diagnostics)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="startup-diagnostics"></a>
## Startup diagnostics

`recordStartupPhase(stage, result)` records one first-screen result per document through native User Timing (`dsh:startup`, `detail: { version: 1, kind: 'phase', stage, ...result }`), from document time origin to the caller's commit observation. Omitting `result` records `outcome: 'committed'`; a layout-owned `outcome: 'not-visible'` requires `reason: 'initial-main-panel'` or `'sidebar-collapsed'` and does not claim that content was displayed. The first result wins across later navigation. Optional timing failures are contained; callers own successful-readiness and visibility conditions.

<a id="model-experience"></a>
## Model Experience

None, as this package provides browser-side state primitives and registers nothing model-facing.

#### KV Cache effect

None; the stores neither assemble nor send model requests.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Persistence is browser-local** — persisted stores use JSON in `localStorage`; non-browser runtimes disable persistence, and the package provides no cross-device synchronization.
- **Web-shell build input** — the static ESM retains third-party imports for Vite; independent consumers supply its development dependencies ([dependency rules](../AGENTS.md#dependency-declaration)). The build defaults to production; `NODE_ENV=development` enables development checks. Wholesale `set()` freezes snapshots only outside production; `update()` retains Immer's automatic freezing.


<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
