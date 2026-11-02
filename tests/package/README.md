# Cross-package account regression

With Node 22.13 or newer, from the repository root:

```sh
npm run build:types
node tests/package/run.mjs
```

The runner packs the local source and declarations, then installs that tarball in
a fresh temporary consumer with exact EVM beta.17, beta.18, and beta.19 packages.
The first two use npm aliases so their source and declarations remain distinct
from the gasless dependency. The runtime test asserts the resolved paths and
class identities, then checks address preservation, message and typed signatures,
signing delegation, rejection propagation, and existing owner disposal behavior.
Private-key accounts without derivation metadata are included. No RPC is used.

Installation requires registry access. Lifecycle scripts are disabled. The printed
temporary directory retains the tarball, manifest, lockfile, and fixtures for
inspection; remove it after reviewing the result. Set `TMPDIR` to retain it in a
specific directory.

The constructor type check uses `strict` with `skipLibCheck` to isolate consumer
compatibility. It does not claim full dependency declaration correctness. To check
the complete declarations, run this from the printed consumer directory:

```sh
node node_modules/typescript/bin/tsc --strict --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --pretty false consumer.ts
```

The baseline full check reports TS2416 for the gasless manager's `getAccount`
overload, including with EVM beta.17. Report that separately from constructor
compatibility rather than treating a consumer-only pass as a full declaration pass.
