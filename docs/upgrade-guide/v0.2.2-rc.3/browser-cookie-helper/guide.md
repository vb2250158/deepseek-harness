---
kind: upgrade-guide
description: Move the maintained browser-cookie helper import to the token authentication package.
---

# Browser-cookie helper import

English | [中文](guide.zh.md)

## Change

The maintained `createBrowserSessionCookie` export moves from `@deepseek-ai/dsh-client-connection` to `@deepseek-ai/dsh-host-authentication-token`, alongside the browser signing-key owner. This affects local Node integrations that reuse an existing browser-session grant.

## Migration

1. Replace the helper import with `import { createBrowserSessionCookie } from '@deepseek-ai/dsh-host-authentication-token'`.
2. Declare that package in the integration's dependencies. Keep the existing credential record, authority and lifetime arguments.
3. Verify the authenticated request against the selected Host. The helper retains its existing cookie format and signing behavior.
