/** @implements {IWalletAccount} */
export default class WalletAccountEvm7702Gasless extends WalletAccountReadOnlyEvm7702Gasless implements IWalletAccount {
    /**
     * Creates a new evm 7702 gasless wallet account.
     *
     * @overload
     * @param {string | Uint8Array} seedOrAccount - The wallet's BIP-39 seed phrase.
     * @param {string} path - The BIP-44 derivation path (e.g. "0'/0/0").
     * @param {Evm7702GaslessWalletConfig} config - The configuration object.
     */
    constructor(seedOrAccount: string | Uint8Array, path: string, config: Evm7702GaslessWalletConfig);
    /**
     * Creates a new evm 7702 gasless wallet account from an existing wallet-evm account.
     *
     * @overload
     * @param {WalletAccountEvm} seedOrAccount - An existing WalletAccountEvm instance.
     * @param {Evm7702GaslessWalletConfig} config - The configuration object.
     */
    constructor(seedOrAccount: WalletAccountEvm, config: Evm7702GaslessWalletConfig);
    /** @private */
    private _ownerAccount;
    /** @private */
    private _smartAccountClient;
    /**
     * The derivation path's index of this account.
     *
     * @type {number}
     */
    get index(): number;
    /**
     * The derivation path of this account (see [BIP-44](https://github.com/bitcoin/bips/blob/master/bip-0044.mediawiki)).
     *
     * @type {string}
     */
    get path(): string;
    /**
     * The account's key pair.
     *
     * @type {KeyPair}
     */
    get keyPair(): KeyPair;
    /**
     * Signs a message.
     *
     * @param {string} message - The message to sign.
     * @returns {Promise<string>} The message's signature.
     */
    sign(message: string): Promise<string>;
    /**
     * Signs typed data according to EIP-712.
     *
     * @param {TypedData} typedData - The typed data to sign.
     * @returns {Promise<string>} The typed data signature.
     */
    signTypedData({ domain, types, message }: TypedData): Promise<string>;
    /**
     * Approves a specific amount of tokens to a spender.
     *
     * @param {ApproveOptions} options - The approve options.
     * @returns {Promise<TransactionResult>} The transaction's result.
     * @throws {Error} If trying to approve usdts on ethereum with allowance not equal to zero (due to the usdt allowance reset requirement).
     */
    approve(options: ApproveOptions): Promise<TransactionResult>;
    /**
     * Sends a transaction.
     *
     * @param {EvmTransaction | EvmTransaction[]} tx - The transaction, or an array of multiple transactions to send in batch.
     * @param {Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>} [config] - If set, overrides the given configuration options.
     * @returns {Promise<TransactionResult>} The transaction's result.
     */
    sendTransaction(tx: EvmTransaction | EvmTransaction[], config?: Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>): Promise<TransactionResult>;
    /**
     * Transfers a token to another address.
     *
     * @param {EvmTransferOptions} options - The transfer's options.
     * @param {Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>} [config] - If set, overrides the given configuration options.
     * @returns {Promise<TransferResult>} The transfer's result.
     */
    transfer(options: EvmTransferOptions, config?: Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>): Promise<TransferResult>;
    /**
     * Returns a read-only copy of the account.
     *
     * @returns {Promise<WalletAccountReadOnlyEvm7702Gasless>} The read-only account.
     */
    toReadOnlyAccount(): Promise<WalletAccountReadOnlyEvm7702Gasless>;
    /**
     * Disposes the wallet account, erasing the private key from the memory.
     */
    dispose(): void;
    /** @private */
    private _getViemOwner;
    /** @private */
    private _getSmartAccountClient;
    /** @private */
    private _getAuthorization;
    /**
     * Estimates the gas cost of a user operation using the smart account client.
     *
     * @protected
     * @param {EvmTransaction[]} txs - The transactions.
     * @param {Evm7702GaslessWalletConfig} config - The configuration.
     * @returns {Promise<bigint>} The estimated gas cost.
     */
    protected _getUserOperationGasCost(txs: EvmTransaction[], config: Evm7702GaslessWalletConfig): Promise<bigint>;
    /** @private */
    private _sendUserOperation;
    /** @private */
    private _getPaymasterApprovalCalls;
}
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
export type KeyPair = import("@tetherto/wdk-wallet-evm").KeyPair;
export type EvmTransaction = import("@tetherto/wdk-wallet-evm").EvmTransaction;
export type TransactionResult = import("@tetherto/wdk-wallet-evm").TransactionResult;
export type EvmTransferOptions = import("@tetherto/wdk-wallet-evm").EvmTransferOptions;
export type TransferResult = import("@tetherto/wdk-wallet-evm").TransferResult;
export type ApproveOptions = import("@tetherto/wdk-wallet-evm").ApproveOptions;
export type Evm7702GaslessWalletConfig = import("./wallet-account-read-only-evm-7702-gasless.js").Evm7702GaslessWalletConfig;
export type Evm7702GaslessPaymasterTokenConfig = import("./wallet-account-read-only-evm-7702-gasless.js").Evm7702GaslessPaymasterTokenConfig;
export type Evm7702GaslessSponsorshipPolicyConfig = import("./wallet-account-read-only-evm-7702-gasless.js").Evm7702GaslessSponsorshipPolicyConfig;
export type TypedData = import("./wallet-account-read-only-evm-7702-gasless.js").TypedData;
export type SmartAccountClient = import("permissionless").SmartAccountClient;
import WalletAccountReadOnlyEvm7702Gasless from './wallet-account-read-only-evm-7702-gasless.js';
import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm';
