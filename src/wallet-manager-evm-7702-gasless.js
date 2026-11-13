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

import WalletManager, { DisposalError, InvalidSignerError } from '@tetherto/wdk-wallet'

import WalletManagerEvm from '@tetherto/wdk-wallet-evm'

import { SeedSignerEvm } from '@tetherto/wdk-wallet-evm/signers'

import WalletAccountEvm7702Gasless from './wallet-account-evm-7702-gasless.js'

import WalletAccountReadOnlyEvm7702Gasless from './wallet-account-read-only-evm-7702-gasless.js'

/** @typedef {import('ethers').Provider} Provider */

/** @typedef {import('@tetherto/wdk-wallet-evm').FeeRates} FeeRates */
/** @typedef {import('@tetherto/wdk-wallet-evm/signers').ISignerEvm} ISignerEvm */

/** @typedef {import('@tetherto/wdk-wallet').NoSuchElementError} NoSuchElementError */

/** @typedef {import('./wallet-account-evm-7702-gasless.js').Evm7702GaslessWalletConfig} Evm7702GaslessWalletConfig */

const BIP_44_ETH_DERIVATION_PATH_PREFIX = "m/44'/60'"

/** @extends {WalletManager<ISignerEvm>} */
export default class WalletManagerEvm7702Gasless extends WalletManager {
  /**
   * Creates a new wallet manager for evm blockchains that implements the 7702 standard for gasless account abstraction.
   *
   * @overload
   * @param {string | Uint8Array} seed - A [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
   * @param {Evm7702GaslessWalletConfig} config - The configuration object.
   */

  /**
   * Creates a new wallet manager for evm blockchains that implements the 7702 standard for gasless account abstraction from a default signer.
   *
   * The default signer must be derivable. Non-derivable signers (e.g. private-key signers) can only be registered by
   * name via {@link addSigner}. The manager never disposes a signer you supplied.
   *
   * @overload
   * @param {ISignerEvm} signer - The default signer.
   * @param {Evm7702GaslessWalletConfig} config - The configuration object.
   * @throws {InvalidSignerError} If the default signer does not support account derivation.
   */

  constructor (seedOrSigner, config) {
    const isSeed = typeof seedOrSigner === 'string' || seedOrSigner instanceof Uint8Array

    const provider = WalletAccountReadOnlyEvm7702Gasless._buildProvider(config)

    super(isSeed ? new SeedSignerEvm(seedOrSigner, BIP_44_ETH_DERIVATION_PATH_PREFIX) : seedOrSigner, config)

    /**
     * If true, disposes the default signer on calls to the 'dispose' method.
     *
     * @protected
     * @type {boolean}
     */
    this._shouldWipeDefaultSignerOnDisposal = isSeed

    /**
     * The evm 7702 gasless wallet configuration.
     *
     * @protected
     * @type {Evm7702GaslessWalletConfig}
     */
    this._config = config

    /**
     * The shared ethers provider to interact with a node of the blockchain. Built once here and
     * passed to every account this manager creates so they reuse a single connection.
     *
     * @protected
     * @type {Provider | undefined}
     */
    this._provider = provider
  }

  /**
   * Returns the configuration used to create accounts, with the manager's shared provider injected
   * last so it is not overwritten by the original `provider` option.
   *
   * @private
   * @returns {Evm7702GaslessWalletConfig} The account configuration.
   */
  _accountConfig () {
    return { ...this._config, provider: this._provider }
  }

  /**
   * Returns the wallet account at a specific index (see [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)),
   * e.g. `getAccount(1)` returns the account with derivation path m/44'/60'/0'/0/1.
   *
   * @overload
   * @param {number} [index] - The index of the account to get (default: 0).
   * @param {Object} [options] - Account options.
   * @param {string} [options.signerName] - The signer name. Omit to use the default signer.
   * @returns {Promise<WalletAccountEvm7702Gasless>} The account.
   * @throws {NoSuchElementError} If a signer name is given but no signer exists with that name.
   * @throws {InvalidSignerError} If the signer doesn't support account derivation.
   * @throws {DisposalError} If the wallet manager or the given signer has been disposed.
   */

