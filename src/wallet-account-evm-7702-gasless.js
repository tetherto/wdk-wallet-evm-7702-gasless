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

import { http } from 'viem'
import { createPaymasterClient, formatUserOperationRequest } from 'viem/account-abstraction'
import { toAccount } from 'viem/accounts'
import { toSimpleSmartAccount } from 'permissionless/accounts'
import { createSmartAccountClient } from 'permissionless'

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

/** @typedef {import('permissionless').SmartAccountClient} SmartAccountClient */

const USDT_MAINNET_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7'

const ERC20_APPROVE_ABI = ['function approve(address spender, uint256 amount) returns (bool)']

const GAS_LIMIT_BUFFER = 150n
const GAS_LIMIT_DIVISOR = 100n

/** @implements {IWalletAccount} */
export default class WalletAccountEvm7702Gasless extends WalletAccountReadOnlyEvm7702Gasless {
  /**
   * Creates a new evm 7702 gasless wallet account.
   *
   * @overload
   * @param {string | Uint8Array} seedOrAccount - The wallet's BIP-39 seed phrase.
   * @param {string} path - The BIP-44 derivation path (e.g. "0'/0/0").
   * @param {Evm7702GaslessWalletConfig} config - The configuration object.
   */

  /**
   * Creates a new evm 7702 gasless wallet account from an existing wallet-evm account.
   *
   * @overload
   * @param {WalletAccountEvm} seedOrAccount - An existing WalletAccountEvm instance.
   * @param {Evm7702GaslessWalletConfig} config - The configuration object.
   */
  constructor (seedOrAccount, pathOrConfig, config) {
    let ownerAccount, resolvedConfig

    if (seedOrAccount instanceof WalletAccountEvm) {
      ownerAccount = seedOrAccount
      resolvedConfig = pathOrConfig || {}
    } else {
      resolvedConfig = config || {}
      ownerAccount = new WalletAccountEvm(seedOrAccount, pathOrConfig, resolvedConfig)
    }

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
    this._smartAccountClient = null
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

    if (config) {
      this._validateConfig(mergedConfig)
    }

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

    if (config) {
      this._validateConfig(mergedConfig)
    }

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
    const address = await this._ownerAccount.getAddress()

    const readOnlyAccount = new WalletAccountReadOnlyEvm7702Gasless(address, this._config)

    return readOnlyAccount
  }

  /**
   * Disposes the wallet account, erasing the private key from the memory.
   */
  dispose () {
    this._ownerAccount.dispose()
    this._ownerAccount = null
    this._smartAccountClient = null
  }

  /** @private */
  _getViemOwner () {
    const ownerAccount = this._ownerAccount

    return toAccount({
      address: ownerAccount.address,
      async signMessage ({ message }) {
        const msg = typeof message === 'string' ? message : message.raw
        return await ownerAccount.sign(msg)
      },
      async signTypedData (typedData) {
        return await ownerAccount.signTypedData(typedData)
      },
      async signTransaction () {
        throw new Error('Use UserOps instead of direct transactions')
      }
    })
  }

