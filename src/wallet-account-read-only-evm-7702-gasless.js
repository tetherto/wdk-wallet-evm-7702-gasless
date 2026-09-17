// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict'

import { isError, isHexString, JsonRpcProvider } from 'ethers'

import { WalletAccountReadOnly, NoSuchElementError, ValueError } from '@tetherto/wdk-wallet'

import { WalletAccountReadOnlyEvm } from '@tetherto/wdk-wallet-evm'

import {
  AbstractionKitError,
  Bundler,
  ENTRYPOINT_V8,
  ENTRYPOINT_V9,
  Erc7677Paymaster,
  Simple7702Account,
  Simple7702AccountV09,
  sendJsonRpcRequest
} from 'abstractionkit'

import FailoverProvider from '@tetherto/wdk-failover-provider'

import { ConfigurationError } from './errors.js'

/** @typedef {import('ethers').Eip1193Provider} Eip1193Provider */

/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransaction} EvmTransaction */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransferOptions} EvmTransferOptions */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransferResult} TransferResult */

/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransactionReceipt} EvmTransactionReceipt */

/** @typedef {import('@tetherto/wdk-wallet-evm').TypedData} TypedData */

/** @typedef {import('abstractionkit').UserOperationV8} UserOperationV8 */
/** @typedef {import('abstractionkit').UserOperationReceiptResult} UserOperationReceipt */
/** @typedef {import('abstractionkit').TokenQuote} TokenQuote */

/** @typedef {import('@tetherto/wdk-wallet').TransactionReceipt} TransactionReceipt */
/** @typedef {import('@tetherto/wdk-wallet').WaitForTransactionOptions} WaitForTransactionOptions */

/**
 * The EVM 7702 gasless-specific fields added to a normalized transaction receipt.
 *
 * @typedef {Object} Evm7702GaslessTransactionDetails
 * @property {number} confirmations - The number of confirmations (0 while pending or dropped).
 * @property {EvmTransactionReceipt | null} receipt - The native ethers receipt of the bundling transaction, or null while the user operation is pending or dropped.
 * @property {UserOperationReceipt | null} userOperationReceipt - The user operation receipt, or null while the user operation is pending or its receipt is not yet available.
 */

/**
 * @typedef {Object} Eip7702AuthorizationOverride
 * @property {bigint} chainId - The chain id the authorization was signed for.
 * @property {string} address - The delegate contract address (the EOA's new code).
 * @property {bigint} nonce - The EOA's transaction nonce at signing time.
 * @property {string} yParity - The y-parity bit of the signature, encoded as `'0x0'` or `'0x1'`.
 * @property {string} r - The r component of the ECDSA signature (32-byte hex).
 * @property {string} s - The s component of the ECDSA signature (32-byte hex).
 */

/**
 * @typedef {Object} BuildSponsoredUserOperationOverrides
 * @property {Eip7702AuthorizationOverride} [eip7702Auth] - Pre-signed EIP-7702 authorization tuple to include in the user operation.
 * @property {bigint} [nonce] - Explicit EntryPoint nonce for the user operation. When omitted, the account derives it from the on-chain nonce.
 */

/**
 * @typedef {Object} SponsoredUserOperation
 * @property {UserOperationV8} userOperation - The paymaster-populated user operation, ready to sign.
 * @property {TokenQuote} [tokenQuote] - Token-paymaster fee data. Populated on the token-payment flow; absent on sponsored flows.
 */

/**
 * @typedef {Object} UserOperationGasCost
 * @property {bigint} fee - The estimated fee with no tolerance buffer applied. For sponsored flows it's in wei; for token-paymaster flows it's in the paymaster token's base units.
 * @property {UserOperationV8} sponsoredOp - The paymaster-populated user operation built during the quote, reusable for sendTransaction.
 * @property {TokenQuote} [tokenQuote] - Token-paymaster fee data. Populated on the token-payment flow; absent on sponsored flows.
 */

