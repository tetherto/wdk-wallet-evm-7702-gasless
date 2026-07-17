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

import { Contract, hexlify, keccak256, randomBytes, toUtf8Bytes } from 'ethers'

import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm'

import { ENTRYPOINT_V8, Simple7702Account, fetchAccountNonce } from 'abstractionkit'

import WalletAccountReadOnlyEvm7702Gasless from './wallet-account-read-only-evm-7702-gasless.js'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */

/** @typedef {import('@tetherto/wdk-wallet-evm').KeyPair} KeyPair */

/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransaction} EvmTransaction */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransferOptions} EvmTransferOptions */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransferResult} TransferResult */
/** @typedef {import('@tetherto/wdk-wallet-evm').ApproveOptions} ApproveOptions */

/** @typedef {import('abstractionkit').UserOperationV8} UserOperationV8 */
/** @typedef {import('abstractionkit').TokenQuote} TokenQuote */

/** @typedef {import('./wallet-account-read-only-evm-7702-gasless.js').Evm7702GaslessWalletConfig} Evm7702GaslessWalletConfig */
/** @typedef {import('./wallet-account-read-only-evm-7702-gasless.js').Evm7702GaslessPaymasterTokenConfig} Evm7702GaslessPaymasterTokenConfig */
/** @typedef {import('./wallet-account-read-only-evm-7702-gasless.js').Evm7702GaslessSponsorshipPolicyConfig} Evm7702GaslessSponsorshipPolicyConfig */
/** @typedef {import('./wallet-account-read-only-evm-7702-gasless.js').TypedData} TypedData */

/**
 * @typedef {Object} TransactionQuote
 * @property {bigint} fee - The estimated fee.
 * @property {number} createdAt - Timestamp from Date.now() at cache insertion, used for TTL eviction.
 * @property {UserOperationV8} sponsoredOp - The paymaster-populated user operation, reusable for sendTransaction.
 * @property {TokenQuote} [tokenQuote] - Token-paymaster fee data. Populated on the token-payment flow; absent on sponsored flows.
 */

const USDT_MAINNET_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7'

const ERC20_APPROVE_ABI = ['function approve(address spender, uint256 amount) returns (bool)']

const QUOTE_CACHE_TTL_MS = 2 * 60 * 1000

const NONCE_KEY_SHIFT = 64n
const MAX_UINT192 = (1n << 192n) - 1n

/** @implements {IWalletAccount} */
export default class WalletAccountEvm7702Gasless extends WalletAccountReadOnlyEvm7702Gasless {
  /**
   * Creates a new evm 7702 gasless wallet account.
   *
   * @overload
   * @param {string | Uint8Array} seed - The wallet's BIP-39 seed phrase.
   * @param {string} path - The BIP-44 derivation path (e.g. "0'/0/0").
   * @param {Evm7702GaslessWalletConfig} config - The configuration object.
   */

  /**
   * Creates a new evm 7702 gasless wallet account from a wallet-evm account.
   *
   * @overload
   * @param {WalletAccountEvm} account - The wallet-evm account.
   * @param {Evm7702GaslessWalletConfig} config - The configuration object.
   */
  constructor (seedOrAccount, pathOrConfig, config) {
    const [ownerAccount, resolvedConfig] = seedOrAccount instanceof WalletAccountEvm
      ? [seedOrAccount, pathOrConfig]
      : [new WalletAccountEvm(seedOrAccount, pathOrConfig, config), config]

    super(ownerAccount.address, resolvedConfig)

    /**
     * The evm 7702 gasless wallet account configuration.
     *
     * @protected
     * @type {Evm7702GaslessWalletConfig}
     */
    this._config = resolvedConfig

    /** @private */
    this._ownerAccount = ownerAccount

    /** @private */
    this._evm7702GaslessReadOnlyAccount = undefined

    /**
     * Cache of recently-quoted transactions keyed by their serialized tx (see _getTxKey).
     * sendTransaction and transfer consume an entry to skip the gas-estimation +
     * paymaster round-trip when the same tx was just quoted. Entries expire after
     * QUOTE_CACHE_TTL_MS; expired entries are swept on insert.
     *
     * @private
     * @type {Map<string, TransactionQuote>}
     */
    this._quoteCache = new Map()
  }

  /**
   * The derivation path's index of this account.
   *
   * @type {number}
   */
  get index () {
    return this._ownerAccount.index
  }

  /**
   * The derivation path of this account (see [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)).
   *
   * @type {string}
   */
  get path () {
    return this._ownerAccount.path
  }

