# xhs-kit-dist

Distribution channel for the xhs-kit engine. Nothing here is meant to be used by hand.

- `flows/` — signed flow packages fetched by the engine. `manifest.json` is signed
  with ed25519 (`manifest.json.sig`); every flow file is pinned by sha256 in the
  manifest. The engine refuses unsigned, modified or rolled-back packages.
- Releases — engine binaries.
