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

import { WalletAccountReadOnly } from '@tetherto/wdk-wallet'

import { WalletAccountReadOnlyEvm } from '@tetherto/wdk-wallet-evm'

import {
  Bundler,
  ENTRYPOINT_V8,
  Erc7677Paymaster,
  Simple7702Account,
  sendJsonRpcRequest
} from 'abstractionkit'

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

/**
 * @typedef {Object} Evm7702GaslessWalletCommonConfig
 * @property {string | Eip1193Provider} provider - The url of the rpc provider, or an instance of a class that implements eip-1193.
 * @property {string} bundlerUrl - The url of the bundler/paymaster service.
 * @property {string} [paymasterUrl] - The url of the paymaster service if different from bundlerUrl (e.g. for Candide which uses separate endpoints).
 * @property {string} delegationAddress - The address of the smart account implementation to delegate to (e.g. '0xe6Cae83BdE06E4c305530e199D7217f42808555B' for SimpleAccount).
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

export default class WalletAccountReadOnlyEvm7702Gasless extends WalletAccountReadOnly {
  /**
   * Creates a new read-only evm 7702 gasless wallet account.
   *
   * @param {string} address - The evm account's address (the EOA address directly).
   * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>} config - The configuration object.
   */
  constructor (address, config) {
    super(address)

    /**
     * The read-only evm 7702 gasless wallet account configuration.
     *
     * @protected
     * @type {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>}
     */
    this._config = config

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
    const mergedConfig = { ...this._config, ...config }

    if (config) {
      this._validateConfig(mergedConfig)
    }

    const { isSponsored } = mergedConfig

    if (isSponsored) {
      return { fee: 0n }
    }

    const fee = await this._getUserOperationGasCost([tx].flat(), mergedConfig)

    return { fee: BigInt(fee) }
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

    const result = await this.quoteSendTransaction(tx, config)

    return result
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
    const evmReadOnlyAccount = new WalletAccountReadOnlyEvm(this._address, this._config)
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
    const evmReadOnlyAccount = new WalletAccountReadOnlyEvm(this._address, this._config)

    return await evmReadOnlyAccount.verifyTypedData(typedData, signature)
  }

  /**
   * Validates the configuration to ensure all required fields are present.
   *
   * @protected
   * @param {Partial<Evm7702GaslessSponsorshipPolicyConfig | Evm7702GaslessPaymasterTokenConfig>} config - The configuration to validate.
   * @throws {ConfigurationError} If the configuration is invalid or has missing required fields.
   * @returns {void}
   */
  _validateConfig (config) {
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

  /**
   * Returns a cached abstractionkit Bundler client.
   *
   * @protected
   * @returns {Bundler}
   */
  _getBundler () {
    if (!this._bundler) {
      this._bundler = new Bundler(this._config.bundlerUrl)
    }
    return this._bundler
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
  async _getEvmReadOnlyAccount () {
    if (!this._evmReadOnlyAccount) {
      const address = await this.getAddress()
      this._evmReadOnlyAccount = new WalletAccountReadOnlyEvm(address, this._config)
    }
    return this._evmReadOnlyAccount
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
   * @param {EvmTransaction[]} txs
   * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>} config
   * @param {{ eip7702Auth?: Object }} [overrides]
   * @returns {Promise<{ userOperation: UserOperationV8, tokenQuote?: { exchangeRate: bigint, tokenCost: bigint } }>}
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
        typeof config.provider === 'string' ? config.provider : undefined,
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
      if (error?.message?.includes('AA50') || error?.cause?.message?.includes('AA50')) {
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
  async _getUserOperationGasCost (txs, config) {
    const { userOperation: sponsoredOp, tokenQuote } = await this._buildSponsoredUserOperation(txs, config)

    if (tokenQuote?.tokenCost != null) {
      return tokenQuote.tokenCost
    }

    const totalGas =
      sponsoredOp.callGasLimit +
      sponsoredOp.verificationGasLimit +
      sponsoredOp.preVerificationGas +
      (sponsoredOp.paymasterVerificationGasLimit || 0n) +
      (sponsoredOp.paymasterPostOpGasLimit || 0n)

    const gasCostInWei = totalGas * sponsoredOp.maxFeePerGas

    const exchangeRate = tokenQuote?.exchangeRate ?? await this._getTokenExchangeRate(config)

    return (gasCostInWei * exchangeRate + (EXCHANGE_RATE_PRECISION - 1n)) / EXCHANGE_RATE_PRECISION
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

    if (typeof config.provider !== 'string') {
      throw new ConfigurationError('EIP-1193 provider is not supported for fee estimation. Pass the RPC URL as a string.')
    }

    const [gasPrice, tip] = await Promise.all([
      sendJsonRpcRequest(config.provider, 'eth_gasPrice', []),
      sendJsonRpcRequest(config.provider, 'eth_maxPriorityFeePerGas', []).catch(error => {
        if (error?.cause?.code === -32601 || /method not found|not supported/i.test(error?.message ?? '')) {
          return '0x0'
        }
        throw error
      })
    ])

    const maxFeePerGas = BigInt(gasPrice)
    const maxPriorityFeePerGas = BigInt(tip) || maxFeePerGas

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
}
