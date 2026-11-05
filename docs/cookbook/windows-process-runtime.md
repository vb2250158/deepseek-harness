# Windows process names and icons

English | [中文](windows-process-runtime.zh.md)

Prepare local Node runtime copies when a source Web installation needs recognizable names and icons in Windows Task Manager. The copies retain the Node executable code, version and copyright, while replacing the Windows file description and application icon. They still launch the normal `dsh` profile; this does not build the Desktop application or an installer.

Use the same Node version and architecture as the active profile. Supply absolute paths and a new output directory:

```powershell
pnpm exec tsx scripts/windows-process-runtime.ts --node "C:\Program Files\nodejs\node.exe" --icon "C:\checkout\apps\desktop\resources\tray-windows.ico" --output "C:\DSHRuntime\prepared"
```

The output contains `dsh-host.exe` (`DSH 主服务`), `dsh-waimai.exe` (`DSH 外卖工具`) and `manifest.json`. The manifest records input and output SHA-256 values, the original Node version and copyright, and the unsigned status. The script refuses an existing output directory and never writes to the input executable.

Changing executable resources removes the original Authenticode signature from each local copy. The script does not sign files, access signing credentials or change the system Node installation.

Only a successfully written `manifest.json` marks a complete candidate. A failure can leave an empty or partial output directory for diagnosis; use a new directory for another attempt and let the caller manage the failed output.

Select `dsh-host.exe` through the source Web launcher's `DSH_NODE_BIN`. Its supervisor must preserve that selection on recovery and identify the Host using the selected executable path, CLI arguments and port. Filtering only for `node.exe` misses the renamed process. Keep the normal profile, working directory, launch environment and shutdown procedure.

`process.execPath` points to the selected copy. A child spawned through it inherits the Host's file description and icon. A separately named tool process must explicitly select `dsh-waimai.exe` at its spawning configuration. Consumers that locate Node or package managers relative to `process.execPath` need their normal entry-path smoke checks.

Activate the prepared files through the installation's existing lifecycle owner after isolated startup, child-process and exit checks. An already running process retains its loaded identity; preparing files does not rename or restart it. Read back the new process's executable path, file description and icon resources before reporting deployment complete.
