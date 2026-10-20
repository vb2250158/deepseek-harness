# Agent Note: Sidebar Browser 扩展桥接

Status: implemented

[English](2026-10-08-sidebar-browser-bridge.md) | 中文

## 问题

扩展调用方需要操作选中的 Browser 标签，但不应再创建一套渲染器或拥有导航状态。

## 决定

官方 Browser 渲染器拥有标签导航与页面呈现。`ctx.sidebarBrowser` 按 Session 和标签提供已挂载 Controller 及可选 iframe 消息租约，让扩展调用方复用官方界面。此记录补充[Sidebar Browser 决定](2026-09-16-sidebar-browser.zh.md)，原有导航与持久化决定继续有效。

## 影响

服务不读取网页、注册工具或授予扩展权限。调用方核对当前 Session 与标签、完成扩展授权、通过工具管线记录结果并处理取消。iframe 替换、卸载或隐藏后，原物理租约失效。Desktop 可继续导航，但不提供 iframe 租约。插件卸载撤回 Controller 注册；旧释放回调不会撤回新的注册。

## 备选方案

独立浏览器面板重复维护导航、持久化和卸载。共享已挂载的官方 Controller 保留唯一归属，同时不提供网页内容读取能力。

## 验证

包测试覆盖 Session 隔离、官方持久化写入、非法地址、替换与隐藏后的租约失效、注册释放以及已有 Web/Desktop 导航。调用插件另外验证旧存档迁移和跨域合成网页上的扩展操作。
