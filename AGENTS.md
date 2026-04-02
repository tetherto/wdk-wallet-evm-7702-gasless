# Agent Guide

This repository is part of the Tether WDK (Wallet Development Kit) ecosystem. It follows strict coding conventions and tooling standards to ensure consistency, reliability, and cross-platform compatibility (Node.js and Bare runtime).

## Project Overview
- **Architecture:** Modular architecture with clear separation between Core, Wallet managers, and Protocols.
- **Runtime:** Supports both Node.js and Bare runtime.

## Tech Stack & Tooling
- **Language:** JavaScript (ES2015+).
- **Module System:** ES Modules (`"type": "module"` in package.json).
- **Type Checking:** TypeScript is used purely for generating type declarations (`.d.ts`). The source code remains JavaScript.
  - Command: `npm run build:types`
- **Linting:** `standard` (JavaScript Standard Style).
  - Command: `npm run lint` / `npm run lint:fix`
- **Testing:** `jest` (configured with `experimental-vm-modules` for ESM support).
  - Command: `npm test`
- **Dependencies:** `cross-env` is consistently used for environment variable management in scripts.

## Coding Conventions
- **File Naming:** Kebab-case (e.g., `wallet-manager.js`).
- **Class Naming:** PascalCase (e.g., `WdkManager`).
- **Private Members:** Prefixed with `_` (underscore) and explicitly documented with `@private`.
- **Imports:** Explicit file extensions are mandatory (e.g., `import ... from './file.js'`).
- **Copyright:** All source files must include the standard Tether copyright header.

## Documentation (JSDoc)
Source code must be strictly typed using JSDoc comments to support the `build:types` process.
- **Types:** Use `@typedef` to define or import types.
- **Methods:** Use `@param`, `@returns`, `@throws`.
- **Generics:** Use `@template`.

## Development Workflow
1.  **Install:** `npm install`
2.  **Lint:** `npm run lint`
3.  **Test:** `npm test`
4.  **Build Types:** `npm run build:types`

## Key Files
- `index.js`: Main entry point.
- `src/`: Core logic.
- `types/`: Generated type definitions (do not edit manually).

## Repository Specifics
- **Domain:** EVM Gasless Account Abstraction (EIP-7702 + ERC-4337).
- **Key Libraries:** `permissionless` (permissionless.js), `viem`, `ethers`.
- **Standards:** EIP-7702 (delegation), ERC-4337 (UserOperations, Bundlers, Paymasters).
- **Architecture:** The EOA IS the smart account (delegated via 7702). No Safe contract, no address prediction. Uses `toSimpleSmartAccount` with `eip7702: true` from permissionless.js.
- **Provider-Agnostic:** Uses standard ERC-4337 RPCs (`eth_sendUserOperation`, `pm_getPaymasterData`, etc.) via `paymaster: true`. Works with any bundler (Pimlico, Candide, etc.).
- **Gas Payment Modes:** Sponsored (paymaster covers gas) or Paymaster Token (pay gas with ERC-20 token).
- **Testing:** Tests deferred pending bundler infrastructure validation (alto + EntryPoint v0.8 + 7702).