  /**
   * The account's key pair.
   *
   * The uint8 arrays are bound to the wallet account, so any external change will reflect to the internal representation. For this reason,
   * it's strongly recommended to treat the key pair as a read-only view of the keys. While it's still technically possible to alter their
   * content, client code should never do so.
   *
   * @type {KeyPair}
   */
  get keyPair () {
    return this._ownerAccount.keyPair
  }

  /**
   * Signs a message.
   *
   * @param {string} message - The message to sign.
   * @returns {Promise<string>} The message's signature.
   */
  async sign (message) {
    return await this._ownerAccount.sign(message)
  }

  /**
   * Signs typed data according to EIP-712.
   *
   * @param {TypedData} typedData - The typed data to sign.
   * @returns {Promise<string>} The typed data signature.
   */
  async signTypedData ({ domain, types, message }) {
    return await this._ownerAccount.signTypedData({ domain, types, message })
  }

  /**
   * Approves a specific amount of tokens to a spender.
   *
   * @param {ApproveOptions} options - The approve options.
   * @returns {Promise<TransactionResult>} The transaction's result.
   * @throws {Error} If trying to approve usdts on ethereum with allowance not equal to zero (due to the usdt allowance reset requirement).
   */
  async approve (options) {
    const { token, spender, amount } = options
    const chainId = await this._getChainId()

    if (chainId === 1n && token.toLowerCase() === USDT_MAINNET_ADDRESS.toLowerCase()) {
      const currentAllowance = await this.getAllowance(token, spender)
      if (currentAllowance > 0n && BigInt(amount) > 0n) {
        throw new Error(
          'USDT requires the current allowance to be reset to 0 before setting a new non-zero value. Please send an "approve" transaction with an amount of 0 first.'
        )
      }
    }

    const contract = new Contract(token, ERC20_APPROVE_ABI)

    const tx = {
      to: token,
      value: 0,
      data: contract.interface.encodeFunctionData('approve', [spender, amount])
    }

    return await this.sendTransaction(tx)
  }

  /**
   * Quotes the costs of a send transaction operation. Caches the built user
   * operation against the serialized transaction so that a subsequent
   * sendTransaction call with the same tx can skip the gas-estimation +
   * paymaster round-trip, after a lightweight on-chain nonce check that
   * re-quotes only if the nonce has moved. Cache entries expire after 2 minutes.
   *
   * @param {EvmTransaction | EvmTransaction[]} tx - The transaction, or an array of multiple transactions to send in batch.
   * @param {Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>} [config] - If set, overrides the given configuration options.
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
    const fee = BigInt(result.fee)

    this._sweepExpiredQuotes()
    this._quoteCache.set(WalletAccountEvm7702Gasless._getTxKey(tx), {
      fee,
      createdAt: Date.now(),
      sponsoredOp: result.sponsoredOp,
      tokenQuote: result.tokenQuote
    })

    return { fee }
  }

  /**
   * Sends a transaction.
   *
   * @param {EvmTransaction | EvmTransaction[]} tx - The transaction, or an array of multiple transactions to send in batch.
   * @param {Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>} [config] - If set, overrides the given configuration options.
   * @returns {Promise<TransactionResult>} The transaction's result.
   */
  async sendTransaction (tx, config) {
    const mergedConfig = { ...this._config, provider: this._provider, ...config }

    if (config) {
      this._validateConfig(mergedConfig)
    }

    const { isSponsored } = mergedConfig

    const nonce = await this._resolveNonce(mergedConfig)

    let cached = nonce === undefined ? await this._consumeFreshQuote(tx) : null
    let fee = 0n

    if (cached) {
      fee = cached.fee
    } else if (!isSponsored) {
      const result = await this._getUserOperationGasCost([tx].flat(), mergedConfig, { nonce })
      fee = BigInt(result.fee)
      cached = { fee, sponsoredOp: result.sponsoredOp, tokenQuote: result.tokenQuote }
    }

    const hash = await this._sendUserOperation([tx].flat(), { config: mergedConfig, cached, nonce })

    return { hash, fee }
  }

  /**
   * Transfers a token to another address.
   *
   * @param {EvmTransferOptions} options - The transfer's options.
   * @param {Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>} [config] - If set, overrides the given configuration options.
   * @returns {Promise<TransferResult>} The transfer's result.
   * @throws {Error} If the estimated fee meets or exceeds the configured `transferMaxFee`.
   */
  async transfer (options, config) {
    const mergedConfig = { ...this._config, provider: this._provider, ...config }

    if (config) {
      this._validateConfig(mergedConfig)
    }

    const { isSponsored, transferMaxFee } = mergedConfig

    const tx = await WalletAccountEvm._getTransferTransaction(options)

    const nonce = await this._resolveNonce(mergedConfig)

    let cached = nonce === undefined ? await this._consumeFreshQuote(tx) : null
    let fee = 0n

    if (cached) {
      fee = cached.fee
    } else if (!isSponsored) {
      const result = await this._getUserOperationGasCost([tx], mergedConfig, { nonce })
      fee = BigInt(result.fee)
      cached = { fee, sponsoredOp: result.sponsoredOp, tokenQuote: result.tokenQuote }
    }

    if (!isSponsored && transferMaxFee !== undefined && fee >= transferMaxFee) {
      throw new Error('Exceeded maximum fee cost for transfer operation.')
    }

    const hash = await this._sendUserOperation([tx], { config: mergedConfig, cached, nonce })

    return { hash, fee }
  }