/**
 * @typedef {Object} Evm7702GaslessWalletCommonConfig
 * @property {string | Eip1193Provider | (string | Eip1193Provider)[]} provider - The url of the rpc provider, or an instance of a class that implements eip-1193. It's also possible to provide an array of urls or EIP 1193 providers instead. In such case, connection errors will cause the wallet to automatically fallback on the next provider in the list.
 * @property {number} [chainId] - The chain id the wallet operates on (e.g. 1 for ethereum). When set, every UserOperation build asserts the provider reports this chain and throws `ConfigurationError` on mismatch before anything is built or signed; the underlying read-only account also pins to a static network, skipping per-call chain detection. When omitted, the provider's reported chain is trusted.
 * @property {number} [retries] - If set and if 'provider' is a list of urls or EIP 1193 providers, the number of additional retry attempts after the initial call fails. Total attempts = `1 + retries`. For example, `retries: 3` with 4 providers will try each provider once before throwing. If `retries` exceeds the number of providers, the failover will loop back and retry already-failed providers in round-robin order. Default: 3.
 * @property {string} bundlerUrl - The url of the bundler/paymaster service.
 * @property {string} [paymasterUrl] - The url of the paymaster service when it differs from bundlerUrl. Omit when one url serves both the bundler and paymaster (e.g. Candide, Pimlico).
 * @property {string} delegationAddress - The address of the smart account implementation to delegate to. It must be an implementation built for the configured `entryPointVersion` (e.g. '0xe6Cae83BdE06E4c305530e199D7217f42808555B' for SimpleAccount on EntryPoint v0.8, '0xa46cc63eBF4Bd77888AA327837d20b23A63a56B5' on v0.9).
 * @property {'0.8' | '0.9'} [entryPointVersion] - The ERC-4337 EntryPoint version the account operates under. It selects the EntryPoint address and the matching account implementation together. Default: '0.8'.
 * @property {boolean} [parallel] - When true, each send is placed in a fresh, independent nonce lane (a random 192-bit key at sequence 0) so concurrent or back-to-back sends don't collide on the nonce. Ordering between such sends is not guaranteed and each consumes a new EntryPoint nonce slot. Ignored when `nonceKey` is set. Overridable per call.
 * @property {number | bigint | string} [nonceKey] - Send in an explicit nonce lane. A string is hashed to a deterministic key — a reusable named lane that resumes the same sequence across sessions; a number or bigint is used as the raw uint192 key and must be within the uint192 range (0 to 2^192 - 1), otherwise the send throws (pass a bigint or string for keys above 2^53). Sends sharing a key are ordered sequentially; different keys run in parallel. Overridable per call.
 */

/**
 * @typedef {Object} Evm7702GaslessSponsorshipPolicyConfig
 * @property {true} isSponsored - Whether the paymaster is sponsoring the account.
 * @property {string} [sponsorshipPolicyId] - The sponsorship policy ID (e.g. for Pimlico or Candide).
 */

/**
 * @typedef {Object} Evm7702GaslessPaymasterTokenConfig
 * @property {false} [isSponsored] - Whether the paymaster is sponsoring the account.
 * @property {string} paymasterAddress - The paymaster smart contract address to require from the paymaster RPC.
 * @property {Object} paymasterToken - The paymaster token configuration.
 * @property {string} paymasterToken.address - The address of the paymaster token.
 * @property {number | bigint} [transferMaxFee] - The maximum fee, in the paymaster token's base units, accepted for transfer. Ignored when the transaction is sponsored.
 * @property {number | bigint} [transactionMaxFee] - The maximum fee, in the paymaster token's base units, accepted for sendTransaction, signTransaction and approve. Ignored when the transaction is sponsored.
 */

/**
 * @typedef {Evm7702GaslessWalletCommonConfig &
 *  (Evm7702GaslessSponsorshipPolicyConfig |
 *   Evm7702GaslessPaymasterTokenConfig)} Evm7702GaslessWalletConfig
 */

const GAS_FEE_MULTIPLIER = 150n
const GAS_FEE_DIVISOR = 100n
const EXCHANGE_RATE_PRECISION = 10n ** 18n

/**
 * The supported ERC-4337 EntryPoint versions, keyed by the `entryPointVersion`
 * configuration value. Each entry pairs an `abstractionkit` account implementation
 * with the address of the EntryPoint it was built for.
 */
const ENTRY_POINT_VERSIONS = new Map([
  ['0.8', { account: Simple7702Account, address: ENTRYPOINT_V8 }],
  ['0.9', { account: Simple7702AccountV09, address: ENTRYPOINT_V9 }]
])

