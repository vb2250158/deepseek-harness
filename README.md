# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It is built on an **everything-is-a-plugin** architecture and powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512).

Documentation: [https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## Developer preview

DeepSeek Harness is in _developer preview_ and iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

Review the [safety notice](SAFETY.md) before running the project.

## Run

### Run from `npm`

Install `Node.js`, then run:

```sh
npx @deepseek-ai/dsh web
```

The command starts the Web UI at `http://127.0.0.1:3080` by default and opens it in the default browser for a local launch. An SSH launch only prints the host URL because the SSH client or editor owns the local forwarded address. Pass `--no-open` to run the server without opening a browser. See [Web UI guide](docs/user/guide/index.md).

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` prepares the repository artifacts. `pnpm dsh web` uses those built artifacts without rebuilding.

### Sync to another machine (recommended)

DSH pluginized packages are tracked in this repository and sync together with source. To make another machine usable, sync this repo and run dependency install + startup.

```powershell
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
git checkout master

pnpm install --frozen-lockfile

pnpm run build

pnpm dsh web
```

If quick validation fails with missing built artifacts, run `pnpm run build` and start again.

Current plugin packages synced by this repository include:

- `@deepseek-ai/dsh-host-plugin-inventory`
- `@deepseek-ai/dsh-plugin-package-inventory-deepseek`
- `@deepseek-ai/dsh-client-ui-settings-plugin-inventory`
- `@deepseek-ai/dsh-client-ui-settings-plugins`

### Syncing via private package registry (optional)

For cross-machine consistency of external plugin sync, use this repository topology (vb2250158 namespace):

- Private source (closed-source + sensitive data): `https://github.com/vb2250158/dsh-private-data`
- Public plugin repositories:
  - `https://github.com/vb2250158/dsh-chat-enhancement`
  - `https://github.com/vb2250158/dsh-mobile-layout`
  - `https://github.com/vb2250158/dsh-network`
  - `https://github.com/vb2250158/dsh-environment-sync`
  - `https://github.com/vb2250158/dsh-plugins` (dedicated plugin-sync repo; keep only redacted metadata, no secrets)

Recommended placement for operational docs:
- Keep detailed machine-specific sync docs (tokens, full URLs, hostnames, local path assumptions) in `dsh-private-data`.
- Keep only redacted plugin inventories and non-sensitive synchronization rules in `dsh-plugins`.

Configure the same private registry auth on both machines, then install the same plugin package set with `dsh plugin` on the target profile.

```powershell
pnpm config set registry <private-registry>
pnpm config set //<private-registry>/:_authToken $env:DSH_PRIVATE_REGISTRY_TOKEN

dsh plugin --profile web add @deepseek-ai/dsh-subagent-codex
dsh plugin --profile web add @deepseek-ai/dsh-subagent-claude-code
```

`dsh plugin` syncs profile-level package and patch configuration; it does not sync chat/session history. Chat contents remain separate data and must be transferred separately if needed.

### Plugin sync scope and counts (open-source + private)

- Open-source scope: keep plugin source and metadata in public repos listed above.
- Private/closed-source scope: keep secret plugins and private data in `dsh-private-data`, and never include credentials/data in synced public repos.
- Snapshotable plugin count (current checked on 2026-09-07):
  - `@deepseek-ai/dsh-*` package manifests in this repo: `324`
  - Bundles with `dsh.bundle.patch` (add/removable via `dsh plugin --profile ... add/remove`): `10`
- Secret data boundary: credentials, API keys, and session/private archives stay in private storage (for example `DSH_HOME` machine-local files or a private repository), and are not part of plugin sync itself.

## Community and support

- Submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Join <a href="https://discord.gg/4MrtZUhpxg">DeepSeek Harness Discord community</a>.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

`pnpm run dev:web` builds, serves, and rebuilds client bundles on source edits in one terminal, and `make help` lists the matching Make targets for Web and Desktop; the guide's application commands section owns the full table.

For agents, follow [AGENTS.md](AGENTS.md).

## Citation

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