  /** @private */
  async _getSmartAccountClient (config = this._config) {
    if (!this._smartAccountClient) {
      const { publicClient, chain } = await this._getViemClients(config)
      const viemOwner = this._getViemOwner()

      const smartAccount = await toSimpleSmartAccount({
        client: publicClient,
        owner: viemOwner,
        eip7702: true,
        accountLogicAddress: config.delegationAddress
      })

      const bundlerUrl = config.bundlerUrl
      const paymasterUrl = config.paymasterUrl

      const paymasterOption = paymasterUrl
        ? createPaymasterClient({ transport: http(paymasterUrl) })
        : true

      const isPimlico = bundlerUrl.includes('pimlico')

      this._smartAccountClient = createSmartAccountClient({
        account: smartAccount,
        chain,
        bundlerTransport: http(bundlerUrl),
        paymaster: paymasterOption,
        paymasterContext: this._buildPaymasterContext(config),
        userOperation: {
          estimateFeesPerGas: isPimlico
            ? () => this._estimatePimlicoFeesPerGas(bundlerUrl)
            : () => this._estimateFeesPerGas(config.provider)
        }
      })
    }

    return this._smartAccountClient
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
      address: wdkAuth.address,
      chainId: Number(wdkAuth.chainId),
      nonce: Number(wdkAuth.nonce),
      r: wdkAuth.signature.r,
      s: wdkAuth.signature.s,
      yParity: Number(wdkAuth.signature.yParity)
    }
  }

  /**
   * Estimates the gas cost of a user operation using the smart account client.
   *
   * @protected
   * @param {EvmTransaction[]} txs - The transactions.
   * @param {Evm7702GaslessWalletConfig} config - The configuration.
   * @returns {Promise<bigint>} The estimated gas cost.
   */
  async _getUserOperationGasCost (txs, config) {
    const smartAccountClient = await this._getSmartAccountClient(config)
    const authorization = await this._getAuthorization(config)

    const calls = txs.map(tx => ({
      to: tx.to,
      data: tx.data || '0x',
      value: BigInt(tx.value || 0)
    }))

    const { isSponsored, paymasterToken } = config

    if (!isSponsored && paymasterToken) {
      const approvalCalls = await this._getPaymasterApprovalCalls(config)
      calls.unshift(...approvalCalls)
    }

    const prepareParams = { calls }

    if (authorization) {
      prepareParams.authorization = authorization
    }

    try {
      const prepared = await smartAccountClient.prepareUserOperation(prepareParams)

      const {
        callGasLimit,
        verificationGasLimit,
        preVerificationGas,
        paymasterVerificationGasLimit,
        paymasterPostOpGasLimit,
        maxFeePerGas
      } = prepared

      const totalGas = (callGasLimit || 0n) +
        (verificationGasLimit || 0n) +
        (preVerificationGas || 0n) +
        (paymasterVerificationGasLimit || 0n) +
        (paymasterPostOpGasLimit || 0n)

      return totalGas * maxFeePerGas
    } catch (error) {
      if (error.message.includes('AA50')) {
        throw new Error('Simulation failed: not enough funds in the account to repay the paymaster.')
      }

      throw error
    }
  }

  /** @private */
  async _sendUserOperation (txs, config) {
    const smartAccountClient = await this._getSmartAccountClient(config)
    const authorization = await this._getAuthorization(config)

    const calls = txs.map(tx => ({
      to: tx.to,
      data: tx.data || '0x',
      value: BigInt(tx.value || 0)
    }))

    const { isSponsored, paymasterToken } = config

    if (!isSponsored && paymasterToken) {
      const approvalCalls = await this._getPaymasterApprovalCalls(config)
      calls.unshift(...approvalCalls)
    }

    const userOpParams = { calls }

    if (authorization) {
      userOpParams.authorization = authorization
    }

    try {
      const estimated = await smartAccountClient.prepareUserOperation(userOpParams)

      const prepared = await smartAccountClient.prepareUserOperation({
        ...userOpParams,
        callGasLimit: estimated.callGasLimit * GAS_LIMIT_BUFFER / GAS_LIMIT_DIVISOR,
        verificationGasLimit: estimated.verificationGasLimit * GAS_LIMIT_BUFFER / GAS_LIMIT_DIVISOR
      })

      const signature = await smartAccountClient.account.signUserOperation(prepared)
      const rpcParams = formatUserOperationRequest({ ...prepared, signature })

      return await smartAccountClient.request({
        method: 'eth_sendUserOperation',
        params: [rpcParams, smartAccountClient.account.entryPoint.address]
      })
    } catch (err) {
      if (err.message.includes('AA50')) {
        throw new Error('Not enough funds on the account to repay the paymaster.')
      }

      throw err
    }
  }

  /** @private */
  async _getPaymasterApprovalCalls (config) {
    const { paymasterAddress, paymasterToken } = config
    const tokenAddress = paymasterToken.address
    const chainId = await this._getChainId()

    const currentAllowance = await this.getAllowance(tokenAddress, paymasterAddress)

    const approvalAmount = 10n ** 12n

    if (currentAllowance >= approvalAmount) {
      return []
    }

    const contract = new Contract(tokenAddress, ERC20_APPROVE_ABI)
    const calls = []

    if (chainId === 1n &&
        tokenAddress.toLowerCase() === USDT_MAINNET_ADDRESS.toLowerCase() &&
        currentAllowance > 0n) {
      calls.push({
        to: tokenAddress,
        value: 0n,
        data: contract.interface.encodeFunctionData('approve', [paymasterAddress, 0])
      })
    }

    calls.push({
      to: tokenAddress,
      value: 0n,
      data: contract.interface.encodeFunctionData('approve', [paymasterAddress, approvalAmount])
    })

    return calls
  }
}
