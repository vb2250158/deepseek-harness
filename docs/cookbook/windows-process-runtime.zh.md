# Windows 进程名称与图标

[English](windows-process-runtime.md) | 中文

源码 Web 环境需要在 Windows 任务管理器中显示易辨认的名称与图标时，可以准备独立的本地 Node 运行文件。副本保留 Node 可执行代码、版本与版权，只替换 Windows 文件描述和应用图标，仍然运行正常的 `dsh` profile；此操作不构建桌面应用或安装包。

使用与当前 profile 相同版本、相同架构的 Node，传入绝对路径与尚不存在的输出目录：

```powershell
pnpm exec tsx scripts/windows-process-runtime.ts --node "C:\Program Files\nodejs\node.exe" --icon "C:\checkout\apps\desktop\resources\tray-windows.ico" --output "C:\DSHRuntime\prepared"
```

输出包含 `dsh-host.exe`（DSH 主服务）、`dsh-waimai.exe`（DSH 外卖工具）和 `manifest.json`。清单记录输入与输出的 SHA-256、原 Node 版本和版权，以及未签名状态。脚本拒绝覆盖已有输出目录，也不写入原可执行文件。

修改可执行资源后，本地副本不再保留原 Authenticode 签名。脚本不执行签名，不访问签名凭据，也不修改系统 Node 安装。

只有成功写出 `manifest.json` 才表示候选生成完成。失败可能留下空目录或部分文件，供诊断使用；再次生成时选择新目录，由调用方处理失败目录。

通过源码 Web 启动器的 `DSH_NODE_BIN` 选择 `dsh-host.exe`。守护进程在恢复时必须保留该选择，并结合选定可执行文件路径、CLI 参数和端口识别 Host。只筛选 `node.exe` 会漏掉改名后的进程。继续保留原 profile、工作目录、启动环境和退出流程。

`process.execPath` 会指向选定副本。通过它启动的子进程继承 Host 的文件描述与图标；需要独立名称的工具进程，应在自己的启动配置中明确选择 `dsh-waimai.exe`。依赖 `process.execPath` 的相邻路径查找 Node 或包管理器的调用方，仍需验证其实际入口。

完成隔离启动、子进程和退出检查后，由当前环境的生命周期拥有者接入这些文件。正在运行的进程保留已加载的身份，准备副本不会改名或重启它。报告部署完成前，核对新进程实际可执行路径、文件描述与图标资源。
