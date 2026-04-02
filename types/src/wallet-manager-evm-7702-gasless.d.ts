/** @typedef {import('ethers').Provider} Provider */
/** @typedef {import('@tetherto/wdk-wallet-evm').FeeRates} FeeRates */
/** @typedef {import('./wallet-account-evm-7702-gasless.js').Evm7702GaslessWalletConfig} Evm7702GaslessWalletConfig */
export default class WalletManagerEvm7702Gasless extends WalletManager {
    /**
     * Creates a new wallet manager for evm blockchains that implements the 7702 standard for gasless account abstraction.
     *
     * @param {string | Uint8Array} seed - The wallet's [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) seed phrase.
     * @param {Evm7702GaslessWalletConfig} config - The configuration object.
     */
    constructor(seed: string | Uint8Array, config: Evm7702GaslessWalletConfig);
    /**
     * An ethers provider to interact with a node of the blockchain.
     *
     * @protected
     * @type {Provider | undefined}
     */
    protected _provider: Provider | undefined;
    /**
     * Returns the wallet account at a specific index (see [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)).
     *
     * @example
     * // Returns the account with derivation path m/44'/60'/0'/0/1
     * const account = await wallet.getAccount(1);
     * @param {number} [index] - The index of the account to get (default: 0).
     * @returns {Promise<WalletAccountEvm7702Gasless>} The account.
     */
    getAccount(index?: number): Promise<WalletAccountEvm7702Gasless>;
    /**
     * Returns the wallet account at a specific BIP-44 derivation path.
     *
     * @example
     * // Returns the account with derivation path m/44'/60'/0'/0/1
     * const account = await wallet.getAccountByPath("0'/0/1");
     * @param {string} path - The derivation path (e.g. "0'/0/0").
     * @returns {Promise<WalletAccountEvm7702Gasless>} The account.
     */
    getAccountByPath(path: string): Promise<WalletAccountEvm7702Gasless>;
}
export type Provider = import("ethers").Provider;
export type FeeRates = import("@tetherto/wdk-wallet-evm").FeeRates;
export type Evm7702GaslessWalletConfig = import("./wallet-account-evm-7702-gasless.js").Evm7702GaslessWalletConfig;
import WalletManager from '@tetherto/wdk-wallet';
import WalletAccountEvm7702Gasless from './wallet-account-evm-7702-gasless.js';
