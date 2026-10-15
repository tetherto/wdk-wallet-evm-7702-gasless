/** @implements {IWalletAccount} */
export default class WalletAccountEvm7702Gasless extends WalletAccountReadOnlyEvm7702Gasless implements IWalletAccount {
    /**
     * Determines whether a value is an already-signed UserOperation (as returned by `signTransaction`)
     * rather than an unsigned {@link EvmTransaction} (or array of them).
     *
     * @private
     * @param {EvmTransaction | EvmTransaction[] | UserOperationV8} tx - The value to inspect.
     * @returns {boolean} True if the value is a signed UserOperation.
     */
    private static _isSignedUserOperation;
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
    private static _getSignedUserOperationFee;
    /** @private */
    private static _getTxKey;
    /**
     * Creates a new evm 7702 gasless wallet account.
     *
     * @overload
     * @param {string | Uint8Array} seed - A BIP-39 mnemonic seed phrase, or a raw BIP-32 master seed (16-64 bytes).
     * @param {string} path - The BIP-44 derivation path (e.g. "0'/0/0").
     * @param {Evm7702GaslessWalletConfig} config - The configuration object.
     */
    constructor(seed: string | Uint8Array, path: string, config: Evm7702GaslessWalletConfig);
    /**
     * Creates a new evm 7702 gasless wallet account from a wallet-evm account.
     *
     * @overload
     * @param {Evm7702GaslessOwnerAccount} account - A compatible wallet-evm account, including one from another installed copy of the package.
     * @param {Evm7702GaslessWalletConfig} config - The configuration object.
     * @throws {ConfigurationError} If the account has no valid address or required signing or disposal method.
     */
    constructor(account: Evm7702GaslessOwnerAccount, config: Evm7702GaslessWalletConfig);
    /** @private */
    private _ownerAccount;
    /** @private */
    private _evm7702GaslessReadOnlyAccount;
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
    private _quoteCache;
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
     * The uint8 arrays are bound to the wallet account, so any external change will reflect to the internal representation. For this reason,
     * it's strongly recommended to treat the key pair as a read-only view of the keys. While it's still technically possible to alter their
     * content, client code should never do so.
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
    signTransaction(tx: EvmTransaction | EvmTransaction[], config?: Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>): Promise<UserOperationV8>;
    /**
     * Approves a specific amount of tokens to a spender.
     *
     * @param {ApproveOptions} options - The approve options.
     * @returns {Promise<TransactionResult>} The transaction's result.
     * @throws {Error} If trying to approve usdts on ethereum with allowance not equal to zero (due to the usdt allowance reset requirement).
     * @throws {Error} If the transaction is not sponsored, and the transaction's cost surpasses the transaction max. fee option.
     */
    approve(options: ApproveOptions): Promise<TransactionResult>;
    /**
     * Quotes the costs of a send transaction operation. Caches the built user
     * operation against the serialized transaction so that a subsequent
     * sendTransaction / signTransaction / transfer call with the same tx can skip the
     * gas-estimation + paymaster round-trip, after a lightweight on-chain nonce check that
     * re-quotes only if the nonce has moved. Cache entries expire after 2 minutes.
     *
     * An already-signed user operation (as returned by `signTransaction`) may also be passed; in that
     * case its fee is read from its own gas fields (in token-paymaster mode this reflects the native
     * gas ceiling, not the token amount) and no gas-estimation or paymaster round-trip is performed.
     *
     * @param {EvmTransaction | EvmTransaction[] | UserOperationV8} tx - The transaction, an array of multiple transactions to send in batch, or an already-signed user operation.
     * @param {Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>} [config] - If set, overrides the given configuration options.
     * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
     */
    quoteSendTransaction(tx: EvmTransaction | EvmTransaction[] | UserOperationV8, config?: Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>): Promise<Omit<TransactionResult, "hash">>;
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
    sendTransaction(tx: EvmTransaction | EvmTransaction[] | UserOperationV8, config?: Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>): Promise<TransactionResult>;
    /**
     * Transfers a token to another address.
     *
     * @param {EvmTransferOptions} options - The transfer's options.
     * @param {Partial<Evm7702GaslessPaymasterTokenConfig | Evm7702GaslessSponsorshipPolicyConfig>} [config] - If set, overrides the given configuration options.
     * @returns {Promise<TransferResult>} The transfer's result.
     * @throws {Error} If the estimated fee meets or exceeds the configured `transferMaxFee`.
     * @throws {Error} If `nonceKey` is a bigint outside the uint192 range (0 to 2^192 - 1).
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
    private _getAuthorization;
    /** @private */
    private _prepareForSend;
    /** @private */
    private _signPreparedUserOperation;
    /** @private */
    private _sendUserOperation;
    /**
     * Broadcasts an already-signed user operation directly to the bundler.
     *
     * @private
     * @param {UserOperationV8} userOp - The signed user operation.
     * @returns {Promise<string>} The user operation hash.
     */
    private _broadcastSignedUserOperation;
    /** @private */
    private _consumeFreshQuote;
    /** @private */
    private _resolveNonce;
    /** @private */
    private _consumeCachedQuote;
    /** @private */
    private _sweepExpiredQuotes;
}
export type IWalletAccount = import("@tetherto/wdk-wallet").IWalletAccount;
export type KeyPair = import("@tetherto/wdk-wallet-evm").KeyPair;
export type EvmTransaction = import("@tetherto/wdk-wallet-evm").EvmTransaction;
export type TransactionResult = import("@tetherto/wdk-wallet-evm").TransactionResult;
export type EvmTransferOptions = import("@tetherto/wdk-wallet-evm").EvmTransferOptions;
export type TransferResult = import("@tetherto/wdk-wallet-evm").TransferResult;
export type ApproveOptions = import("@tetherto/wdk-wallet-evm").ApproveOptions;
export type UserOperationV8 = import("abstractionkit").UserOperationV8;
export type TokenQuote = import("abstractionkit").TokenQuote;
export type Evm7702GaslessWalletConfig = import("./wallet-account-read-only-evm-7702-gasless.js").Evm7702GaslessWalletConfig;
export type Evm7702GaslessPaymasterTokenConfig = import("./wallet-account-read-only-evm-7702-gasless.js").Evm7702GaslessPaymasterTokenConfig;
export type Evm7702GaslessSponsorshipPolicyConfig = import("./wallet-account-read-only-evm-7702-gasless.js").Evm7702GaslessSponsorshipPolicyConfig;
export type TypedData = import("./wallet-account-read-only-evm-7702-gasless.js").TypedData;
/**
 * The public wallet-evm account capabilities used by the gasless wallet. The address must
 * already be resolved; signing and disposal are delegated to the supplied account.
 */
export type Evm7702GaslessOwnerAccount = Pick<WalletAccountEvm, "address" | "index" | "path" | "keyPair" | "sign" | "signTypedData" | "signAuthorization" | "dispose">;
export type TransactionQuote = {
    /**
     * - The estimated fee.
     */
    fee: bigint;
    /**
     * - Timestamp from Date.now() at cache insertion, used for TTL eviction.
     */
    createdAt: number;
    /**
     * - The paymaster-populated user operation, reusable for sendTransaction.
     */
    sponsoredOp: UserOperationV8;
    /**
     * - Token-paymaster fee data. Populated on the token-payment flow; absent on sponsored flows.
     */
    tokenQuote?: TokenQuote;
};
import WalletAccountReadOnlyEvm7702Gasless from './wallet-account-read-only-evm-7702-gasless.js';
import { WalletAccountEvm } from '@tetherto/wdk-wallet-evm';
