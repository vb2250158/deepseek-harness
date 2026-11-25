---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-25-session-history-cleared

[English](2026-11-25-session-history-cleared.md) | 中文

## 概述

在替换后的会话日志中记录对话重置。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-25-session-history-cleared
baseline: false
changes:
  - root: "event:session/history-cleared"
    previous: null
    after: "ce7d7beacf158c2b402b3a8fe0791b117b2f2327b1e0b87de87790ba8fdcb7bf"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

新写入方将该日志事件标记为可忽略。早期 V4 读取方可以跳过该事件，旧消息不会回到对话；事件的显式活动标志使原会话仍出现在列表中。新读取方继续接受没有此事件的 V4 日志。

<a id="verification"></a>
## 验证

Windows 上使用 Node 24.22.3 通过 JSONL 替换测试，覆盖写入占用拒绝、拒绝替换保留原修订，以及用原会话 ID 回读替换日志。

<a id="dev-note"></a>
## 开发备注

无。
