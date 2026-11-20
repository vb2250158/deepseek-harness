---
kind: upgrade-guide
description: "Custom non-owner Web roles that grant only the full Session control action lose live projection updates until they also grant the compact control action."
---
# Grant compact Session control to custom Web roles

English | [中文](guide.zh.md)

## Change

The Web client now opens `session/compactControl` at startup. A non-owner with a custom role that only grants `session/control` can lose live projection updates. The Gateway checks the action on the global resource when the stream opens and on each Session before sending its baseline or updates. Clients that explicitly call `session/control` continue to receive full values under their existing grants. Built-in LiveShare viewer roles already grant the new action.

## Migration

1. In your policy provider, add `session/compactControl` alongside `session/control` in the `actions` of the existing global reader role and the existing Session reader role. Keep their resource bindings and conditions.
2. For readers who need an on-demand value, grant `session/projections` on the permitted Session. The Web client requests that Session and key when its detail view opens.
3. Open the Web client as the non-owner. Confirm the shared Session receives its initial projection values and live updates, and that opening its detail view loads the value. Check that a Session outside the original binding appears in neither the baseline nor updates and that a direct detail request for it is denied.
