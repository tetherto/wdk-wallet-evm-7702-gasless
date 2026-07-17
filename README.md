# @tetherto/wdk-wallet-evm-7702-gasless

**Note**: This package is currently in beta. Please test thoroughly in development environments before using in production.

A simple and secure package to manage gasless EIP-7702 wallets for EVM-compatible blockchains. This package abstracts all EIP-7702 delegation and ERC-4337 UserOperation complexity behind a simple API — call `transfer()` and delegation, UserOp signing, paymaster sponsorship, and token approvals all happen internally.

## About WDK

This module is part of the [**WDK (Wallet Development Kit)**](https://wallet.tether.io/) project, which empowers developers to build secure, non-custodial wallets with unified blockchain access, stateless architecture, and complete user control.

For detailed documentation about the complete WDK ecosystem, visit [docs.wallet.tether.io](https://docs.wallet.tether.io).

## Features

- **EIP-7702 Delegation**: EOA becomes a smart account via delegation — no Safe contract, no address prediction
- **Gasless Transactions**: Full paymaster integration for sponsored or ERC-20 token gas payment
- **Auto Approval**: Paymaster token allowance is managed automatically, including USDT mainnet reset handling
- **Provider-Agnostic**: Works with any ERC-4337 bundler/paymaster (Pimlico, Candide, etc.)
- **Failover Providers**: Pass an array of provider URLs or EIP-1193 instances to enable automatic round-robin failover
- **Bare Runtime**: Supports both Node.js and [Bare](https://github.com/nicolo-ribaudo/bare) runtime
- **EVM Derivation Paths**: Support for BIP-44 standard derivation paths for Ethereum (m/44'/60')
- **Multi-Account Management**: Create and manage multiple wallets from a single seed phrase
- **ERC20 Support**: Query native token and ERC20 token balances, transfers, and approvals
- **Automatic Delegation Lifecycle**: Delegation is checked and signed automatically per operation

## Installation

```bash
npm install @tetherto/wdk-wallet-evm-7702-gasless
```

## Quick Start

### Creating a Wallet (Sponsored Mode)

```javascript
import WalletManagerEvm7702Gasless from '@tetherto/wdk-wallet-evm-7702-gasless'

const wallet = new WalletManagerEvm7702Gasless(seedPhrase, {
  provider: 'https://rpc.mevblocker.io/fast',
  delegationAddress: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
  bundlerUrl: 'https://api.pimlico.io/v2/1/rpc?apikey=YOUR_KEY',
  isSponsored: true,
  sponsorshipPolicyId: 'sp_my_policy'
})

const account = await wallet.getAccount(0)
const address = await account.getAddress() // Returns the EOA address directly
```

### Creating a Wallet (Paymaster Token Mode)

```javascript
const wallet = new WalletManagerEvm7702Gasless(seedPhrase, {
  provider: 'https://rpc.mevblocker.io/fast',
  delegationAddress: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
  bundlerUrl: 'https://api.pimlico.io/v2/1/rpc?apikey=YOUR_KEY',
  paymasterAddress: '0x888888888888Ec68A58AB8094Cc1AD20Ba3D2402',
  paymasterToken: { address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' }, // USDT
  transferMaxFee: 100000000000000n
})
```

### Using Candide

Candide serves the bundler and paymaster from a single unified URL, so you only need `bundlerUrl` — the paymaster is reached at the same endpoint. The chain is selected by its chain ID in the path. Use the public endpoint (rate-limited, no key required) or an authenticated endpoint with an API key from the [dashboard](https://dashboard.candide.dev):

- Public: `https://api.candide.dev/public/v3/{chainId}`
- Authenticated: `https://api.candide.dev/api/v3/{chainId}/{apiKey}`

```javascript
const wallet = new WalletManagerEvm7702Gasless(seedPhrase, {
  provider: 'https://rpc.mevblocker.io/fast',
  delegationAddress: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
  bundlerUrl: 'https://api.candide.dev/api/v3/1/YOUR_API_KEY',
  isSponsored: true,
  sponsorshipPolicyId: 'your_policy_id'
})
```

### Wrapping an Existing WalletAccountEvm

```javascript
import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm'
import { WalletAccountEvm7702Gasless } from '@tetherto/wdk-wallet-evm-7702-gasless'

const evmAccount = new WalletAccountEvm(seed, "0'/0/0", { provider: '...' })

const gaslessAccount = new WalletAccountEvm7702Gasless(evmAccount, {
  provider: '...',
  delegationAddress: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
  bundlerUrl: '...',
  isSponsored: true
})
```

### Managing Multiple Accounts

```javascript
const account0 = await wallet.getAccount(0)
const account1 = await wallet.getAccount(1)

// Or by custom derivation path (full path: m/44'/60'/0'/0/5)
const customAccount = await wallet.getAccountByPath("0'/0/5")
```

### Checking Balances

```javascript
// Native token balance (in wei)
const balance = await account.getBalance()

// ERC20 token balance
const tokenBalance = await account.getTokenBalance('0xdAC17F958D2ee523a2206206994597C13D831ec7')

// Multiple token balances
const balances = await account.getTokenBalances([token1, token2])
```

### Token Transfers

```javascript
// Transfer ERC20 tokens — delegation + UserOp + paymaster handled internally
const result = await account.transfer({
  token: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
  recipient: '0x742C4265F5Ba4F8E0842e2b9EfE66302F7a13B6F',
  amount: 1000000n // 1 USDT (6 decimals)
})
console.log('UserOperation hash:', result.hash)
console.log('Fee:', result.fee)

// Quote transfer fee before sending
const quote = await account.quoteTransfer({
  token: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  recipient: '0x742C4265F5Ba4F8E0842e2b9EfE66302F7a13B6F',
  amount: 1000000n
})
console.log('Estimated fee:', quote.fee)
```

### Sending Transactions

```javascript
// Send a raw transaction via UserOperation
const result = await account.sendTransaction({
  to: '0x742C4265F5Ba4F8E0842e2b9EfE66302F7a13B6F',
  value: 1n, // 1 wei
  data: '0x'
})

// Batch transactions
const batchResult = await account.sendTransaction([
  { to: '0x...', value: 0n, data: '0x...' },
  { to: '0x...', value: 0n, data: '0x...' }
])

// Quote fee
const quote = await account.quoteSendTransaction({
  to: '0x742C4265F5Ba4F8E0842e2b9EfE66302F7a13B6F',
  value: 0n,
  data: '0x'
})
```

### Concurrent / Parallel Sends (nonce lanes)

By default every send uses the account's key-0 nonce, so it is sequential — a second send fired before the first is mined would collide on the nonce. To send independent operations concurrently, put each in its own **nonce lane** (an ERC-4337 two-dimensional nonce: a 192-bit `key` with its own sequence). Ops in different keys have no ordering constraint and validate independently, so they can be submitted at the same time.

```javascript
// parallel: true → each send gets a fresh random lane (sequence 0). Fire them together:
const [a, b] = await Promise.all([
  account.sendTransaction({ to: '0x...', value: 0n, data: '0x' }, { parallel: true }),
  account.sendTransaction({ to: '0x...', value: 0n, data: '0x' }, { parallel: true })
])

// nonceKey: a string is a reusable named lane (same label resumes the same lane across sessions);
// a bigint is used as the raw uint192 key. Same key = ordered; different keys = parallel.
await account.sendTransaction(tx, { nonceKey: 'payments' })
await account.sendTransaction(tx, { nonceKey: 1n })
```

Both options can also be set at construction (`new WalletManagerEvm7702Gasless(seed, { ..., parallel: true })`) and overridden per call. Precedence: `nonceKey` > `parallel` > default (key 0).

**Notes:**
- **Requires a bundler that accepts parallel keys** (Pimlico and Candide both do). There is no SDK-side lane limit; respect your bundler's cap (e.g. Pimlico allows up to 100 parallel).
- **Per-sender mempool cap (≈4).** Per [ERC-7562](https://eips.ethereum.org/EIPS/eip-7562), a standard bundler mempool holds at most **4** in-flight UserOperations from a single sender at once (`SAME_SENDER_MEMPOOL_COUNT = 4`). Firing more than 4 lanes concurrently may be rejected until earlier ops are mined. This is a mempool validation limit, separate from parallel-key support, and can be raised by the bundler operator if needed.
- **Delegate first.** The first UserOperation from a fresh account carries the EIP-7702 delegation authorization, which is tied to the account's EOA nonce. Let one send land (delegating the account) before firing concurrent lanes, so parallel sends don't race on the initial delegation.
- `parallel: true` mints a **new** EntryPoint nonce slot per send (a one-time gas cost per lane, paid by the paymaster; permanent state). For repeated parallel workloads, reuse a fixed set of lanes with `nonceKey` labels instead of a fresh key every time.
- A single lane is still **sequential**: two concurrent sends sharing the same `nonceKey` will collide. Concurrency comes from using **different** keys — for dependent, ordered operations, batch them into one UserOperation instead.

### Token Approvals

```javascript
await account.approve({
  token: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  spender: '0x742C4265F5Ba4F8E0842e2b9EfE66302F7a13B6F',
  amount: 1000000n
})
```

### Transaction Receipts

```javascript
// Get full transaction receipt from a UserOp hash
const receipt = await account.getTransactionReceipt(userOpHash)

// Get the raw UserOperation receipt
const userOpReceipt = await account.getUserOperationReceipt(userOpHash)
```

### Message Signing and Verification

```javascript
// Sign a message
const signature = await account.sign('Hello, EIP-7702!')

// Verify a signature
const isValid = await account.verify('Hello, EIP-7702!', signature)

// Sign typed data (EIP-712)
const typedSig = await account.signTypedData({
  domain: { name: 'MyDApp', version: '1', chainId: 1, verifyingContract: '0x...' },
  types: { Transfer: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }] },
  message: { to: '0x...', amount: '1000000' }
})
```

### Fee Management

```javascript
const feeRates = await wallet.getFeeRates()
console.log('Normal fee rate:', feeRates.normal, 'wei')
console.log('Fast fee rate:', feeRates.fast, 'wei')
```

### Memory Management

```javascript
account.dispose() // Clear private keys from memory
wallet.dispose()  // Dispose all accounts
```

## Configuration Reference

### Common Fields (always required)

| Field | Type | Description |
|-------|------|-------------|
| `provider` | `string \| Eip1193Provider \| (string \| Eip1193Provider)[]` | RPC endpoint URL, EIP-1193 provider instance, or failover list mixing both formats |
| `bundlerUrl` | `string` | URL of the ERC-4337 bundler service |
| `delegationAddress` | `string` | Address of the smart account implementation to delegate to |

### Optional Common Fields

| Field | Type | Description |
|-------|------|-------------|
| `paymasterUrl` | `string` | URL of the paymaster service, when it differs from `bundlerUrl`. Omit when one URL serves both the bundler and paymaster (e.g. Candide, Pimlico) |
| `retries` | `number` | Additional retry attempts for provider failover arrays. Total attempts are `1 + retries`. Defaults to `3` |

### Sponsored Mode

| Field | Type | Description |
|-------|------|-------------|
| `isSponsored` | `true` | Enables sponsorship |
| `sponsorshipPolicyId` | `string` (optional) | Sponsorship policy ID for the paymaster provider |

### Paymaster Token Mode

| Field | Type | Description |
|-------|------|-------------|
| `paymasterAddress` | `string` (optional) | Pin on the paymaster smart contract address. When omitted, it is derived from the paymaster RPC (`pm_supportedERC20Tokens` for Candide, `pimlico_getTokenQuotes` for Pimlico) |
| `paymasterToken` | `{ address: string }` | ERC-20 token used for gas payment |
| `transferMaxFee` | `number \| bigint` (optional) | Maximum fee for transfer operations |

## API Reference

### WalletManagerEvm7702Gasless

The main class for managing EIP-7702 gasless wallets. Extends `WalletManager` from `@tetherto/wdk-wallet`.

| Method | Description | Returns |
|--------|-------------|---------|
| `getAccount(index)` | Returns a wallet account at the specified index | `Promise<WalletAccountEvm7702Gasless>` |
| `getAccountByPath(path)` | Returns a wallet account at the specified BIP-44 derivation path | `Promise<WalletAccountEvm7702Gasless>` |
| `getFeeRates()` | Returns current fee rates | `Promise<{normal: bigint, fast: bigint}>` |
| `dispose()` | Disposes all wallet accounts, clearing private keys from memory | `void` |

### WalletAccountEvm7702Gasless

Individual gasless wallet account. Extends `WalletAccountReadOnlyEvm7702Gasless`, implements `IWalletAccount`.

**Constructor overloads:**
- `new WalletAccountEvm7702Gasless(seed, path, config)` — standard BIP-44 derivation
- `new WalletAccountEvm7702Gasless(walletAccountEvm, config)` — wrap an existing `WalletAccountEvm`

| Method | Description | Returns |
|--------|-------------|---------|
| `getAddress()` | Returns the EOA address | `Promise<string>` |
| `sign(message)` | Signs a message | `Promise<string>` |
| `signTypedData(typedData)` | Signs typed data (EIP-712) | `Promise<string>` |
| `verify(message, signature)` | Verifies a message signature | `Promise<boolean>` |
| `verifyTypedData(typedData, signature)` | Verifies a typed data signature | `Promise<boolean>` |
| `sendTransaction(tx, config?)` | Sends a transaction via UserOperation | `Promise<{hash, fee}>` |
| `quoteSendTransaction(tx, config?)` | Estimates the fee for a UserOperation | `Promise<{fee}>` |
| `transfer(options, config?)` | Transfers ERC20 tokens via UserOperation | `Promise<{hash, fee}>` |
| `quoteTransfer(options, config?)` | Estimates the fee for an ERC20 transfer | `Promise<{fee}>` |
| `approve(options)` | Approves a spender for a token amount | `Promise<{hash, fee}>` |
| `getBalance()` | Returns the native token balance (in wei) | `Promise<bigint>` |
| `getTokenBalance(tokenAddress)` | Returns the balance of a specific ERC20 token | `Promise<bigint>` |
| `getTokenBalances(tokenAddresses)` | Returns balances for multiple ERC20 tokens | `Promise<Record<string, bigint>>` |
| `getAllowance(token, spender)` | Returns the current allowance | `Promise<bigint>` |
| `getTransactionReceipt(hash)` | Returns a transaction receipt from a UserOp hash | `Promise<EvmTransactionReceipt \| null>` |
| `getUserOperationReceipt(hash)` | Returns a UserOperation receipt | `Promise<UserOperationReceipt \| null>` |
| `toReadOnlyAccount()` | Returns a read-only copy of the account | `Promise<WalletAccountReadOnlyEvm7702Gasless>` |
| `dispose()` | Disposes the wallet account | `void` |

| Property | Type | Description |
|----------|------|-------------|
| `index` | `number` | The derivation path's index |
| `path` | `string` | The full derivation path |
| `keyPair` | `KeyPair` | The account's key pair |

### WalletAccountReadOnlyEvm7702Gasless

Read-only EIP-7702 gasless wallet account. Can query balances and estimate fees but cannot sign or send transactions.

| Method | Description | Returns |
|--------|-------------|---------|
| `getAddress()` | Returns the EOA address | `Promise<string>` |
| `getBalance()` | Returns the native token balance (in wei) | `Promise<bigint>` |
| `getTokenBalance(tokenAddress)` | Returns the balance of a specific ERC20 token | `Promise<bigint>` |
| `getTokenBalances(tokenAddresses)` | Returns balances for multiple ERC20 tokens | `Promise<Record<string, bigint>>` |
| `getPaymasterTokenBalance()` | Returns the paymaster token balance | `Promise<bigint>` |
| `quoteSendTransaction(tx, config?)` | Estimates the fee for a UserOperation | `Promise<{fee}>` |
| `quoteTransfer(options, config?)` | Estimates the fee for an ERC20 transfer | `Promise<{fee}>` |
| `getAllowance(token, spender)` | Returns the current allowance | `Promise<bigint>` |
| `getTransactionReceipt(hash)` | Returns a transaction receipt from a UserOp hash | `Promise<EvmTransactionReceipt \| null>` |
| `getUserOperationReceipt(hash)` | Returns a UserOperation receipt | `Promise<UserOperationReceipt \| null>` |
| `verify(message, signature)` | Verifies a message signature | `Promise<boolean>` |
| `verifyTypedData(typedData, signature)` | Verifies a typed data signature | `Promise<boolean>` |

## Key Differences from ERC-4337 Module

| Aspect | ERC-4337 (`wdk-wallet-evm-erc-4337`) | ERC-7702 Gasless (this module) |
|--------|---------------------------------------|-------------------------------|
| Smart Account | Safe contract (predicted address) | EOA delegated via EIP-7702 |
| `getAddress()` | Returns Safe contract address | Returns EOA address directly |
| Underlying Library | `@tetherto/wdk-safe-relay-kit` | `abstractionkit` |
| Address Prediction | `predictSafeAddress()` required | No prediction needed |
| Gas Payment | Native coins, paymaster token, sponsored | Sponsored or paymaster token |
| Token Approval | Manual `amountToApprove` | Automatic (including USDT reset) |
| Chain Requirement | Any EVM with ERC-4337 | Requires Pectra-activated chains (EIP-7702) |

## Supported Networks

This package works with EVM-compatible blockchains that support both EIP-7702 (Pectra upgrade) and ERC-4337:

- **Ethereum Mainnet** (post-Pectra)
- **Ethereum Sepolia** (testnet)
- Other Pectra-activated EVM chains

## Bundler/Paymaster Compatibility

This module uses standard ERC-4337 bundler RPCs (`eth_sendUserOperation`, `eth_estimateUserOperationGas`) and ERC-7677 paymaster RPCs (`pm_getPaymasterStubData`, `pm_getPaymasterData`). Not all providers support generic EIP-7702 SimpleAccount delegation — many lock you to their own smart account implementation.

### Tested Providers

| Provider | Sponsored | Paymaster Token | Status |
|----------|-----------|-----------------|--------|
| **Pimlico** | Yes | Yes | Fully working — all flows tested on mainnet and Sepolia |
| **Candide** | Yes | Yes | Working with known limitations (see below) |

### Not Compatible

| Provider | Reason |
|----------|--------|
| **Alchemy** | Locked to Modular Account v2 — rejects all other delegation addresses |
| **ZeroDev** | Locked to Kernel smart account — requires `createKernelAccount`, not standard `toSimpleSmartAccount` |
| **Gelato** | Proprietary Smart Wallet SDK — no standard bundler RPCs exposed |

### Known Candide Limitations

Candide's Voltaire bundler has known gas estimation issues affecting EIP-7702 accounts. These are bundler-side bugs, not module issues — the same operations work correctly on Pimlico.

**1. `callGasLimit` underestimation for USDT on Ethereum mainnet**

The bundler returns ~27k `callGasLimit` for USDT transfers, but USDT's non-standard implementation needs ~40k+. The UserOp inner call reverts with empty reason data (out of gas). Standard ERC-20 tokens (USDC, DAI) are not affected.

**2. `verificationGasLimit` underestimation for ERC-20 paymaster**

The bundler's gas estimate doesn't meet its own validation margin. Error: "verificationGas should have extra 2000 gas, has only -15791". Observed on Sepolia with the ERC-20 token paymaster flow.

**Related Candide GitHub issues:**
- [abstractionkit #57](https://github.com/candidelabs/abstractionkit/issues/57): Gas estimation ran before approval was prepended, producing wrong estimates
- [abstractionkit #78](https://github.com/candidelabs/abstractionkit/issues/78) (open): Simple7702Account ignoring paymaster fields in overrides
- [voltaire #33](https://github.com/candidelabs/voltaire/issues/33): Gas estimation failed for IAccountExecute accounts on EntryPoint v0.8

**Recommendation:** Use Pimlico for production deployments until Candide resolves these estimation issues. If using Candide, the paymaster-token flow on Ethereum mainnet works reliably; the sponsored flow works for ETH transfers and standard ERC-20 tokens but may fail for USDT.

## Security Considerations

- **Seed Phrase Security**: Always store your seed phrase securely and never share it
- **Private Key Management**: The package handles private keys internally via memory-safe buffers (`Uint8Array`) that are zeroed on `dispose()`
- **Memory Cleanup**: Use the `dispose()` method to clear private keys from memory when done
- **Fee Limits**: Set `transferMaxFee` to prevent excessive transaction fees
- **Delegation Awareness**: The EOA delegates execution to a smart account implementation — verify the `delegationAddress` is trusted and audited
- **Bundler Security**: Use trusted bundler services and validate UserOperation responses
- **Contract Interactions**: Verify contract addresses and token decimals before transfers

## Development

```bash
# Install dependencies
npm install

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Build TypeScript definitions
npm run build:types
```

## License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For support, please open an issue on the GitHub repository.
