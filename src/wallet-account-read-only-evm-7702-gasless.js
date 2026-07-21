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

import { isError, JsonRpcProvider } from 'ethers'

import { WalletAccountReadOnly } from '@tetherto/wdk-wallet'

import { WalletAccountReadOnlyEvm } from '@tetherto/wdk-wallet-evm'

import {
  AbstractionKitError,
  Bundler,
  ENTRYPOINT_V8,
  Erc7677Paymaster,
  Simple7702Account,
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
 * @property {bigint} [nonce] - Explicit EntryPoint nonce for the user operation. When omitted, abstractionkit derives it from the on-chain nonce.
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
 * @property {number} [retries] - If set and if 'provider' is a list of urls or EIP 1193 providers, the number of additional retry attempts after the initial call fails. Total attempts = `1 + retries`. For example, `retries: 3` with 4 providers will try each provider once before throwing. If `retries` exceeds the number of providers, the failover will loop back and retry already-failed providers in round-robin order. Default: 3.
 * @property {string} bundlerUrl - The url of the bundler/paymaster service.
 * @property {string} [paymasterUrl] - The url of the paymaster service when it differs from bundlerUrl. Omit when one url serves both the bundler and paymaster (e.g. Candide, Pimlico).
 * @property {string} delegationAddress - The address of the smart account implementation to delegate to (e.g. '0xe6Cae83BdE06E4c305530e199D7217f42808555B' for SimpleAccount).
 * @property {boolean} [parallel] - When true, each send is placed in a fresh, independent nonce lane (a random 192-bit key at sequence 0) so concurrent or back-to-back sends don't collide on the nonce. Ordering between such sends is not guaranteed and each consumes a new EntryPoint nonce slot. Ignored when `nonceKey` is set. Overridable per call.
 * @property {bigint | string} [nonceKey] - Send in an explicit nonce lane. A string is hashed to a deterministic key — a reusable named lane that resumes the same sequence across sessions; a bigint is used as the raw uint192 key and must be within the uint192 range (0 to 2^192 - 1), otherwise the send throws. Sends sharing a key are ordered sequentially; different keys run in parallel. Overridable per call.
 */

/**
 * @typedef {Object} Evm7702GaslessSponsorshipPolicyConfig
 * @property {true} isSponsored - Whether the paymaster is sponsoring the account.
 * @property {string} [sponsorshipPolicyId] - The sponsorship policy ID (e.g. for Pimlico or Candide).
 */

/**
 * @typedef {Object} Evm7702GaslessPaymasterTokenConfig
 * @property {false} [isSponsored] - Whether the paymaster is sponsoring the account.
 * @property {string} [paymasterAddress] - Optional pin on the paymaster smart contract address. When omitted, it's derived from the paymaster RPC (pm_supportedERC20Tokens for Candide, pimlico_getTokenQuotes for Pimlico).
 * @property {Object} paymasterToken - The paymaster token configuration.
 * @property {string} paymasterToken.address - The address of the paymaster token.
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfer operations.
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
 * The default network error and ethers error [codes](https://docs.ethers.org/v6/api/utils/errors/) that denote a connectivity failure.
 */
const CONNECTIVITY_ERROR_CODES = new Set(['ECONNREFUSED', 'NETWORK_ERROR', 'SERVER_ERROR', 'TIMEOUT'])

export default class WalletAccountReadOnlyEvm7702Gasless extends WalletAccountReadOnly {
  /**
   * Creates a new read-only evm 7702 gasless wallet account.
   *
   * @param {string} address - The evm account's address (the EOA address directly).
   * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>} config - The configuration object.
   */
  constructor (address, config) {
    super(address)

    this._validateConfig(config)

    /**
     * The read-only evm 7702 gasless wallet account configuration.
     *
     * @protected
     * @type {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>}
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
   * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>} [config] - The configuration object.
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
   * Validates the configuration to ensure all required fields are present.
   *
   * @protected
   * @param {Partial<Evm7702GaslessWalletConfig>} config - The configuration to validate.
   * @throws {ConfigurationError} If the configuration is invalid or has missing required fields.
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
    if (!config.isSponsored && !config.paymasterToken) {
      throw new ConfigurationError('Missing required paymaster token configuration fields: paymasterToken.')
    }
  }

  /**
   * Returns the chain id.
   *
   * @protected
   * @returns {Promise<bigint>} The chain id.
   */
  async _getChainId () {
    if (this._chainId === undefined) {
      const evmReadOnlyAccount = await this._getEvmReadOnlyAccount()
      const { chainId } = await evmReadOnlyAccount._provider.getNetwork()
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
   * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>} config - The merged wallet configuration (base config merged with any per-call overrides).
   * @param {BuildSponsoredUserOperationOverrides} [overrides] - Optional overrides for the build step (currently only the pre-signed 7702 authorization).
   * @returns {Promise<SponsoredUserOperation>} The paymaster-populated user operation plus the token-quote data (when applicable).
   * @throws {Error} If the token paymaster reports AA50 (account does not hold the paymaster token).
   * @throws {ConfigurationError} If the configured `paymasterAddress` does not match the address returned by the paymaster RPC.
   */
  async _buildSponsoredUserOperation (txs, config, overrides = {}) {
    const smartAccount = this._getSmartAccount()

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

    if (!config.isSponsored && config.paymasterAddress && sponsoredOp.paymaster &&
        sponsoredOp.paymaster.toLowerCase() !== config.paymasterAddress.toLowerCase()) {
      throw new ConfigurationError(
        `paymasterAddress mismatch: configured ${config.paymasterAddress} but RPC ${paymasterUrl} returned ${sponsoredOp.paymaster}.`
      )
    }

    return { userOperation: sponsoredOp, tokenQuote }
  }

  /** @private */
  _getSmartAccount () {
    if (!this._smartAccount) {
      this._smartAccount = new Simple7702Account(this._address, {
        entrypointAddress: ENTRYPOINT_V8,
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

    if (paymasterUrl.includes('pimlico')) {
      const chainId = await this._getChainId()
      const chainIdHex = '0x' + chainId.toString(16)

      const res = await sendJsonRpcRequest(paymasterUrl, 'pimlico_getTokenQuotes', [
        { tokens: [tokenAddress] },
        ENTRYPOINT_V8,
        chainIdHex
      ])

      return BigInt(res.quotes[0].exchangeRate)
    }

    // Candide (and generic ERC-7677 providers that mirror Candide's shape).
    const res = await sendJsonRpcRequest(paymasterUrl, 'pm_supportedERC20Tokens', [ENTRYPOINT_V8])

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
   * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>} config - The merged wallet configuration.
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