/**
 * The EntryPoint version used when the configuration does not select one.
 */
const DEFAULT_ENTRY_POINT_VERSION = '0.8'

/**
 * The default network error and ethers error [codes](https://docs.ethers.org/v6/api/utils/errors/) that denote a connectivity failure.
 */
const CONNECTIVITY_ERROR_CODES = new Set(['ECONNREFUSED', 'NETWORK_ERROR', 'SERVER_ERROR', 'TIMEOUT'])

export default class WalletAccountReadOnlyEvm7702Gasless extends WalletAccountReadOnly {
  /**
   * Creates a new read-only evm 7702 gasless wallet account.
   *
   * @param {string} address - The evm account's address (the EOA address directly).
   * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee' | 'transactionMaxFee'>} config - The configuration object.
   */
  constructor (address, config) {
    super(address)

    this._validateConfig(config)

    /**
     * The read-only evm 7702 gasless wallet account configuration.
     *
     * @protected
     * @type {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee' | 'transactionMaxFee'>}
     */
    this._config = config

    /**
     * An EIP-1193–compatible provider used to interact with the blockchain.
     *
     * Note: the provider type is restricted to EIP-1193 to ensure compatibility
     * with `abstractionkit` and to enable the failover mechanism. While RPC URLs
     * can still be provided in the configuration, they are internally wrapped
     * into an EIP-1193 provider.
     *
     * @protected
     * @type {Eip1193Provider}
     */
    this._provider = this._createFailoverProvider(this._config)

    /**
     * The chain id.
     *
     * @protected
     * @type {bigint | undefined}
     */
    this._chainId = undefined

    /** @private */
    this._smartAccount = undefined

    /** @private */
    this._bundler = undefined

    /** @private */
    this._paymaster = undefined

    /** @private */
    this._evmReadOnlyAccount = undefined
  }

  /**
   * Returns the account's eth balance.
   *
   * @returns {Promise<bigint>} The eth balance (in weis).
   */
  async getBalance () {
    const evmReadOnlyAccount = await this._getEvmReadOnlyAccount()

    return await evmReadOnlyAccount.getBalance()
  }

  /**
   * Returns the account balance for a specific token.
   *
   * @param {string} tokenAddress - The smart contract address of the token.
   * @returns {Promise<bigint>} The token balance (in base unit).
   */
  async getTokenBalance (tokenAddress) {
    const evmReadOnlyAccount = await this._getEvmReadOnlyAccount()

    return await evmReadOnlyAccount.getTokenBalance(tokenAddress)
  }

  /**
   * Returns the account balances for multiple tokens.
   *
   * @param {string[]} tokenAddresses - The smart contract addresses of the tokens.
   * @returns {Promise<Record<string, bigint>>} A mapping of token addresses to their balances (in base units).
   */
  async getTokenBalances (tokenAddresses) {
    const evmReadOnlyAccount = await this._getEvmReadOnlyAccount()

    return await evmReadOnlyAccount.getTokenBalances(tokenAddresses)
  }

  /**
   * Returns the account's balance for the paymaster token provided in the wallet account configuration.
   *
   * @returns {Promise<bigint>} The paymaster token balance (in base unit).
   * @throws {ConfigurationError} If no paymaster token is configured (sponsored mode).
   */
  async getPaymasterTokenBalance () {
    const { paymasterToken } = this._config

    if (!paymasterToken) {
      throw new ConfigurationError('Paymaster token is not configured.')
    }

    return await this.getTokenBalance(paymasterToken.address)
  }

  /**
   * Quotes the costs of a send transaction operation.
   *
   * @param {EvmTransaction | EvmTransaction[]} tx - The transaction, or an array of multiple transactions to send in batch.
   * @param {Partial<Evm7702GaslessSponsorshipPolicyConfig | Evm7702GaslessPaymasterTokenConfig>} [config] - If set, overrides the given configuration options.
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
   */
  async quoteSendTransaction (tx, config) {
    const mergedConfig = { ...this._config, provider: this._provider, ...config }

    if (config) {
      this._validateConfig(mergedConfig)
    }

    const { isSponsored } = mergedConfig

    if (isSponsored) {
      return { fee: 0n }
    }

    const result = await this._getUserOperationGasCost([tx].flat(), mergedConfig)

    return { fee: BigInt(result.fee) }
  }

