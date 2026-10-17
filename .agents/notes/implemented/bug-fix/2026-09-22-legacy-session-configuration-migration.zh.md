# Agent Note: 旧会话配置迁移

Status: implemented

[English](2026-09-22-legacy-session-configuration-migration.md) | 中文

## Problem

已发布的 v0 日志包含默认权限来源或 v2 子会话描述符时，精确校验会拒绝读取，历史页面与中断检查因此失败。

## Decision

v0-to-v1 仅移除 `permission/preset.origin: default` 并保留预设值，将字段符合 v2 定义的描述符转为 v3，不补填新增的可选推理强度。现有校验继续检查模式、成对模型字段和工具限制。事件序号、会话身份与父关系不变；持久化生成后继版本，保留原始字节。

## Alternatives considered

**忽略所有未知字段或版本。** 未知配置可能改变权限与续作语义，因此不采用。

**改写原日志。** 已提交的日志版本必须不可变且可恢复，因此不采用。

## Consequences

已确认的历史格式可正常读取，未知来源和 v2 额外字段仍报错。读取历史不会投递提示或重新执行旧任务。
