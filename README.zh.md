# DeepSeek Harness

[English](README.md) | 中文

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

它构建于**一切皆插件**的架构之上，由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)。

文档：[https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## 开发者预览

DeepSeek Harness 处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

运行本项目前，请阅读[安全说明](SAFETY.zh.md)。

<a id="run"></a>

## 运行

### 通过 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令默认会在 `http://127.0.0.1:3080` 启动 Web UI，本机启动时还会用默认浏览器打开页面。通过 SSH 启动时只打印宿主机 URL，因为本地转发地址由 SSH 客户端或编辑器持有。传入 `--no-open` 可仅运行服务器而不打开浏览器。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

<a id="run-from-source"></a>

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物。`pnpm dsh web` 会直接使用这些已构建产物，不会重新构建。

### 给另一台电脑的 agent 同步（推荐）

DSH 插件在这个仓库里和其他代码一块提交，不需要单独“发插件包”。你只要把代码同步到新机器，执行依赖安装和启动命令即可。

```powershell
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
git checkout master

pnpm install --frozen-lockfile

pnpm run build

pnpm dsh web
```

如果启动提示缺少构建产物，执行 `pnpm run build` 后再启动。

仓库中当前跟插件相关的四个包是（会随仓库一起同步）：

- `@deepseek-ai/dsh-host-plugin-inventory`
- `@deepseek-ai/dsh-plugin-package-inventory-deepseek`
- `@deepseek-ai/dsh-client-ui-settings-plugin-inventory`
- `@deepseek-ai/dsh-client-ui-settings-plugins`

### 私有库同步插件与配置（可选）

如果你要通过私有库把插件包统一管理并在多机复用，可按当前仓库清单执行：

- 私有闭源/敏感数据仓库（私有）：`https://github.com/vb2250158/dsh-private-data`
- 开源插件仓库（公开）：
  - `https://github.com/vb2250158/dsh-chat-enhancement`
  - `https://github.com/vb2250158/dsh-mobile-layout`
  - `https://github.com/vb2250158/dsh-network`
  - `https://github.com/vb2250158/dsh-environment-sync`
  - `https://github.com/vb2250158/dsh-plugins`（专门的插件同步仓库，保存脱敏数据与规则）

两台机器上都先配置相同的私有 registry 与 token，然后在目标机用 `dsh plugin` 安装同一组外置 bundle：

```powershell
pnpm config set registry <private-registry>
pnpm config set //<private-registry>/:_authToken $env:DSH_PRIVATE_REGISTRY_TOKEN

dsh plugin --profile web add @deepseek-ai/dsh-subagent-codex
dsh plugin --profile web add @deepseek-ai/dsh-subagent-claude-code
```

`dsh plugin` 只是把 profile 依赖和配置写到本机的 `DSH_HOME/profiles/<profile>`；它不自动带过会话历史。聊天内容仍是独立数据，不在这个同步范围内。

写文档建议：
- 机密配置（token、私有 host、目标路径）写在 `dsh-private-data`；
- 脱敏后的同步规则与插件清单写在 `dsh-plugins`。

### 插件同步范围与数量（开源 + 私有）

- 开源范围：仓库里的 `@deepseek-ai/dsh-*` 包会随仓库/构建同步。
- 闭源范围：`dsh-private-data` 只放私有插件和私密数据，不写入公开仓库或公开配置。
- 统计口径（按当前仓库快照，2026-09-07）：
  - `@deepseek-ai/dsh-*` 包清单总数：`324`
  - 带有 `dsh.bundle.patch` 的可独立 `dsh plugin` 安装 bundle 数：`10`
- 私密数据边界：凭据、密钥、session/private 归档只保存在私有存储（如 `DSH_HOME` 本机目录或独立私有库）内，不参与插件同步过程。

## 社区与支持

- 通过 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。
- 欢迎加入 DeepSeek Harness 企微群！扫描下方二维码填写入群问卷，小助手会定期发送入群邀请。

<table>
  <thead>
    <tr>
      <th align="center">入群问卷</th>
      <th align="center">微信公众号</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><a href="https://trtgsjkv6r.feishu.cn/share/base/form/shrcnIt5twSVdLGD52KJBckGCgg"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-survey.png" alt="DeepSeek Harness 入群问卷二维码" width="180" height="180"></a></td>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wechat-official-account.png" alt="DeepSeek Harness 团队微信公众号二维码" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。

`pnpm run dev:web` 会在一个终端里完成构建、启动，并在源码修改时重建 client bundle；`make help` 列出 Web 与 Desktop 对应的 Make target。完整表格见开发指南的「应用命令」一节。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 引用

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
