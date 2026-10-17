# Agent Note: Explicit Desktop attachment to a local Web backend

Status: implemented

English | [中文](2026-10-08-desktop-shared-web-backend.zh.md)

## Problem

Separate Desktop and Web Hosts can share durable files without sharing plugin activation, profile settings or live tasks. Copying settings between them does not make them one backend and permits conflicting mutations of shared data.

## Decision

Desktop retains standalone startup by default and permits an explicit attachment to a running loopback Web backend using the same Harness home. Web serves the entry, client assets, plugins, RPC and streams. The native carrier supplies its boot gate and standard Desktop adapters without starting a child Host or preparing a Desktop profile. The [Desktop reference](../../../../apps/desktop/README.md#shared-web-backend) owns local selection and limits.

The carrier reads the existing browser-session grant with the credential provider's parser. Connection exports one signer using the existing authenticated cookie protocol. Per-request short-lived cookies remain in native memory and bind the selected authority. No launch token, cookie or secret is saved in connection settings or exposed through RPC. Non-loopback, credential-bearing and token-bearing endpoints are refused before network access. The entry declares its local transport before Web injection scripts can release boot readiness, so settings use Host persistence even before native boot IPC settles.

## Consequences

The attachment owns no tasks. Closing it cancels native requests, while Web remains responsible for its processes, task admission, plugin transactions and recovery. Invalid selection or failed authentication never falls back to an independently started Host. Shell update does not stop or lock shared Web tasks. Embedded Platform's private Host credential IPC is unavailable in attachment mode.

## Alternatives considered

Synchronizing two profile installations retains independent activation and running state. Sharing their package directories removes installation ownership without combining processes. Both fail the requirement for one live backend.

Persisting a launch URL or reusing renderer cookies creates an unnecessary durable credential and expires independently of the existing grant. Reading the authorized local grant keeps authentication within the native process and reuses the server's current protocol.

## Verification

Owner-local tests cover absent and invalid selection, authentication, authority binding, cookie expiry, cancellation, no task ownership and unchanged credentials. Main startup tests reject accidental Host construction or profile installation and verify shared entry, asset and API forwarding. HTTP tests preserve Web injections and install native boot readiness before client scripts. Runtime acceptance compares both clients' backend PID, plugin profile and stable session IDs, then fully quits Desktop and checks that Web remains running.
