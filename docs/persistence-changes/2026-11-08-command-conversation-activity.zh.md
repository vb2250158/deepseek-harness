---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-08-command-conversation-activity

[English](2026-11-08-command-conversation-activity.md) | 中文

## 概述

为 command/run 增加独立于模型轮次的可选显式对话活动声明。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-08-command-conversation-activity
baseline: false
changes:
  - root: "event:command/run"
    previous: "2026-09-11-initial"
    after: "9aaa163d4055e222e766a34dca617fa202a1292f1d324b917a2faea29411baeb"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有记录缺少 startsConversation，保留控制命令的空白语义。新读取方仅将字面量 true 视为列表展示、排序、复用及预设锁定的对话活动。旧读取方忽略此可选展示与复用提示并保留命令记录；模型历史、轮次边界、执行和恢复均不改变。格式 4 在两个读取方向仍有效。

<a id="verification"></a>
## 验证

命令、Session 列表与冷恢复及复用、预设锁定和 SDK server 针对性测试通过。显式命令只记录 command/run 与 command/done，不伪造模型轮次或 assistant 消息。

<a id="dev-note"></a>
## 开发备注

无。