  /**
   * Quotes the costs of a transfer operation.
   *
   * @param {EvmTransferOptions} options - The transfer's options.
   * @param {Partial<Evm7702GaslessSponsorshipPolicyConfig | Evm7702GaslessPaymasterTokenConfig>} [config] - If set, overrides the given configuration options.
   * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
   */
  async quoteTransfer (options, config) {
    const tx = await WalletAccountReadOnlyEvm._getTransferTransaction(options)

    return await this.quoteSendTransaction(tx, config)
  }

  /**
   * Returns a transaction's receipt.
   *
   * @deprecated Use {@link getTransaction} instead, which returns a normalized, finality-based receipt. The raw ethers receipt and the user operation receipt remain available on its `receipt` and `userOperationReceipt` properties.
   * @param {string} hash - The user operation hash.
   * @returns {Promise<EvmTransactionReceipt | null>} The receipt, or null if the transaction has not been included in a block yet.
   */
  async getTransactionReceipt (hash) {
    const evmReadOnlyAccount = await this._getEvmReadOnlyAccount()

    const userOpReceipt = await this._getBundler().getUserOperationReceipt(hash)

    if (!userOpReceipt || !userOpReceipt.receipt?.transactionHash) {
      return null
    }

    return await evmReadOnlyAccount.getTransactionReceipt(userOpReceipt.receipt.transactionHash)
  }

  /**
   * Returns a normalized, finality-based receipt for a user operation. Finality and confirmations come from the bundling transaction; `success` and `fee` come from the user operation.
   *
   * @param {string} hash - The user operation hash.
   * @returns {Promise<TransactionReceipt & Evm7702GaslessTransactionDetails>} The normalized receipt.
   * @throws {ValueError} If the hash is not a valid user operation hash.
   * @throws {NoSuchElementError} If no user operation has been found for the given hash.
   */
  async getTransaction (hash) {
    if (!isHexString(hash, 32)) {
      throw new ValueError(`Invalid user operation hash: '${hash}'.`)
    }

    const bundler = this._getBundler()

    const userOpByHash = await bundler.getUserOperationByHash(hash)
    if (!userOpByHash) {
      throw new NoSuchElementError(`No user operation found for '${hash}'.`)
    }

    if (!userOpByHash.transactionHash) {
      return {
        hash,
        finality: 'pending',
        confirmations: 0,
        receipt: null,
        userOperationReceipt: null
      }
    }

    const [evmReadOnlyAccount, userOpReceipt] = await Promise.all([
      this._getEvmReadOnlyAccount(),
      bundler.getUserOperationReceipt(hash)
    ])

    const info = await evmReadOnlyAccount.getTransaction(userOpByHash.transactionHash)

    return {
      ...info,
      hash,
      success: userOpReceipt ? userOpReceipt.success : info.success,
      fee: userOpReceipt ? userOpReceipt.actualGasCost : info.fee,
      userOperationReceipt: userOpReceipt
    }
  }

  /**
   * Blocks until a user operation reaches a terminal state (the requested finality target or `dropped`), or times out.
   *
   * @param {string} hash - The user operation hash.
   * @param {WaitForTransactionOptions} [options] - The wait options.
   * @returns {Promise<TransactionReceipt & Evm7702GaslessTransactionDetails>} The terminal receipt: the finality target reached (inspect `success` to tell success from revert), or `dropped`.
   * @throws {TimeoutError} If the target is not reached before the timeout.
   */
  async waitForTransaction (hash, options = {}) {
    return await super.waitForTransaction(hash, options)
  }

  /**
   * Overrides the base default to allow for slower gasless/bundler inclusion and confirmation.
   *
   * @type {number}
   */
  get defaultWaitTimeout () {
    return 180000
  }

  /**
   * Returns a user operation's receipt.
   *
   * @param {string} hash - The user operation hash.
   * @returns {Promise<UserOperationReceipt | null>} The receipt, or null if the user operation has not been included in a block yet.
   */
  async getUserOperationReceipt (hash) {
    return await this._getBundler().getUserOperationReceipt(hash)
  }

