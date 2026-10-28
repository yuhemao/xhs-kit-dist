# xhs-kit-dist

Distribution channel for the xhs-kit engine.

**安装：把本仓库链接发给你的 AI 助手（Claude / WorkBuddy / Codex），它会读取 [AGENT_INSTALL.md](AGENT_INSTALL.md) 自动完成安装。**
使用教程见 [USAGE.md](USAGE.md)。

Nothing else here is meant to be used by hand.

- `flows/` — signed flow packages fetched by the engine. `manifest.json` is signed
  with ed25519 (`manifest.json.sig`); every flow file is pinned by sha256 in the
  manifest. The engine refuses unsigned, modified or rolled-back packages.
- Releases — engine binaries.
