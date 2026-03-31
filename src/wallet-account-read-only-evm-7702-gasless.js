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

import { createPublicClient, defineChain, hexToBigInt, http, numberToHex } from 'viem'
import { createBundlerClient, createPaymasterClient, UserOperationReceiptNotFoundError } from 'viem/account-abstraction'
import { toAccount } from 'viem/accounts'
import { to7702SimpleSmartAccount } from 'permissionless/accounts'
import { createSmartAccountClient } from 'permissionless'

import { Contract } from 'ethers'

import { ConfigurationError } from './errors.js'

/** @typedef {import('ethers').Eip1193Provider} Eip1193Provider */

/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransaction} EvmTransaction */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransferOptions} EvmTransferOptions */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransferResult} TransferResult */

/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransactionReceipt} EvmTransactionReceipt */

/** @typedef {import('@tetherto/wdk-wallet-evm').TypedData} TypedData */

/** @typedef {import('viem').PublicClient} PublicClient */
/** @typedef {import('viem').Chain} Chain */
/** @typedef {import('viem/account-abstraction').BundlerClient} BundlerClient */

/**
 * @typedef {Object} ViemClients
 * @property {PublicClient} publicClient - The viem public client.
 * @property {BundlerClient} bundlerClient - The viem bundler client.
 * @property {Chain} chain - The viem chain definition.
 */

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
 * @property {string} paymasterAddress - The address of the paymaster smart contract.
 * @property {Object} paymasterToken - The paymaster token configuration.
 * @property {string} paymasterToken.address - The address of the paymaster token.
 * @property {number | bigint} [transferMaxFee] - The maximum fee amount for transfer operations.
 */

/**
 * @typedef {Evm7702GaslessWalletCommonConfig &
 *  (Evm7702GaslessSponsorshipPolicyConfig |
 *   Evm7702GaslessPaymasterTokenConfig)} Evm7702GaslessWalletConfig
 */

/** @typedef {import('viem/account-abstraction').GetUserOperationReceiptReturnType} UserOperationReceipt */