  /**
   * Returns the current allowance for the given token and spender.
   *
   * @param {string} token - The token's address.
   * @param {string} spender - The spender's address.
   * @returns {Promise<bigint>} The allowance.
   */
  async getAllowance (token, spender) {
    const readOnlyAccount = await this._getEvmReadOnlyAccount()

    return await readOnlyAccount.getAllowance(token, spender)
  }

  /**
   * Verifies a message's signature.
   *
   * @param {string} message - The original message.
   * @param {string} signature - The signature to verify.
   * @returns {Promise<boolean>} True if the signature is valid.
   */
  async verify (message, signature) {
    const evmReadOnlyAccount = await this._getEvmReadOnlyAccount()
    return await evmReadOnlyAccount.verify(message, signature)
  }

  /**
   * Verifies a typed data signature.
   *
   * @param {TypedData} typedData - The typed data to verify.
   * @param {string} signature - The signature to verify.
   * @returns {Promise<boolean>} True if the signature is valid.
   */
  async verifyTypedData (typedData, signature) {
    const evmReadOnlyAccount = await this._getEvmReadOnlyAccount()

    return await evmReadOnlyAccount.verifyTypedData(typedData, signature)
  }

  /**
   * Wraps a string RPC URL or provider into an EIP-1193 compatible provider.
   *
   * @protected
   * @param {string | Eip1193Provider} provider - The url of the rpc provider, or an instance of a class that implements eip-1193.
   * @returns { Eip1193Provider } A wrapped Eip1193Provider instance.
   */
  _wrapEip1193Provider (provider) {
    return typeof provider === 'string'
      ? {
          provider: new JsonRpcProvider(provider),
          request ({ method, params }) {
            return this.provider.send(method, params ?? [])
          }
        }
      : provider
  }

  /**
   * Creates a FailoverProvider from the configured providers. If only one provider is supplied, it is wrapped and returned.
   *
   * @protected
   * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee' | 'transactionMaxFee'>} [config] - The configuration object.
   * @returns {Eip1193Provider} A wrapped Eip1193Provider instance.
   * @throws {ConfigurationError} If the `provider` option is set to an empty array.
   */
  _createFailoverProvider (config = this._config) {
    const { provider, retries = 3 } = config

    if (Array.isArray(provider)) {
      if (!provider.length) {
        throw new ConfigurationError("The 'provider' option cannot be set to an empty list.")
      }

      const failoverProvider = new FailoverProvider({
        retries,
        shouldRetryOn: (error) => [...CONNECTIVITY_ERROR_CODES].some((code) => isError(error, code))
      })

      for (const entry of provider) {
        const option = this._wrapEip1193Provider(entry)
        failoverProvider.addProvider(option)
      }

      return failoverProvider.initialize()
    }

    return this._wrapEip1193Provider(provider)
  }

  /**
   * Validates the configuration to ensure all required fields are present and that
   * the selected EntryPoint version and delegation implementation are compatible.
   *
   * @protected
   * @param {Partial<Evm7702GaslessWalletConfig>} config - The configuration to validate.
   * @throws {ConfigurationError} If the configuration is invalid or has missing required fields.
   * @throws {ConfigurationError} If `entryPointVersion` is not a supported EntryPoint version.
   * @throws {ConfigurationError} If `delegationAddress` is the reference implementation of an EntryPoint version other than the configured one.
   * @returns {void}
   */
  _validateConfig (config) {
    if (!config.provider) {
      throw new ConfigurationError('Missing required configuration field: provider.')
    }
    if (!config.bundlerUrl) {
      throw new ConfigurationError('Missing required configuration field: bundlerUrl.')
    }
    if (!config.delegationAddress) {
      throw new ConfigurationError('Missing required configuration field: delegationAddress.')
    }
    if (config.entryPointVersion !== undefined && !ENTRY_POINT_VERSIONS.has(config.entryPointVersion)) {
      const supported = [...ENTRY_POINT_VERSIONS.keys()].map(version => `'${version}'`).join(', ')
      throw new ConfigurationError(
        `The 'entryPointVersion' option must be one of ${supported}; received ${config.entryPointVersion}.`
      )
    }

    const entryPointVersion = config.entryPointVersion ?? DEFAULT_ENTRY_POINT_VERSION
    for (const [version, { account }] of ENTRY_POINT_VERSIONS) {
      if (version === entryPointVersion) continue
      if (account.DEFAULT_DELEGATEE_ADDRESS.toLowerCase() !== config.delegationAddress.toLowerCase()) continue

      throw new ConfigurationError(
        `The 'delegationAddress' option (${config.delegationAddress}) is the reference implementation for EntryPoint v${version}, but the 'entryPointVersion' option is '${entryPointVersion}'. An implementation only accepts user operations from the EntryPoint it was built for: set 'entryPointVersion' to '${version}', or point 'delegationAddress' at a v${entryPointVersion} implementation.`
      )
    }
    if (!config.isSponsored && !config.paymasterToken) {
      throw new ConfigurationError('Missing required paymaster token configuration fields: paymasterToken.')
    }
    if (!config.isSponsored && !config.paymasterAddress) {
      throw new ConfigurationError('Missing required paymaster token configuration fields: paymasterAddress.')
    }
  }

