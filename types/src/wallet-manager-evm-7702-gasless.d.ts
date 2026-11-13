/** @extends {WalletManager<ISignerEvm>} */
export default class WalletManagerEvm7702Gasless extends WalletManager<ISignerEvm> {
    /**
     * Creates a new wallet manager for evm blockchains that implements the 7702 standard for gasless account abstraction.
     *
     * @overload
     * @param {string | Uint8Array} seed - A [BIP-39](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
     * @param {Evm7702GaslessWalletConfig} config - The configuration object.
     */
    constructor(seed: string | Uint8Array, config: Evm7702GaslessWalletConfig);
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
    constructor(signer: ISignerEvm, config: Evm7702GaslessWalletConfig);
    /**
     * If true, disposes the default signer on calls to the 'dispose' method.
     *
     * @protected
     * @type {boolean}
     */
    protected _shouldWipeDefaultSignerOnDisposal: boolean;
    /**
     * The shared ethers provider to interact with a node of the blockchain. Built once here and
     * passed to every account this manager creates so they reuse a single connection.
     *
     * @protected
     * @type {Provider | undefined}
     */
    protected _provider: Provider | undefined;
    /**
     * Returns the configuration used to create accounts, with the manager's shared provider injected
     * last so it is not overwritten by the original `provider` option.
     *
     * @private
     * @returns {Evm7702GaslessWalletConfig} The account configuration.
     */
    private _accountConfig;
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
    getAccount(index?: number, options?: {
        signerName?: string;
    }): Promise<WalletAccountEvm7702Gasless>;
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
    getAccount(signerName: string): Promise<WalletAccountEvm7702Gasless>;
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
    getAccountByPath(path: string, options?: {
        signerName?: string;
    }): Promise<WalletAccountEvm7702Gasless>;
    /**
     * Returns the current fee rates.
     *
     * @returns {Promise<FeeRates>} The fee rates (in weis).
     * @throws {Error} If the wallet is not connected to a provider.
     */
    getFeeRates(): Promise<FeeRates>;
    /**
     * Disposes all the wallet accounts, erasing their private keys from the memory.
     */
    dispose(): void;
}
export type Provider = import("ethers").Provider;
export type FeeRates = import("@tetherto/wdk-wallet-evm").FeeRates;
export type ISignerEvm = import("@tetherto/wdk-wallet-evm/signers").ISignerEvm;
export type NoSuchElementError = import("@tetherto/wdk-wallet").NoSuchElementError;
export type Evm7702GaslessWalletConfig = import("./wallet-account-evm-7702-gasless.js").Evm7702GaslessWalletConfig;
import WalletManager from '@tetherto/wdk-wallet';
import WalletAccountEvm7702Gasless from './wallet-account-evm-7702-gasless.js';