const GAS_FEE_MULTIPLIER = 150n
const GAS_FEE_DIVISOR = 100n
const EXCHANGE_RATE_PRECISION = 10n ** 18n
const ENTRYPOINT_V08_ADDRESS = '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108'
const USDT_MAINNET_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const ERC20_APPROVE_ABI = ['function approve(address spender, uint256 amount) returns (bool)']

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
     * Cached viem clients.
     *
     * @protected
     * @type {ViemClients | undefined}
     */
    this._viemClients = undefined

    /**
     * The chain id.
     *
     * @protected
     * @type {bigint | undefined}
     */
    this._chainId = undefined

    /** @private */
    this._smartAccountClients = new Map()
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
      throw new Error('Paymaster token is not configured.')
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
    const { bundlerClient } = await this._getViemClients()

    const evmReadOnlyAccount = await this._getEvmReadOnlyAccount()

    let userOpReceipt
    try {
      userOpReceipt = await bundlerClient.getUserOperationReceipt({ hash })
    } catch (error) {
      if (error instanceof UserOperationReceiptNotFoundError) {
        return null
      }

      throw error
    }

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
    const { bundlerClient } = await this._getViemClients()

    try {
      const receipt = await bundlerClient.getUserOperationReceipt({ hash })
      return receipt
    } catch (error) {
      if (error instanceof UserOperationReceiptNotFoundError) {
        return null
      }

      throw error
    }
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
    if (!config.isSponsored) {
      const missingFields = []

      if (!config.paymasterAddress) {
        missingFields.push('paymasterAddress')
      }

      if (!config.paymasterToken) {
        missingFields.push('paymasterToken')
      }

      if (missingFields.length > 0) {
        throw new ConfigurationError(`Missing required paymaster token configuration fields: ${missingFields.join(', ')}.`)
      }
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

  /**
   * Returns cached viem clients (publicClient + bundlerClient).
   *
   * @protected
   * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>} [config] - The configuration object. Defaults to this._config if not provided.
   * @returns {Promise<ViemClients>} The cached viem clients.
   */
  async _getViemClients (config = this._config) {
    if (!this._viemClients) {
      const chainId = await this._getChainId()

      const chain = defineChain({
        id: Number(chainId),
        name: `chain-${chainId}`,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [config.provider] }
        }
      })

      const publicClient = createPublicClient({
        chain,
        transport: http(config.provider)
      })

      const bundlerClient = createBundlerClient({
        chain,
        transport: http(config.bundlerUrl),
        client: publicClient
      })

      this._viemClients = { publicClient, bundlerClient, chain }
    }

    return this._viemClients
  }

  /**
   * Returns the chain id.
   *
   * @protected
   * @returns {Promise<bigint>} The chain id.
   */
  async _getChainId () {
    if (!this._chainId) {
      const evmReadOnlyAccount = await this._getEvmReadOnlyAccount()
      const { chainId } = await evmReadOnlyAccount._provider.getNetwork()
      this._chainId = chainId
    }

    return this._chainId
  }

  /** @private */
  _buildPaymasterContext (config) {
    if (config.isSponsored && config.sponsorshipPolicyId) {
      return { sponsorshipPolicyId: config.sponsorshipPolicyId }
    }

    if (config.paymasterToken) {
      return { token: config.paymasterToken.address }
    }

    return {}
  }

  /** @private */
  async _getEvmReadOnlyAccount () {
    const address = await this.getAddress()

    const evmReadOnlyAccount = new WalletAccountReadOnlyEvm(address, this._config)

    return evmReadOnlyAccount
  }

  /** @private */
  _getSmartAccountClientCacheKey (config) {
    if (config.isSponsored) {
      return `sponsored:${config.paymasterUrl || config.bundlerUrl}`
    }

    return `paymaster:${config.paymasterUrl || config.bundlerUrl}:${config.paymasterAddress}`
  }

  /** @private */
  async _getSmartAccountClient (config = this._config) {
    const cacheKey = this._getSmartAccountClientCacheKey(config)

    if (!this._smartAccountClients.has(cacheKey)) {
      const { publicClient, chain } = await this._getViemClients(config)
      const address = await this.getAddress()

      const dummyOwner = toAccount({ address })

      const smartAccount = await to7702SimpleSmartAccount({
        client: publicClient,
        owner: dummyOwner,
        accountLogicAddress: config.delegationAddress
      })

      const bundlerUrl = config.bundlerUrl
      const paymasterUrl = config.paymasterUrl

      const paymasterOption = paymasterUrl
        ? createPaymasterClient({ transport: http(paymasterUrl) })
        : true

      const isPimlico = bundlerUrl.includes('pimlico')

      this._smartAccountClients.set(cacheKey, createSmartAccountClient({
        account: smartAccount,
        chain,
        bundlerTransport: http(bundlerUrl),
        paymaster: paymasterOption,
        paymasterContext: this._buildPaymasterContext(config),
        userOperation: {
          estimateFeesPerGas: isPimlico
            ? () => this._estimatePimlicoFeesPerGas()
            : () => this._estimateFeesPerGas()
        }
      }))
    }

    return this._smartAccountClients.get(cacheKey)
  }

  /** @private */
  async _getUserOperationGasCost (txs, config) {
    const smartAccountClient = await this._getSmartAccountClient(config)

    const calls = txs.map(tx => ({
      to: tx.to,
      data: tx.data || '0x',
      value: BigInt(tx.value || 0)
    }))

    if (!config.isSponsored) {
      const approvalCalls = await this._getPaymasterApprovalCalls(config)
      calls.unshift(...approvalCalls)
    }

    try {
      const prepared = await smartAccountClient.prepareUserOperation({ calls })

      const {
        callGasLimit,
        verificationGasLimit,
        preVerificationGas,
        paymasterVerificationGasLimit,
        paymasterPostOpGasLimit,
        maxFeePerGas
      } = prepared

      const totalGas = callGasLimit +
        verificationGasLimit +
        preVerificationGas +
        (paymasterVerificationGasLimit || 0n) +
        (paymasterPostOpGasLimit || 0n)

      const gasCostInWei = totalGas * maxFeePerGas

      if (config.paymasterToken) {
        const exchangeRate = await this._getTokenExchangeRate(config.paymasterToken.address, config)

        return (gasCostInWei * exchangeRate + (EXCHANGE_RATE_PRECISION - 1n)) / EXCHANGE_RATE_PRECISION
      }

      return gasCostInWei
    } catch (error) {
      if (error.message.includes('AA50')) {
        throw new Error('Simulation failed: not enough funds in the account to repay the paymaster.')
      }

      throw error
    }
  }

  /** @private */
  async _estimatePimlicoFeesPerGas () {
    const { bundlerClient } = await this._getViemClients()

    const { fast } = await bundlerClient.request({
      method: 'pimlico_getUserOperationGasPrice'
    })

    return {
      maxFeePerGas: BigInt(fast.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(fast.maxPriorityFeePerGas)
    }
  }

  /** @private */
  async _estimateFeesPerGas () {
    const { publicClient } = await this._getViemClients()

    const [block, maxPriorityFeePerGas] = await Promise.all([
      publicClient.getBlock({ blockTag: 'latest' }),
      publicClient.estimateMaxPriorityFeePerGas()
    ])

    const baseFeePerGas = block.baseFeePerGas

    if (!baseFeePerGas) {
      throw new Error('Base fee not available — chain may not support EIP-1559.')
    }

    const maxFeePerGas = baseFeePerGas + maxPriorityFeePerGas

    return {
      maxFeePerGas: maxFeePerGas * GAS_FEE_MULTIPLIER / GAS_FEE_DIVISOR,
      maxPriorityFeePerGas: maxPriorityFeePerGas * GAS_FEE_MULTIPLIER / GAS_FEE_DIVISOR
    }
  }

  /** @private */
  async _getTokenExchangeRate (tokenAddress, config) {
    const isPimlico = config.bundlerUrl.includes('pimlico')

    if (isPimlico) {
      return await this._getPimlicoTokenExchangeRate(tokenAddress, config.bundlerUrl)
    }

    return await this._getCandideTokenExchangeRate(tokenAddress, config.paymasterUrl || config.bundlerUrl)
  }

  /** @private */
  async _getPimlicoTokenExchangeRate (tokenAddress, bundlerUrl) {
    const client = createPublicClient({ transport: http(bundlerUrl) })
    const chainId = await this._getChainId()

    const res = await client.request({
      method: 'pimlico_getTokenQuotes',
      params: [
        { tokens: [tokenAddress] },
        ENTRYPOINT_V08_ADDRESS,
        numberToHex(Number(chainId))
      ]
    })

    return hexToBigInt(res.quotes[0].exchangeRate)
  }

  /** @private */
  async _getCandideTokenExchangeRate (tokenAddress, paymasterUrl) {
    const client = createPublicClient({ transport: http(paymasterUrl) })

    const res = await client.request({
      method: 'pm_supportedERC20Tokens',
      params: [ENTRYPOINT_V08_ADDRESS]
    })

    const token = res.tokens.find(
      t => t.address.toLowerCase() === tokenAddress.toLowerCase()
    )

    if (!token) {
      throw new Error(`Token ${tokenAddress} is not supported by the paymaster.`)
    }

    return hexToBigInt(token.exchangeRate)
  }
}