  /**
   * Returns the chain id, asserting the provider is on the configured network.
   *
   * The value is read once from the provider (`eth_chainId`), checked against
   * `config.chainId`, and cached. Every UserOperation is built and signed against
   * this value, so a provider reporting a different chain than the one the
   * application configured must fail here rather than produce a signature for the
   * wrong network. The check is skipped when `config.chainId` is omitted.
   *
   * @protected
   * @returns {Promise<bigint>} The chain id.
   * @throws {ConfigurationError} If the provider's chain id does not match `config.chainId`.
   */
  async _getChainId () {
    if (this._chainId === undefined) {
      const chainId = BigInt(await sendJsonRpcRequest(this._provider, 'eth_chainId', []))

      if (this._config.chainId !== undefined && chainId !== BigInt(this._config.chainId)) {
        throw new ConfigurationError(
          `Provider is on chain ${chainId} but the wallet is configured for chain ${this._config.chainId}`
        )
      }

      this._chainId = chainId
    }

    return this._chainId
  }

  /**
   * Returns a cached abstractionkit Bundler client.
   *
   * @protected
   * @returns {Bundler} The cached bundler client, lazily created on first use.
   */
  _getBundler () {
    if (!this._bundler) {
      this._bundler = new Bundler(this._config.bundlerUrl)
    }
    return this._bundler
  }

  /**
   * Builds a paymaster-sponsored user operation for quoting or sending.
   * Does NOT sign. The caller adds the signature (and, for writes, the
   * pre-signed EIP-7702 authorization in `overrides.eip7702Auth`).
   *
   * Keeps AK's gas estimation enabled on `createUserOperation` so that the
   * +55000 verificationGasLimit padding AK applies to its estimate is
   * preserved. The paymaster pipeline re-estimates with its own fields,
   * so this is an extra bundler round-trip we pay for correctness.
   *
   * @protected
   * @param {EvmTransaction[]} txs - The transactions to batch into the user operation.
   * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee' | 'transactionMaxFee'>} config - The merged wallet configuration (base config merged with any per-call overrides).
   * @param {BuildSponsoredUserOperationOverrides} [overrides] - Optional overrides for the build step (currently only the pre-signed 7702 authorization).
   * @returns {Promise<SponsoredUserOperation>} The paymaster-populated user operation plus the token-quote data (when applicable).
   * @throws {Error} If the token paymaster reports AA50 (account does not hold the paymaster token).
   * @throws {ConfigurationError} If the configured `paymasterAddress` does not match the address returned by the paymaster RPC.
   */
  async _buildSponsoredUserOperation (txs, config, overrides = {}) {
    // Fail before any bundler/paymaster round-trip if the provider is on the wrong chain.
    await this._getChainId()

    const smartAccount = await this._getSmartAccount()

    const calls = txs.map(tx => ({
      to: tx.to,
      value: BigInt(tx.value || 0),
      data: tx.data || '0x'
    }))

    const { maxFeePerGas, maxPriorityFeePerGas } = await this._estimateFeesPerGas(config)

    const createOverrides = {
      ...(overrides.eip7702Auth ? { eip7702Auth: overrides.eip7702Auth } : {}),
      ...(overrides.nonce !== undefined ? { nonce: overrides.nonce } : {}),
      maxFeePerGas,
      maxPriorityFeePerGas
    }

    const paymaster = await this._getPaymaster()
    const paymasterContext = this._buildPaymasterContext(config)
    const paymasterUrl = config.paymasterUrl || config.bundlerUrl

    let sponsoredOp, tokenQuote
    try {
      const op = await smartAccount.createUserOperation(
        calls,
        this._provider,
        config.bundlerUrl,
        createOverrides
      )

      ;({ userOperation: sponsoredOp, tokenQuote } = await paymaster.createPaymasterUserOperation(
        smartAccount,
        op,
        config.bundlerUrl,
        paymasterContext
      ))
    } catch (error) {
      if (error instanceof AbstractionKitError &&
          (error.message.includes('AA50') || error.cause?.message?.includes('AA50'))) {
        throw new Error('Simulation failed: not enough funds in the account to repay the paymaster.')
      }
      throw error
    }

    if (!config.isSponsored && sponsoredOp.paymaster &&
        sponsoredOp.paymaster.toLowerCase() !== config.paymasterAddress.toLowerCase()) {
      throw new ConfigurationError(
        `paymasterAddress mismatch: configured ${config.paymasterAddress} but RPC ${paymasterUrl} returned ${sponsoredOp.paymaster}.`
      )
    }

    return { userOperation: sponsoredOp, tokenQuote }
  }