  /**
   * Returns the wallet account associated with a registered signer. The signer is used as given, without deriving,
   * and is left untouched when the account is disposed.
   *
   * @overload
   * @param {string} signerName - The signer name registered via {@link addSigner}.
   * @returns {Promise<WalletAccountEvm7702Gasless>} The account.
   * @throws {NoSuchElementError} If no signer exists with the given name.
   * @throws {DisposalError} If the wallet manager or the given signer has been disposed.
   */

  async getAccount (indexOrSignerName = 0, options = {}) {
    if (typeof indexOrSignerName === 'string') {
      if (this.disposed) {
        throw new DisposalError('The wallet manager has been disposed.')
      }

      const key = indexOrSignerName

      if (!this._accounts[key]) {
        const signer = this.getSigner(indexOrSignerName)

        if (signer.disposed) {
          throw new DisposalError('The given signer has been disposed.')
        }

        this._accounts[key] = new WalletAccountEvm7702Gasless(signer, this._accountConfig())
      }

      return this._accounts[key]
    }

    const { signerName } = options

    return await this.getAccountByPath(`0'/0/${indexOrSignerName}`, { signerName })
  }

  /**
   * Returns the wallet account at a specific BIP-44 derivation path.
   *
   * @example
   * // Returns the account with derivation path m/44'/60'/0'/0/1
   * const account = await wallet.getAccountByPath("0'/0/1");
   * @param {string} path - The derivation path (e.g. "0'/0/0").
   * @param {Object} [options] - Account options.
   * @param {string} [options.signerName] - The signer name. Omit to use the default signer.
   * @returns {Promise<WalletAccountEvm7702Gasless>} The account.
   * @throws {NoSuchElementError} If a signer name is given but no signer exists with that name.
   * @throws {InvalidSignerError} If the signer doesn't support account derivation.
   * @throws {DisposalError} If the wallet manager or the given signer has been disposed.
   */
  async getAccountByPath (path, options = {}) {
    if (this.disposed) {
      throw new DisposalError('The wallet manager has been disposed.')
    }

    const { signerName } = options

    const key = signerName ? `${signerName}:${path}` : path

    if (!this._accounts[key]) {
      const signer = this.getSigner(signerName)

      if (signer.disposed) {
        throw new DisposalError('The given signer has been disposed.')
      }

      if (!signer.isDerivable) {
        throw new InvalidSignerError('The signer does not support account derivation.')
      }

      const childSigner = await signer.derive(path)

      // A concurrent call may have cached this account while we were deriving.
      if (this._accounts[key]) {
        childSigner.dispose()
      } else {
        this._accounts[key] = new WalletAccountEvm7702Gasless(childSigner, { ...this._accountConfig(), shouldWipeSignerOnDisposal: true })
      }
    }

    return this._accounts[key]
  }

  /**
   * Returns the current fee rates.
   *
   * @returns {Promise<FeeRates>} The fee rates (in weis).
   * @throws {Error} If the wallet is not connected to a provider.
   */
  async getFeeRates () {
    if (!this._provider) {
      throw new Error('The wallet must be connected to a provider to get fee rates.')
    }

    const data = await this._provider.getFeeData()

    const feeRate = data.maxFeePerGas || data.gasPrice

    return {
      normal: feeRate * WalletManagerEvm._FEE_RATE_NORMAL_MULTIPLIER / 100n,
      fast: feeRate * WalletManagerEvm._FEE_RATE_FAST_MULTIPLIER / 100n
    }
  }

  /**
   * Disposes all the wallet accounts, erasing their private keys from the memory.
   */
  dispose () {
    if (this._shouldWipeDefaultSignerOnDisposal) {
      this._defaultSigner.dispose()
    }

    super.dispose()
  }
}
