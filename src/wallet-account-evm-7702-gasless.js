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

import { Contract } from 'ethers'

import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm'

import { ENTRYPOINT_V8 } from 'abstractionkit'

import WalletAccountReadOnlyEvm7702Gasless from './wallet-account-read-only-evm-7702-gasless.js'

/** @typedef {import('@tetherto/wdk-wallet').IWalletAccount} IWalletAccount */

/** @typedef {import('@tetherto/wdk-wallet-evm').KeyPair} KeyPair */

/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransaction} EvmTransaction */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransferOptions} EvmTransferOptions */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransferResult} TransferResult */
/** @typedef {import('@tetherto/wdk-wallet-evm').ApproveOptions} ApproveOptions */

/** @typedef {import('./wallet-account-read-only-evm-7702-gasless.js').Evm7702GaslessWalletConfig} Evm7702GaslessWalletConfig */
/** @typedef {import('./wallet-account-read-only-evm-7702-gasless.js').Evm7702GaslessPaymasterTokenConfig} Evm7702GaslessPaymasterTokenConfig */
/** @typedef {import('./wallet-account-read-only-evm-7702-gasless.js').Evm7702GaslessSponsorshipPolicyConfig} Evm7702GaslessSponsorshipPolicyConfig */
/** @typedef {import('./wallet-account-read-only-evm-7702-gasless.js').TypedData} TypedData */

const USDT_MAINNET_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7'

const ERC20_APPROVE_ABI = ['function approve(address spender, uint256 amount) returns (bool)']

const PACKED_USEROP_TYPES = {
  PackedUserOperation: [
    { name: 'sender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'initCode', type: 'bytes' },
    { name: 'callData', type: 'bytes' },
    { name: 'accountGasLimits', type: 'bytes32' },
    { name: 'preVerificationGas', type: 'uint256' },
    { name: 'gasFees', type: 'bytes32' },
    { name: 'paymasterAndData', type: 'bytes' }
  ]
}

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
   * Sends a transaction.
   *
   * @param {EvmTransaction | EvmTransaction[]} tx - The transaction, or an array of multiple transactions to send in batch.
   * @param {Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>} [config] - If set, overrides the given configuration options.
   * @returns {Promise<TransactionResult>} The transaction's result.
   */
  async sendTransaction (tx, config) {
    const mergedConfig = { ...this._config, ...config }

    const { fee } = await this.quoteSendTransaction(tx, config)

    const hash = await this._sendUserOperation([tx].flat(), mergedConfig)

    return { hash, fee }
  }

  /**
   * Transfers a token to another address.
   *
   * @param {EvmTransferOptions} options - The transfer's options.
   * @param {Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>} [config] - If set, overrides the given configuration options.
   * @returns {Promise<TransferResult>} The transfer's result.
   */
  async transfer (options, config) {
    const mergedConfig = { ...this._config, ...config }

    const { isSponsored, transferMaxFee } = mergedConfig

    const tx = await WalletAccountEvm._getTransferTransaction(options)

    const { fee } = await this.quoteSendTransaction(tx, config)

    if (!isSponsored && transferMaxFee !== undefined && fee >= transferMaxFee) {
      throw new Error('Exceeded maximum fee cost for transfer operation.')
    }

    const hash = await this._sendUserOperation([tx], mergedConfig)

    return { hash, fee }
  }

  /**
   * Returns a read-only copy of the account.
   *
   * @returns {Promise<WalletAccountReadOnlyEvm7702Gasless>} The read-only account.
   */
  async toReadOnlyAccount () {
    return new WalletAccountReadOnlyEvm7702Gasless(this._address, this._config)
  }

  /**
   * Disposes the wallet account, erasing the private key from the memory.
   */
  dispose () {
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
  async _sendUserOperation (txs, config) {
    const eip7702Auth = await this._getAuthorization(config)

    const { userOperation: sponsoredOp } = await this._buildSponsoredUserOperation(txs, config, { eip7702Auth })

    const chainId = await this._getChainId()
    const typedData = this._buildUserOpV08TypedData(sponsoredOp, ENTRYPOINT_V8, chainId)

    sponsoredOp.signature = await this._ownerAccount.signTypedData({
      domain: typedData.domain,
      types: typedData.types,
      message: typedData.message
    })

    return await this._getBundler().sendUserOperation(sponsoredOp, ENTRYPOINT_V8)
  }

  /** @private */
  _uint128Hex (n) {
    return BigInt(n).toString(16).padStart(32, '0')
  }

  /** @private */
  _buildInitCode (userOp) {
    if (userOp.eip7702Auth?.address) {
      const factoryData = userOp.factoryData ? userOp.factoryData.slice(2) : ''
      return userOp.eip7702Auth.address + factoryData
    }
    if (userOp.factory) {
      const factoryData = userOp.factoryData ? userOp.factoryData.slice(2) : ''
      return userOp.factory + factoryData
    }
    return '0x'
  }

  /** @private */
  _buildPaymasterAndData (userOp) {
    if (!userOp.paymaster) return '0x'

    let out = userOp.paymaster
    if (userOp.paymasterVerificationGasLimit != null) {
      out += this._uint128Hex(userOp.paymasterVerificationGasLimit)
    }
    if (userOp.paymasterPostOpGasLimit != null) {
      out += this._uint128Hex(userOp.paymasterPostOpGasLimit)
    }
    if (userOp.paymasterData) {
      out += userOp.paymasterData.slice(2)
    }
    return out
  }

  /** @private */
  _buildUserOpV08TypedData (userOp, entrypointAddress, chainId) {
    const initCode = this._buildInitCode(userOp)
    const paymasterAndData = this._buildPaymasterAndData(userOp)

    const accountGasLimits =
      '0x' + this._uint128Hex(userOp.verificationGasLimit) + this._uint128Hex(userOp.callGasLimit)
    const gasFees =
      '0x' + this._uint128Hex(userOp.maxPriorityFeePerGas) + this._uint128Hex(userOp.maxFeePerGas)

    return {
      domain: {
        name: 'ERC4337',
        version: '1',
        chainId,
        verifyingContract: entrypointAddress
      },
      types: PACKED_USEROP_TYPES,
      primaryType: 'PackedUserOperation',
      message: {
        sender: userOp.sender,
        nonce: BigInt(userOp.nonce),
        initCode,
        callData: userOp.callData,
        accountGasLimits,
        preVerificationGas: BigInt(userOp.preVerificationGas),
        gasFees,
        paymasterAndData
      }
    }
  }
}