  /**
   * Returns a read-only copy of the account.
   *
   * @returns {Promise<WalletAccountReadOnlyEvm7702Gasless>} The read-only account.
   */
  async toReadOnlyAccount () {
    if (!this._evm7702GaslessReadOnlyAccount) {
      this._evm7702GaslessReadOnlyAccount = new WalletAccountReadOnlyEvm7702Gasless(this._address, this._config)
    }
    return this._evm7702GaslessReadOnlyAccount
  }

  /**
   * Disposes the wallet account, erasing the private key from the memory.
   */
  dispose () {
    this._quoteCache.clear()
    this._ownerAccount.dispose()
  }

  /** @private */
  async _getAuthorization (config = this._config) {
    const delegation = await this._ownerAccount.getDelegation()

    if (delegation.isDelegated &&
        delegation.delegateAddress.toLowerCase() === config.delegationAddress.toLowerCase()) {
      return null
    }

    const wdkAuth = await this._ownerAccount.signAuthorization({
      address: config.delegationAddress
    })

    return {
      chainId: BigInt(wdkAuth.chainId),
      address: wdkAuth.address,
      nonce: BigInt(wdkAuth.nonce),
      yParity: Number(wdkAuth.signature.yParity) === 0 ? '0x0' : '0x1',
      r: wdkAuth.signature.r,
      s: wdkAuth.signature.s
    }
  }

  /** @private */
  async _sendUserOperation (txs, { config, cached, nonce }) {
    const eip7702Auth = await this._getAuthorization(config)

    let sponsoredOp
    if (cached?.sponsoredOp && eip7702Auth === null) {
      sponsoredOp = cached.sponsoredOp
    } else {
      const { userOperation } = await this._buildSponsoredUserOperation(txs, config, { eip7702Auth, nonce })
      sponsoredOp = userOperation
    }

    const chainId = await this._getChainId()
    const typedData = Simple7702Account.getUserOperationEip712Data(sponsoredOp, chainId)

    sponsoredOp.signature = await this._ownerAccount.signTypedData({
      domain: typedData.domain,
      types: typedData.types,
      message: typedData.message
    })

    return await this._getBundler().sendUserOperation(sponsoredOp, ENTRYPOINT_V8)
  }

  /** @private */
  async _consumeFreshQuote (tx) {
    const cached = this._consumeCachedQuote(tx)
    if (!cached?.sponsoredOp) return cached

    const onChainNonce = await fetchAccountNonce(this._provider, ENTRYPOINT_V8, this._address)

    return cached.sponsoredOp.nonce === onChainNonce ? cached : null
  }

  /** @private */
  async _resolveNonce (config) {
    if (config.nonceKey !== undefined && config.nonceKey !== null) {
      const key = typeof config.nonceKey === 'string'
        ? BigInt(keccak256(toUtf8Bytes(config.nonceKey))) & MAX_UINT192
        : BigInt(config.nonceKey)
      return await fetchAccountNonce(this._provider, ENTRYPOINT_V8, this._address, key)
    }

    if (config.parallel) {
      return BigInt(hexlify(randomBytes(24))) << NONCE_KEY_SHIFT
    }

    return undefined
  }

  /** @private */
  _consumeCachedQuote (tx) {
    const key = WalletAccountEvm7702Gasless._getTxKey(tx)
    const quote = this._quoteCache.get(key)
    if (!quote) return null
    this._quoteCache.delete(key)
    if (Date.now() - quote.createdAt > QUOTE_CACHE_TTL_MS) return null
    return quote
  }

  /** @private */
  _sweepExpiredQuotes () {
    const now = Date.now()
    for (const [key, quote] of this._quoteCache) {
      if (now - quote.createdAt > QUOTE_CACHE_TTL_MS) {
        this._quoteCache.delete(key)
      }
    }
  }

  /** @private */
  static _getTxKey (tx) {
    const txs = Array.isArray(tx) ? tx : [tx]
    return JSON.stringify(txs.map(t => ({
      to: (t.to ?? '').toLowerCase(),
      value: BigInt(t.value || 0).toString(),
      data: t.data || '0x'
    })))
  }
}
