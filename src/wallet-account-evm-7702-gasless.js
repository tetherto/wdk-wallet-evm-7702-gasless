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

import { JsonRpcNode, calculateUserOperationMaxGasCost, fetchAccountNonce } from 'abstractionkit'

import WalletAccountReadOnlyEvm7702Gasless from './wallet-account-read-only-evm-7702-gasless.js'

import { ConfigurationError } from './errors.js'

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
   * @param {string | Uint8Array} seed - A BIP-39 mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
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
     * Cache of recently-quoted transactions keyed by serialized tx plus the build-relevant
     * paymaster config (see _getTxKey). sendTransaction, signTransaction, and transfer consume an
     * entry to skip the gas-estimation + paymaster round-trip when the same tx was just quoted
     * under the same paymaster mode/token. Entries expire after QUOTE_CACHE_TTL_MS; expired
     * entries are swept on insert.
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
   * Signs a transaction, producing a self-contained user operation that can later be broadcast
   * with `sendTransaction` (or `quoteSendTransaction`'d) without any further owner interaction.
   *
   * The pre-signed EIP-7702 authorization is baked in when the EOA is not yet delegated to the
   * configured address. Note that the nonce is fixed at sign time, so a signed operation must be
   * broadcast before the account's nonce moves.
   *
   * If the transaction is not sponsored and `transactionMaxFee` is set, it also estimates the
   * transaction's costs and checks them against that ceiling. The fee check and the signature
   * always cover the same prepared user operation.
   *
   * @param {EvmTransaction | EvmTransaction[]} tx - The transaction, or an array of multiple transactions to send in batch.
   * @param {Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>} [config] - If set, overrides the given configuration options.
   * @returns {Promise<UserOperationV8>} The signed user operation.
   * @throws {Error} If the transaction is not sponsored, and the transaction's cost surpasses the transaction max. fee option.
   * @throws {Error} If `nonceKey` is a bigint outside the uint192 range (0 to 2^192 - 1).
   */
  async signTransaction (tx, config) {
    const mergedConfig = this._mergeConfig(config)

    if (config) {
      this._validateConfig(mergedConfig)
    }

    const txs = [tx].flat()
    const { isSponsored, transactionMaxFee } = mergedConfig
    const needFee = !isSponsored && transactionMaxFee !== undefined
    const prepared = await this._prepareForSend(tx, txs, mergedConfig, { needFee })

    if (needFee && prepared.fee > transactionMaxFee) {
      throw new Error('Exceeded maximum fee cost for transaction operation.')
    }

    const userOp = await this._signPreparedUserOperation(prepared)

    this._quoteCache.clear()

    return userOp
  }

  /**
   * Approves a specific amount of tokens to a spender.
   *
   * @param {ApproveOptions} options - The approve options.
   * @returns {Promise<TransactionResult>} The transaction's result.
   * @throws {Error} If trying to approve usdts on ethereum with allowance not equal to zero (due to the usdt allowance reset requirement).
   * @throws {Error} If the transaction is not sponsored, and the transaction's cost surpasses the transaction max. fee option.
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
   * Quotes the costs of a send transaction operation. A quote never signs an
   * EIP-7702 authorization: quoting is excluded from policy evaluation, so a real
   * authorization signed here would never be seen by the policy engine. For an
   * undelegated EOA the authorization is left unsigned (abstractionkit fills in
   * placeholder signature fields) only so the bundler can simulate the account.
   *
   * When the EOA is already delegated no authorization is needed, and the built
   * user operation is cached against the serialized transaction so that a subsequent
   * sendTransaction / signTransaction / transfer call with the same tx can skip the
   * gas-estimation + paymaster round-trip, after a lightweight on-chain nonce check that
   * re-quotes only if the nonce has moved. Cache entries expire after 2 minutes. A quote
   * built with a placeholder authorization is never cached, as it can never be reused for
   * a send.
   *
   * An already-signed user operation (as returned by `signTransaction`) may also be passed; in that
   * case its fee is read from its own gas fields (in token-paymaster mode this reflects the native
   * gas ceiling, not the token amount) and no gas-estimation or paymaster round-trip is performed.
   *
   * @param {EvmTransaction | EvmTransaction[] | UserOperationV8} tx - The transaction, an array of multiple transactions to send in batch, or an already-signed user operation.
   * @param {Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>} [config] - If set, overrides the given configuration options.
   * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
   */
  async quoteSendTransaction (tx, config) {
    const mergedConfig = this._mergeConfig(config)

    if (config) {
      this._validateConfig(mergedConfig)
    }

    // Assert the provider is on the configured chain before building anything
    // against a mismatched RPC.
    await this._getChainId()

    const { isSponsored } = mergedConfig

    if (WalletAccountEvm7702Gasless._isSignedUserOperation(tx)) {
      return { fee: isSponsored ? 0n : WalletAccountEvm7702Gasless._getSignedUserOperationFee(tx) }
    }

    if (isSponsored) {
      return { fee: 0n }
    }

    // A quote must not sign: it is excluded from policy evaluation, so a real EIP-7702
    // authorization signed here would never be seen by the policy engine. The bundler only
    // needs the delegation target and chain to simulate the account, so the authorization
    // is left unsigned and abstractionkit fills in placeholder signature fields.
    const eip7702Auth = await this._getQuoteAuthorization(mergedConfig)
    const result = await this._getUserOperationGasCost([tx].flat(), mergedConfig, { eip7702Auth })
    const fee = BigInt(result.fee)

    this._sweepExpiredQuotes()

    // An operation carrying a placeholder authorization is only good for the estimate:
    // it can never be reused for a send, so it is not cached.
    if (eip7702Auth === null) {
      this._quoteCache.set(WalletAccountEvm7702Gasless._getTxKey(tx, mergedConfig), {
        fee,
        createdAt: Date.now(),
        sponsoredOp: result.sponsoredOp,
        tokenQuote: result.tokenQuote
      })
    }

    return { fee }
  }

  /**
   * Sends a transaction.
   *
   * If the transaction is not sponsored, it also estimates the transaction's costs and checks them
   * against the transaction max. fee option. The fee check and the signature always cover the same
   * prepared user operation.
   *
   * An already-signed user operation (as returned by `signTransaction`) may also be passed; in that
   * case it is broadcast directly to the bundler, reusing the nonce and EIP-7702 authorization baked
   * in at sign time. The max-fee check is skipped here: token-paymaster fees cannot be reconstructed
   * from a signed user operation (`_getSignedUserOperationFee` returns native wei, while
   * `transactionMaxFee` is in paymaster-token units), so the ceiling only applies when this wallet
   * builds/signs the operation with `transactionMaxFee` configured.
   *
   * @param {EvmTransaction | EvmTransaction[] | UserOperationV8} tx - The transaction, an array of multiple transactions to send in batch, or an already-signed user operation.
   * @param {Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>} [config] - If set, overrides the given configuration options.
   * @returns {Promise<TransactionResult>} The transaction's result.
   * @throws {Error} If the transaction is not sponsored, and the transaction's cost surpasses the transaction max. fee option.
   * @throws {Error} If `nonceKey` is a bigint outside the uint192 range (0 to 2^192 - 1).
   */
  async sendTransaction (tx, config) {
    const mergedConfig = this._mergeConfig(config)

    if (config) {
      this._validateConfig(mergedConfig)
    }

    // Assert the provider is on the configured chain before broadcasting a
    // signed UserOp or before `_getAuthorization` signs a 7702 authorization.
    await this._getChainId()

    const { isSponsored, transactionMaxFee } = mergedConfig

    if (WalletAccountEvm7702Gasless._isSignedUserOperation(tx)) {
      const fee = isSponsored ? 0n : WalletAccountEvm7702Gasless._getSignedUserOperationFee(tx)

      const hash = await this._broadcastSignedUserOperation(tx)

      return { hash, fee }
    }

    const txs = [tx].flat()
    const prepared = await this._prepareForSend(tx, txs, mergedConfig)

    if (!isSponsored && transactionMaxFee !== undefined && prepared.fee > transactionMaxFee) {
      throw new Error('Exceeded maximum fee cost for transaction operation.')
    }

    const hash = await this._sendUserOperation(prepared)
    return { hash, fee: prepared.fee }
  }

  /**
   * Transfers a token to another address.
   *
   * @param {EvmTransferOptions} options - The transfer's options.
   * @param {Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>} [config] - If set, overrides the given configuration options.
   * @returns {Promise<TransferResult>} The transfer's result.
   * @throws {Error} If the estimated fee meets or exceeds the configured `transferMaxFee`.
   * @throws {Error} If `nonceKey` is a bigint outside the uint192 range (0 to 2^192 - 1).
   */
  async transfer (options, config) {
    const mergedConfig = this._mergeConfig(config)

    if (config) {
      this._validateConfig(mergedConfig)
    }

    const { isSponsored, transferMaxFee } = mergedConfig

    const tx = await WalletAccountEvm._getTransferTransaction(options)
    const txs = [tx]
    const prepared = await this._prepareForSend(tx, txs, mergedConfig)

    if (!isSponsored && transferMaxFee !== undefined && prepared.fee >= transferMaxFee) {
      throw new Error('Exceeded maximum fee cost for transfer operation.')
    }

    const hash = await this._sendUserOperation(prepared)
    return { hash, fee: prepared.fee }
  }

  /**
   * Returns a read-only copy of the account.
   *
   * @returns {Promise<WalletAccountReadOnlyEvm7702Gasless>} The read-only account.
   */
  async toReadOnlyAccount () {
    if (!this._evm7702GaslessReadOnlyAccount) {
      this._evm7702GaslessReadOnlyAccount = new WalletAccountReadOnlyEvm7702Gasless(this._address, { ...this._config, provider: this._provider })
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

  /**
   * Merges a per-call configuration over the account's configuration.
   *
   * `delegationAddress` is a constructor-only field: a per-call override would
   * sign an EIP-7702 authorization for a delegate the account is not configured
   * for, while the quote cached for the account's own delegate could still be
   * reused for it. The constructor value always wins.
   *
   * @private
   * @param {Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>} [config] - If set, overrides the given configuration options.
   * @returns {Evm7702GaslessWalletConfig} The merged configuration.
   * @throws {ConfigurationError} If the per-call configuration overrides `delegationAddress`.
   */
  _mergeConfig (config) {
    const mergedConfig = { ...this._config, provider: this._provider, ...config }

    if (config?.delegationAddress !== undefined &&
        config.delegationAddress.toLowerCase() !== this._config.delegationAddress.toLowerCase()) {
      throw new ConfigurationError(
        `The 'delegationAddress' option is set on the account and cannot be overridden per call (received ${config.delegationAddress}, the account delegates to ${this._config.delegationAddress}).`
      )
    }

    mergedConfig.delegationAddress = this._config.delegationAddress

    return mergedConfig
  }

  /** @private */
  async _isDelegatedTo (config) {
    const delegatedTo = await JsonRpcNode.from(this._eip1193Provider).getDelegatedAddress(this._address)

    return Boolean(delegatedTo) &&
      delegatedTo.toLowerCase() === config.delegationAddress.toLowerCase()
  }

  /** @private */
  async _getQuoteAuthorization (config = this._config) {
    if (await this._isDelegatedTo(config)) {
      return null
    }

    return {
      chainId: await this._getChainId(),
      address: config.delegationAddress
    }
  }

  /** @private */
  async _getAuthorization (config = this._config) {
    if (await this._isDelegatedTo(config)) {
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
  async _prepareForSend (tx, txs, config, { needFee = true } = {}) {
    // Assert the provider is on the configured chain before `_getAuthorization`
    // signs a 7702 authorization against a mismatched RPC.
    await this._getChainId()

    const nonce = await this._resolveNonce(config)
    const eip7702Auth = await this._getAuthorization(config)

    if (nonce === undefined) {
      if (eip7702Auth === null) {
        const cached = await this._consumeFreshQuote(tx, config)
        if (cached?.sponsoredOp) {
          return {
            fee: cached.fee,
            sponsoredOp: cached.sponsoredOp,
            tokenQuote: cached.tokenQuote
          }
        }
      } else {
        this._consumeCachedQuote(tx, config)
      }
    }

    if (config.isSponsored || !needFee) {
      const { userOperation, tokenQuote } = await this._buildSponsoredUserOperation(txs, config, {
        eip7702Auth,
        nonce
      })
      return { fee: 0n, sponsoredOp: userOperation, tokenQuote }
    }

    const result = await this._getUserOperationGasCost(txs, config, { eip7702Auth, nonce })
    return {
      fee: BigInt(result.fee),
      sponsoredOp: result.sponsoredOp,
      tokenQuote: result.tokenQuote
    }
  }

  /** @private */
  async _signPreparedUserOperation (prepared) {
    const { sponsoredOp } = prepared

    const chainId = await this._getChainId()
    const typedData = await this._getUserOperationTypedData(sponsoredOp, chainId)

    sponsoredOp.signature = await this._ownerAccount.signTypedData({
      domain: typedData.domain,
      types: typedData.types,
      message: typedData.message
    })

    return sponsoredOp
  }

  /** @private */
  async _sendUserOperation (prepared) {
    const sponsoredOp = await this._signPreparedUserOperation(prepared)

    return await this._broadcastSignedUserOperation(sponsoredOp)
  }

  /**
   * Broadcasts an already-signed user operation directly to the bundler.
   *
   * @private
   * @param {UserOperationV8} userOp - The signed user operation.
   * @returns {Promise<string>} The user operation hash.
   */
  async _broadcastSignedUserOperation (userOp) {
    return await this._getBundler().sendUserOperation(userOp, await this._getEntryPointAddress())
  }

  /**
   * Determines whether a value is an already-signed UserOperation (as returned by `signTransaction`)
   * rather than an unsigned {@link EvmTransaction} (or array of them).
   *
   * @private
   * @param {EvmTransaction | EvmTransaction[] | UserOperationV8} tx - The value to inspect.
   * @returns {boolean} True if the value is a signed UserOperation.
   */
  static _isSignedUserOperation (tx) {
    return tx !== null &&
      typeof tx === 'object' &&
      !Array.isArray(tx) &&
      tx.sender !== undefined &&
      tx.callData !== undefined &&
      tx.signature !== undefined
  }

  /**
   * Computes the fee for an already-signed UserOperation from its own gas fields.
   *
   * In token-paymaster mode this reflects the native gas ceiling (in wei) rather than the token
   * amount: the token cost is set by the paymaster at sign time and cannot be reproduced from the
   * signed UserOperation.
   *
   * @private
   * @param {UserOperationV8} userOp - The signed UserOperation.
   * @returns {bigint} The fee, in the account's native coin (wei).
   */
  static _getSignedUserOperationFee (userOp) {
    return BigInt(calculateUserOperationMaxGasCost(userOp))
  }

  /** @private */
  async _consumeFreshQuote (tx, config = {}) {
    const cached = this._consumeCachedQuote(tx, config)
    if (!cached?.sponsoredOp) return cached

    const onChainNonce = await fetchAccountNonce(this._eip1193Provider, await this._getEntryPointAddress(), this._address)

    return cached.sponsoredOp.nonce === onChainNonce ? cached : null
  }

  /** @private */
  async _resolveNonce (config) {
    if (config.nonceKey !== undefined && config.nonceKey !== null) {
      let key
      if (typeof config.nonceKey === 'string') {
        key = BigInt(keccak256(toUtf8Bytes(config.nonceKey))) & MAX_UINT192
      } else {
        key = BigInt(config.nonceKey)
        if (key < 0n || key > MAX_UINT192) {
          throw new Error('nonceKey must be within the uint192 range (0 to 2^192 - 1).')
        }
      }
      return await fetchAccountNonce(this._eip1193Provider, await this._getEntryPointAddress(), this._address, key)
    }

    if (config.parallel) {
      return BigInt(hexlify(randomBytes(24))) << NONCE_KEY_SHIFT
    }

    return undefined
  }

  /** @private */
  _consumeCachedQuote (tx, config = {}) {
    const key = WalletAccountEvm7702Gasless._getTxKey(tx, config)
    const quote = this._quoteCache.get(key)
    if (!quote) return null
    this._quoteCache.delete(key)
    if (Date.now() - quote.createdAt > QUOTE_CACHE_TTL_MS) return null
    if (!WalletAccountEvm7702Gasless._isQuoteForDelegate(quote, config)) return null
    return quote
  }

  /**
   * Checks that a cached quote's EIP-7702 authorization, if any, delegates to
   * the account's own delegate. A quote built for another delegate must never
   * be broadcast for this account.
   *
   * @private
   * @param {TransactionQuote} quote - The cached quote.
   * @param {Evm7702GaslessWalletConfig} [config] - The merged configuration.
   * @returns {boolean} True if the quote may be reused.
   */
  static _isQuoteForDelegate (quote, config = {}) {
    const authorizedDelegate = quote.sponsoredOp?.eip7702Auth?.address
    if (!authorizedDelegate) return true
    if (!config.delegationAddress) return false

    return authorizedDelegate.toLowerCase() === config.delegationAddress.toLowerCase()
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
  static _getTxKey (tx, config = {}) {
    const txs = Array.isArray(tx) ? tx : [tx]
    return JSON.stringify({
      txs: txs.map(t => ({
        to: (t.to ?? '').toLowerCase(),
        value: BigInt(t.value || 0).toString(),
        data: t.data || '0x'
      })),
      isSponsored: Boolean(config.isSponsored),
      delegationAddress: config.delegationAddress?.toLowerCase() ?? null,
      paymasterToken: config.paymasterToken?.address?.toLowerCase() ?? null,
      paymasterAddress: config.paymasterAddress?.toLowerCase() ?? null,
      sponsorshipPolicyId: config.sponsorshipPolicyId ?? null
    })
  }
}
