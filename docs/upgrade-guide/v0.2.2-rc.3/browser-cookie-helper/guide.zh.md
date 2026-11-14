---
kind: upgrade-guide
description: 将维护版浏览器 Cookie 辅助函数的导入迁至令牌认证包。
---

# 浏览器 Cookie 辅助函数导入

[English](guide.md) | 中文

## 变更

维护版 `createBrowserSessionCookie` 导出从 `@deepseek-ai/dsh-client-connection` 迁至拥有浏览器签名密钥的 `@deepseek-ai/dsh-host-authentication-token`。复用已有浏览器会话授权的本地 Node 集成需要更新导入。

## 迁移

1. 将辅助函数导入替换为 `import { createBrowserSessionCookie } from '@deepseek-ai/dsh-host-authentication-token'`。
2. 在集成依赖中声明该包，保留现有凭据记录、目标主机和有效期参数。
3. 对选定 Host 验证鉴权请求。辅助函数保留既有 Cookie 格式和签名行为。
