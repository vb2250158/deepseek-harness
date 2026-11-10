---
kind: upgrade-guide
description: 用户消息替换迁移到共享消息行 Slot，使正式消息与待处理输入使用同一渲染入口。
---

# 各接纳状态共用用户消息渲染

[English](guide.md) | 中文

## 变更

默认 `conversation.chat.user.row.body` 条目现在声明 `conversation.chat.user.before`；正式 `user` Chat 节点条目不再声明它。来源装饰注册继续使用原有 owner props，并且仍只在正式 user 节点上显示。

`conversation.chat.user.row` Factory 提供准备好的内容及 `UserRowInput.origin` 判别联合，分别表示正式节点、本地提交和 Host 待处理 steering。仅替换 `conversation.chat.node` 的 user 或 steering 条目不会替换待处理消息。

## 迁移

1. 将共用消息布局移到 `conversation.chat.user.row.body` 单项 Slot 注册。读取准备好的 `content`、`facts` 和 `loadImage`，仅在控制状态相关操作时检查 `origin`；尚未提交的输入没有正式节点。
2. 保留默认 body 时，继续使用既有 `conversation.chat.user.before` 贡献。替换 body 自行拥有来源装饰；为该装饰声明独立命名的子 Slot，不要重复声明默认 body 的装饰链。
3. 移除正式节点替换，或将其改为薄适配器，调用 `renderFactorySlot('conversation.chat.user.row', input)` 并传入真实的正式来源。
4. 在测试会话中延迟接纳，确认本地消息、待处理 steering 和正式消息使用同一 body，且来源装饰仍只出现在正式 user 消息上。
