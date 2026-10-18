# 另一台电脑同步 & 启动 DSH（含插件）手册

## 目标

在新电脑上把当前仓库同步下来，安装依赖，启动后直接可用。DSH 的插件（`dsh-*`）随仓库一起同步，不需要单独导出安装。

## 一次性执行（Windows / PowerShell）

```powershell
# 1) 取代码
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness

# 2) 与当前你要同步的分支一致（默认是 master）
git checkout master

# 3) 安装依赖（推荐）
pnpm install --frozen-lockfile

# 4) 可选：首次完整构建（推荐第一次执行，减少首次运行不一致）
pnpm run build

# 5) 启动（如只是确认能跑，可直接跳过 build，先尝试）
pnpm dsh web
```

## 已有仓库目录时的同步更新

如果目标机器已经有仓库目录，直接切换到目录后执行：

```powershell
cd deepseek-harness
git fetch
git checkout master
git reset --hard origin/master
pnpm install --frozen-lockfile
pnpm dsh web
```

## 用私有库同步插件配置（推荐）

你提到要“通过私有库来同步”，按下面清单执行：

### 1) 同步范围（按仓库类型）

- 私有库（闭源、敏感数据、私有 plugin 清单）：`https://github.com/vb2250158/dsh-private-data`
- 开源库（可公开同步）：
  - `https://github.com/vb2250158/dsh-chat-enhancement`
  - `https://github.com/vb2250158/dsh-mobile-layout`
  - `https://github.com/vb2250158/dsh-network`
  - `https://github.com/vb2250158/dsh-environment-sync`
  - `https://github.com/vb2250158/dsh-plugins`

### 2) 同步前准备

1) 先在新机配置同一套私有源（如果你要从私库安装插件包）
```powershell
# 先确认 pnpm 在新机可用
pnpm --version

# 示例：把 <private-registry> 替换为你的私有库地址
pnpm config set registry <private-registry>
pnpm config set //<private-registry>/:_authToken $env:DSH_PRIVATE_REGISTRY_TOKEN
```

2) 统计开源仓库内插件清单（可复核数量，不包含聊天记录）
```powershell
$repoRoot = (Get-Location).Path
(Get-ChildItem -Recurse -Filter package.json -Path (Join-Path $repoRoot 'packages') |
  Where-Object {
    (Get-Content $_.FullName -Raw) -match '\"name\":\\s*\"@deepseek-ai/dsh-'
  }).Count
```

3) 统计默认可被 `dsh plugin` 按 `bundle` 配置安装的公开闭包（可直接用 `dsh plugin add`）
```powershell
$count = 0
Get-ChildItem -Recurse -Filter package.json -Path (Get-Location)\packages | ForEach-Object {
  try {
    $json = Get-Content $_.FullName -Raw | ConvertFrom-Json
    if ($json.dsh -and $json.dsh.bundle) { $count++ }
  } catch {}
}
$count
```

4) 在新机按清单重装 profile 外挂（会自动更新 `dsh.profile`）
```powershell
dsh plugin --profile web add @deepseek-ai/dsh-subagent-codex
dsh plugin --profile web add @deepseek-ai/dsh-subagent-claude-code
# 可替换成你实际要安装的 package 名称（开源仓库发包后可直接写包名）
```

5) 启动前校验 profile 插件生效
```powershell
dsh --profile web --dump-config > web-config-dump.yml
```

注意：你说的“插件可以开源”与“私有库闭源”是分层的。
可公开插件按上面的公开仓库处理；私有插件和敏感配置保存在 `dsh-private-data`，不进公开仓库。

### 私有库边界（必须执行）

- **开源插件**：按公开仓库列表逐一同步插件源码和配置，不走聊天/session 导出。
- **私有闭源插件**：只放在私有 npm 私库，不写进公开仓库代码。
- **私密数据**：`DSH_HOME` 下的私密文件（如凭据、会话目录）不放进源代码同步；由私有库或私有文件存储承载。
- **计数口径**：建议在同步前执行上面两条统计命令，把数字固定进变更说明（例如开源包个数、可安装 bundle 数）。
- **版本一致性**：私有库安装完成后再 `pnpm install --frozen-lockfile`，确保闭源闭包固定到清单版本。

## 关于浏览器/外部插件（Airtable、Spotify、Todoist 等）

这些属于浏览器生态扩展能力，不在 `dsh` 的仓库同步体系内。
要在另一台机器使用，需在目标机器独立安装并完成各自 OAuth/账号授权流程。

## 说明：为什么不是“单独传插件”

- 当前仓库内 DSH 的插件包条目（`package.json` 中 name 为 `@deepseek-ai/dsh-*` 的插件化能力）已经在仓库源码里定义。
- 只要同步仓库代码，并按上述安装流程启动，就会同步到同样的插件能力集合。
- `pnpm run build` 不是“必须每次都做”，但建议在首次/新环境先做一次；若首次启动报缺少构建产物，可补跑一次后再启动。

## 聊天内容（你要不要带）

- 这次流程主要同步 **插件与运行配置**，不会把会话/聊天内容强制带过去。
- 如果你也要带聊天内容，需要额外拷贝会话目录（如 `$DSH_HOME/sessions` 或当前会话目录）和相关凭据，不在仓库同步范围。

## 本仓库内要同步的插件化能力（随源码一起）

- `@deepseek-ai/dsh-host-plugin-inventory`
- `@deepseek-ai/dsh-plugin-package-inventory-deepseek`
- `@deepseek-ai/dsh-client-ui-settings-plugin-inventory`
- `@deepseek-ai/dsh-client-ui-settings-plugins`