  /**
   * Returns the EntryPoint version the account operates under, as selected by the
   * `entryPointVersion` configuration field. Every other EntryPoint-dependent
   * operation of the account resolves through it.
   *
   * @protected
   * @returns {Promise<'0.8' | '0.9'>} The selected EntryPoint version.
   */
  async _getEntryPointVersion () {
    return this._config.entryPointVersion ?? DEFAULT_ENTRY_POINT_VERSION
  }

  /**
   * Returns the address of the EntryPoint the account operates under.
   *
   * @protected
   * @returns {Promise<string>} The address of the EntryPoint user operations are submitted to and nonces are read from.
   */
  async _getEntryPointAddress () {
    const { address } = await this._getEntryPoint()

    return address
  }

  /**
   * Builds the EIP-712 payload that authorizes a user operation under the
   * EntryPoint version the account operates under.
   *
   * @protected
   * @param {UserOperationV8} userOp - The user operation to authorize.
   * @param {bigint} chainId - The id of the chain the user operation is signed for.
   * @returns {Promise<TypedData>} The typed data to sign.
   */
  async _getUserOperationTypedData (userOp, chainId) {
    const { account: Account, address: entrypointAddress } = await this._getEntryPoint()

    return Account.getUserOperationEip712Data(userOp, chainId, { entrypointAddress })
  }

  /** @private */
  async _getEntryPoint () {
    return ENTRY_POINT_VERSIONS.get(await this._getEntryPointVersion())
  }

  /** @private */
  async _getSmartAccount () {
    if (!this._smartAccount) {
      const { account: Account, address } = await this._getEntryPoint()

      this._smartAccount = new Account(this._address, {
        entrypointAddress: address,
        delegateeAddress: this._config.delegationAddress
      })
    }
    return this._smartAccount
  }

  /** @private */
  async _getPaymaster () {
    if (!this._paymaster) {
      const chainId = await this._getChainId()
      const url = this._config.paymasterUrl || this._config.bundlerUrl
      this._paymaster = new Erc7677Paymaster(url, { chainId })
    }
    return this._paymaster
  }

  /** @private */
  async _getEvmReadOnlyAccount () {
    if (!this._evmReadOnlyAccount) {
      const address = await this.getAddress()
      this._evmReadOnlyAccount = new WalletAccountReadOnlyEvm(address, this._config)
    }
    return this._evmReadOnlyAccount
  }

  /** @private */
  _buildPaymasterContext (config) {
    if (config.isSponsored) {
      return config.sponsorshipPolicyId
        ? { sponsorshipPolicyId: config.sponsorshipPolicyId }
        : {}
    }

    if (config.paymasterToken) {
      return { token: config.paymasterToken.address }
    }

    return {}
  }

