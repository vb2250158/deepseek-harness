# Agent Note: Models editor replacement for launch-environment keys

Status: implemented

English | [中文](2026-09-11-models-editor-launch-environment-key-override.zh.md)

## Problem

The Models editor disabled API-key input when the active credential came from the launch environment. That source is intentionally read-only and higher precedence than the credentials file, but the disabled control left users with no in-product way to replace a key for the provider.

## Decision

A typed replacement for a launch-environment key uses a page-managed `<ROUTE>_API_KEY_LOCAL` credential reference. The editor updates `apiKeyEnv` to that reference before storing the key, so the existing credential precedence remains unchanged while the replacement becomes effective. The page recognizes both derived references as credentials it owns for deletion; ambient launch credentials remain untouched.

## Alternatives considered

**Allow writing the conventional reference.** The launch environment would continue to win, so the saved value would appear successful without changing the active key.

**Change credential precedence.** This would weaken the launcher's explicit per-run override and change behavior for every credential consumer.

**Ask the user to restart without the environment variable.** This keeps the user outside the product and does not solve key replacement in the running session.

## Consequences

The editor remains compatible with the credential service's read-only environment semantics. A replacement adds one deterministic local reference to the provider profile and stores the secret only through `credentials.set`; the launch environment remains available until the profile is changed. Deleting a page-managed replacement removes its local credential, while deleting the provider never removes an ambient launch value.

## Testing

The Models component test verifies that an environment-sourced key is editable, that Apply writes `apiKeyEnv: <ROUTE>_API_KEY_LOCAL`, and that the replacement is stored under the local reference. The focused Models test file and repository typecheck pass.
