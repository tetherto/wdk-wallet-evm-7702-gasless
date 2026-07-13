export default class WalletAccountReadOnlyEvm7702Gasless extends WalletAccountReadOnly {
    /**
     * Creates a new read-only evm 7702 gasless wallet account.
     *
     * @param {string} address - The evm account's address (the EOA address directly).
     * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>} config - The configuration object.
     */
    constructor(address: string, config: Omit<Evm7702GaslessWalletConfig, "transferMaxFee">);
    /**
     * The read-only evm 7702 gasless wallet account configuration.
     *
     * @protected
     * @type {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>}
     */
    protected _config: Omit<Evm7702GaslessWalletConfig, "transferMaxFee">;
    /**
     * An EIP-1193–compatible provider used to interact with the blockchain.
     *
     * Note: the provider type is restricted to EIP-1193 to ensure compatibility
     * with `abstractionkit` and to enable the failover mechanism. While RPC URLs
     * can still be provided in the configuration, they are internally wrapped
     * into an EIP-1193 provider.
     *
     * @protected
     * @type {Eip1193Provider}
     */
    protected _provider: Eip1193Provider;
    /**
     * The chain id.
     *
     * @protected
     * @type {bigint | undefined}
     */
    protected _chainId: bigint | undefined;
    /**
     * Returns the account balances for multiple tokens.
     *
     * @param {string[]} tokenAddresses - The smart contract addresses of the tokens.
     * @returns {Promise<Record<string, bigint>>} A mapping of token addresses to their balances (in base units).
     */
    getTokenBalances(tokenAddresses: string[]): Promise<Record<string, bigint>>;
    /**
     * Returns the account's balance for the paymaster token provided in the wallet account configuration.
     *
     * @returns {Promise<bigint>} The paymaster token balance (in base unit).
     * @throws {ConfigurationError} If no paymaster token is configured (sponsored mode).
     */
    getPaymasterTokenBalance(): Promise<bigint>;
    /**
     * Quotes the costs of a send transaction operation.
     *
     * @param {EvmTransaction | EvmTransaction[]} tx - The transaction, or an array of multiple transactions to send in batch.
     * @param {Partial<Evm7702GaslessSponsorshipPolicyConfig | Evm7702GaslessPaymasterTokenConfig>} [config] - If set, overrides the given configuration options.
     * @returns {Promise<Omit<TransactionResult, 'hash'>>} The transaction's quotes.
     */
    quoteSendTransaction(tx: EvmTransaction | EvmTransaction[], config?: Partial<Evm7702GaslessSponsorshipPolicyConfig | Evm7702GaslessPaymasterTokenConfig>): Promise<Omit<TransactionResult, "hash">>;
    /**
     * Quotes the costs of a transfer operation.
     *
     * @param {EvmTransferOptions} options - The transfer's options.
     * @param {Partial<Evm7702GaslessSponsorshipPolicyConfig | Evm7702GaslessPaymasterTokenConfig>} [config] - If set, overrides the given configuration options.
     * @returns {Promise<Omit<TransferResult, 'hash'>>} The transfer's quotes.
     */
    quoteTransfer(options: EvmTransferOptions, config?: Partial<Evm7702GaslessSponsorshipPolicyConfig | Evm7702GaslessPaymasterTokenConfig>): Promise<Omit<TransferResult, "hash">>;
    /**
     * Returns a transaction's receipt.
     *
     * @param {string} hash - The user operation hash.
     * @returns {Promise<EvmTransactionReceipt | null>} The receipt, or null if the transaction has not been included in a block yet.
     */
    getTransactionReceipt(hash: string): Promise<EvmTransactionReceipt | null>;
    /**
     * Returns a user operation's receipt.
     *
     * @param {string} hash - The user operation hash.
     * @returns {Promise<UserOperationReceipt | null>} The receipt, or null if the user operation has not been included in a block yet.
     */
    getUserOperationReceipt(hash: string): Promise<UserOperationReceipt | null>;
    /**
     * Returns the current allowance for the given token and spender.
     *
     * @param {string} token - The token's address.
     * @param {string} spender - The spender's address.
     * @returns {Promise<bigint>} The allowance.
     */
    getAllowance(token: string, spender: string): Promise<bigint>;
    /**
     * Verifies a typed data signature.
     *
     * @param {TypedData} typedData - The typed data to verify.
     * @param {string} signature - The signature to verify.
     * @returns {Promise<boolean>} True if the signature is valid.
     */
    verifyTypedData(typedData: TypedData, signature: string): Promise<boolean>;
    /**
     * Wraps a string RPC URL or provider into an EIP-1193 compatible provider.
     *
     * @protected
     * @param {string | Eip1193Provider} provider - The url of the rpc provider, or an instance of a class that implements eip-1193.
     * @returns { Eip1193Provider } A wrapped Eip1193Provider instance.
     */
    protected _wrapEip1193Provider(provider: string | Eip1193Provider): Eip1193Provider;
    /**
     * Creates a FailoverProvider from the configured providers. If only one provider is supplied, it is wrapped and returned.
     *
     * @protected
     * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>} [config] - The configuration object.
     * @returns {Eip1193Provider} A wrapped Eip1193Provider instance.
     * @throws {ConfigurationError} If the `provider` option is set to an empty array.
     */
    protected _createFailoverProvider(config?: Omit<Evm7702GaslessWalletConfig, "transferMaxFee">): Eip1193Provider;
    /**
     * Validates the configuration to ensure all required fields are present.
     *
     * @protected
     * @param {Partial<Evm7702GaslessWalletConfig>} config - The configuration to validate.
     * @throws {ConfigurationError} If the configuration is invalid or has missing required fields.
     * @returns {void}
     */
    protected _validateConfig(config: Partial<Evm7702GaslessWalletConfig>): void;
    /**
     * Returns the chain id.
     *
     * @protected
     * @returns {Promise<bigint>} The chain id.
     */
    protected _getChainId(): Promise<bigint>;
    /**
     * Returns a cached abstractionkit Bundler client.
     *
     * @protected
     * @returns {Bundler} The cached bundler client, lazily created on first use.
     */
    protected _getBundler(): Bundler;
    /**
     * Builds a paymaster-sponsored user operation for quoting or sending.
     * Does NOT sign. The caller adds the signature (and, for writes, the
     * pre-signed EIP-7702 authorization in `overrides.eip7702Auth`).
     *
     * Keeps AK's gas estimation enabled on `createUserOperation` so that the
     * +55000 verificationGasLimit padding AK applies to its estimate is
     * preserved. The paymaster pipeline re-estimates with its own fields,
     * so this is an extra bundler round-trip we pay for correctness.
     *
     * @protected
     * @param {EvmTransaction[]} txs - The transactions to batch into the user operation.
     * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>} config - The merged wallet configuration (base config merged with any per-call overrides).
     * @param {BuildSponsoredUserOperationOverrides} [overrides] - Optional overrides for the build step (the pre-signed 7702 authorization and/or an explicit EntryPoint nonce).
     * @returns {Promise<SponsoredUserOperation>} The paymaster-populated user operation plus the token-quote data (when applicable).
     * @throws {Error} If the token paymaster reports AA50 (account does not hold the paymaster token).
     * @throws {ConfigurationError} If the configured `paymasterAddress` does not match the address returned by the paymaster RPC.
     */
    protected _buildSponsoredUserOperation(txs: EvmTransaction[], config: Omit<Evm7702GaslessWalletConfig, "transferMaxFee">, overrides?: BuildSponsoredUserOperationOverrides): Promise<SponsoredUserOperation>;
    /**
     * Builds the user operation and returns the gas cost in the paymaster
     * token's base units. Reached only on the token-paymaster path —
     * sponsored flows short-circuit to a zero fee in `quoteSendTransaction`
     * before calling this method.
     *
     * @protected
     * @param {EvmTransaction[]} txs - The transactions to batch into the user operation.
     * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>} config - The merged wallet configuration.
     * @param {BuildSponsoredUserOperationOverrides} [overrides] - Optional build overrides forwarded to `_buildSponsoredUserOperation` (e.g. an explicit EntryPoint nonce).
     * @returns {Promise<UserOperationGasCost>} The fee plus the built user operation and the token-quote data, cacheable between quote and send.
     */
    protected _getUserOperationGasCost(txs: EvmTransaction[], config: Omit<Evm7702GaslessWalletConfig, "transferMaxFee">, overrides?: BuildSponsoredUserOperationOverrides): Promise<UserOperationGasCost>;
    /** @private */
    private _getSmartAccount;
    /** @private */
    private _getPaymaster;
    /** @private */
    private _getEvmReadOnlyAccount;
    /** @private */
    private _buildPaymasterContext;
    /** @private */
    private _estimateFeesPerGas;
    /** @private */
    private _getTokenExchangeRate;
    /** @private */
    private _smartAccount;
    private _bundler;
    private _paymaster;
    private _evmReadOnlyAccount;
}
export type Eip1193Provider = import("ethers").Eip1193Provider;
export type EvmTransaction = import("@tetherto/wdk-wallet-evm").EvmTransaction;
export type TransactionResult = import("@tetherto/wdk-wallet-evm").TransactionResult;
export type EvmTransferOptions = import("@tetherto/wdk-wallet-evm").EvmTransferOptions;
export type TransferResult = import("@tetherto/wdk-wallet-evm").TransferResult;
export type EvmTransactionReceipt = import("@tetherto/wdk-wallet-evm").EvmTransactionReceipt;
export type TypedData = import("@tetherto/wdk-wallet-evm").TypedData;
export type UserOperationV8 = import("abstractionkit").UserOperationV8;
export type UserOperationReceipt = import("abstractionkit").UserOperationReceiptResult;
export type TokenQuote = import("abstractionkit").TokenQuote;
export type Eip7702AuthorizationOverride = {
    /**
     * - The chain id the authorization was signed for.
     */
    chainId: bigint;
    /**
     * - The delegate contract address (the EOA's new code).
     */
    address: string;
    /**
     * - The EOA's transaction nonce at signing time.
     */
    nonce: bigint;
    /**
     * - The y-parity bit of the signature, encoded as `'0x0'` or `'0x1'`.
     */
    yParity: string;
    /**
     * - The r component of the ECDSA signature (32-byte hex).
     */
    r: string;
    /**
     * - The s component of the ECDSA signature (32-byte hex).
     */
    s: string;
};
export type BuildSponsoredUserOperationOverrides = {
    /**
     * - Pre-signed EIP-7702 authorization tuple to include in the user operation.
     */
    eip7702Auth?: Eip7702AuthorizationOverride;
    /**
     * - Explicit EntryPoint nonce for the user operation. When omitted, abstractionkit derives it from the on-chain nonce.
     */
    nonce?: bigint;
};
export type SponsoredUserOperation = {
    /**
     * - The paymaster-populated user operation, ready to sign.
     */
    userOperation: UserOperationV8;
    /**
     * - Token-paymaster fee data. Populated on the token-payment flow; absent on sponsored flows.
     */
    tokenQuote?: TokenQuote;
};
export type UserOperationGasCost = {
    /**
     * - The estimated fee with no tolerance buffer applied. For sponsored flows it's in wei; for token-paymaster flows it's in the paymaster token's base units.
     */
    fee: bigint;
    /**
     * - The paymaster-populated user operation built during the quote, reusable for sendTransaction.
     */
    sponsoredOp: UserOperationV8;
    /**
     * - Token-paymaster fee data. Populated on the token-payment flow; absent on sponsored flows.
     */
    tokenQuote?: TokenQuote;
};
export type Evm7702GaslessWalletCommonConfig = {
    /**
     * - The url of the rpc provider, or an instance of a class that implements eip-1193. It's also possible to provide an array of urls or EIP 1193 providers instead. In such case, connection errors will cause the wallet to automatically fallback on the next provider in the list.
     */
    provider: string | Eip1193Provider | (string | Eip1193Provider)[];
    /**
     * - If set and if 'provider' is a list of urls or EIP 1193 providers, the number of additional retry attempts after the initial call fails. Total attempts = `1 + retries`. For example, `retries: 3` with 4 providers will try each provider once before throwing. If `retries` exceeds the number of providers, the failover will loop back and retry already-failed providers in round-robin order. Default: 3.
     */
    retries?: number;
    /**
     * - The url of the bundler/paymaster service.
     */
    bundlerUrl: string;
    /**
     * - The url of the paymaster service when it differs from bundlerUrl. Omit when one url serves both the bundler and paymaster (e.g. Candide, Pimlico).
     */
    paymasterUrl?: string;
    /**
     * - The address of the smart account implementation to delegate to (e.g. '0xe6Cae83BdE06E4c305530e199D7217f42808555B' for SimpleAccount).
     */
    delegationAddress: string;
};
export type Evm7702GaslessSponsorshipPolicyConfig = {
    /**
     * - Whether the paymaster is sponsoring the account.
     */
    isSponsored: true;
    /**
     * - The sponsorship policy ID (e.g. for Pimlico or Candide).
     */
    sponsorshipPolicyId?: string;
};
export type Evm7702GaslessPaymasterTokenConfig = {
    /**
     * - Whether the paymaster is sponsoring the account.
     */
    isSponsored?: false;
    /**
     * - Optional pin on the paymaster smart contract address. When omitted, it's derived from the paymaster RPC (pm_supportedERC20Tokens for Candide, pimlico_getTokenQuotes for Pimlico).
     */
    paymasterAddress?: string;
    /**
     * - The paymaster token configuration.
     */
    paymasterToken: {
        address: string;
    };
    /**
     * - The maximum fee amount for transfer operations.
     */
    transferMaxFee?: number | bigint;
};
export type Evm7702GaslessWalletConfig = Evm7702GaslessWalletCommonConfig & (Evm7702GaslessSponsorshipPolicyConfig | Evm7702GaslessPaymasterTokenConfig);
import { WalletAccountReadOnly } from '@tetherto/wdk-wallet';
import { Simple7702Account } from 'abstractionkit';
import { Bundler } from 'abstractionkit';
import { Erc7677Paymaster } from 'abstractionkit';