  /** @private */
  async _estimateFeesPerGas (config) {
    if (config.bundlerUrl.includes('pimlico')) {
      const { fast } = await sendJsonRpcRequest(config.bundlerUrl, 'pimlico_getUserOperationGasPrice', [])

      return {
        maxFeePerGas: BigInt(fast.maxFeePerGas),
        maxPriorityFeePerGas: BigInt(fast.maxPriorityFeePerGas)
      }
    }

    let methodUnsupported = false
    const [gasPrice, tip] = await Promise.all([
      sendJsonRpcRequest(this._provider, 'eth_gasPrice', []),
      sendJsonRpcRequest(this._provider, 'eth_maxPriorityFeePerGas', []).catch(error => {
        if (error?.cause?.code === -32601 || /method not found|not supported/i.test(error?.message ?? '')) {
          methodUnsupported = true
          return '0x0'
        }
        throw error
      })
    ])

    const maxFeePerGas = BigInt(gasPrice)
    const maxPriorityFeePerGas = methodUnsupported ? maxFeePerGas : BigInt(tip)

    return {
      maxFeePerGas: maxFeePerGas * GAS_FEE_MULTIPLIER / GAS_FEE_DIVISOR,
      maxPriorityFeePerGas: maxPriorityFeePerGas * GAS_FEE_MULTIPLIER / GAS_FEE_DIVISOR
    }
  }

  /** @private */
  async _getTokenExchangeRate (config) {
    const tokenAddress = config.paymasterToken.address
    const paymasterUrl = config.paymasterUrl || config.bundlerUrl
    const { address: entrypointAddress } = await this._getEntryPoint()

    if (paymasterUrl.includes('pimlico')) {
      const chainId = await this._getChainId()
      const chainIdHex = '0x' + chainId.toString(16)

      const res = await sendJsonRpcRequest(paymasterUrl, 'pimlico_getTokenQuotes', [
        { tokens: [tokenAddress] },
        entrypointAddress,
        chainIdHex
      ])

      return BigInt(res.quotes[0].exchangeRate)
    }

    // Candide (and generic ERC-7677 providers that mirror Candide's shape).
    const res = await sendJsonRpcRequest(paymasterUrl, 'pm_supportedERC20Tokens', [entrypointAddress])

    const token = res.tokens.find(
      t => t.address.toLowerCase() === tokenAddress.toLowerCase()
    )

    if (!token) {
      throw new Error(`Token ${tokenAddress} is not supported by the paymaster.`)
    }

    return BigInt(token.exchangeRate)
  }

  /**
   * Builds the user operation and returns the gas cost in the paymaster
   * token's base units. Reached only on the token-paymaster path —
   * sponsored flows short-circuit to a zero fee in `quoteSendTransaction`
   * before calling this method.
   *
   * @protected
   * @param {EvmTransaction[]} txs - The transactions to batch into the user operation.
   * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee' | 'transactionMaxFee'>} config - The merged wallet configuration.
   * @param {BuildSponsoredUserOperationOverrides} [overrides] - Optional build overrides forwarded to `_buildSponsoredUserOperation` (e.g. an explicit EntryPoint nonce).
   * @returns {Promise<UserOperationGasCost>} The fee plus the built user operation and the token-quote data, cacheable between quote and send.
   */
  async _getUserOperationGasCost (txs, config, overrides) {
    const { userOperation: sponsoredOp, tokenQuote } = await this._buildSponsoredUserOperation(txs, config, overrides)

    let fee
    if (tokenQuote?.tokenCost != null) {
      fee = tokenQuote.tokenCost
    } else {
      const totalGas =
        sponsoredOp.callGasLimit +
        sponsoredOp.verificationGasLimit +
        sponsoredOp.preVerificationGas +
        (sponsoredOp.paymasterVerificationGasLimit || 0n) +
        (sponsoredOp.paymasterPostOpGasLimit || 0n)

      const gasCostInWei = totalGas * sponsoredOp.maxFeePerGas

      const exchangeRate = tokenQuote?.exchangeRate ?? await this._getTokenExchangeRate(config)

      fee = (gasCostInWei * exchangeRate + (EXCHANGE_RATE_PRECISION - 1n)) / EXCHANGE_RATE_PRECISION
    }

    return { fee, sponsoredOp, tokenQuote }
  }
}
