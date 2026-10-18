# Agent Note: Desktop 明确连接本机 Web 后端

Status: implemented

[English](2026-10-08-desktop-shared-web-backend.md) | 中文

## 问题

独立 Desktop 和 Web Host 可以共享持久文件，但插件启用、profile 设置和运行中的任务仍然独立。复制设置不能让它们成为同一后端，也无法避免对共享数据的冲突修改。

## 决策

Desktop 默认保留独立启动，允许明确连接使用相同 Harness home 的已运行 loopback Web 后端。Web 提供入口、客户端资源、插件、RPC 和流。原生载体提供启动等待机制和标准 Desktop 适配器，不启动子 Host 或准备 Desktop profile。[Desktop 参考](../../../../apps/desktop/README.zh.md#shared-web-backend)定义本机选择和限制。

载体通过凭据提供方的解析器读取已有浏览器会话 grant。Connection 导出复用现有鉴权 cookie 协议的签名器。逐请求签发的短期 cookie 仅保留在原生内存，绑定所选 authority。连接设置不保存启动令牌、cookie 或密钥，RPC 也不暴露它们。非 loopback、带凭据或令牌的地址在联网前被拒绝。入口在 Web 注入脚本释放启动等待之前声明本地连接参数，因此设置在原生启动 IPC 完成前也采用 Host 持久化。

## 影响

连接不拥有任务。关闭连接会取消原生请求；Web 继续负责自身进程、任务准入、插件事务和恢复。配置无效或鉴权失败时不会退回独立 Host。壳更新不停止或锁定共享 Web 任务。连接模式不提供嵌入 Platform 所需的私有 Host 凭据 IPC。

## 备选方案

同步两套 profile 安装仍保留独立启用和运行状态。共享包目录取消安装所有权，但不能合并进程。两种方案都不满足同一个运行后端的要求。

持久化启动 URL 或复用 renderer cookie 会产生额外的持久凭据，其过期也与已有 grant 独立。读取获准访问的本机 grant 可以把鉴权保留在原生进程内，并复用服务端现有协议。

## 验证

归属本模块的测试覆盖缺失和无效配置、鉴权、authority 绑定、cookie 过期、取消、不拥有任务以及凭据未被修改。主进程启动测试拒绝意外构造 Host 或安装 profile，并验证共享入口、资源和 API 转发。HTTP 测试保留 Web 注入，并在客户端脚本前加入原生启动等待机制。运行验收比较两端后端 PID、插件 profile 和稳定会话 ID，再完全退出 Desktop，确认 Web 仍运行。
