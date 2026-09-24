export default class WalletAccountReadOnlyEvm7702Gasless extends WalletAccountReadOnly {
    /**
     * Adapts an ethers provider (or failover aggregate) to the EIP-1193 interface required by
     * abstractionkit, without constructing a new provider. Already-EIP-1193 objects (e.g. a browser
     * wallet) are returned as-is; ethers providers are wrapped so `request` forwards to `send`,
     * reusing the same underlying connection.
     *
     * @protected
     * @param {Provider | Eip1193Provider} provider - The ethers provider (or EIP-1193 provider) to adapt.
     * @returns {Eip1193Provider} An EIP-1193-compatible provider that reuses the given client.
     */
    protected static _asEip1193(provider: Provider | Eip1193Provider): Eip1193Provider;
    /**
     * Builds the single shared ethers provider from the configuration: a url string ->
     * `JsonRpcProvider`, an already-built ethers provider -> reused as-is, an EIP-1193 provider ->
     * wrapped in a `BrowserProvider`, and a list of the above -> a `FailoverProvider` that only
     * fails over on connectivity errors. A manager builds one instance and shares it with every
     * account.
     *
     * @protected
     * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee' | 'transactionMaxFee'>} [config] - The configuration object.
     * @returns {Provider | undefined} The shared provider, or undefined if none is configured.
     * @throws {ConfigurationError} If the `provider` option is set to an empty array.
     */
    protected static _buildProvider(config?: Omit<Evm7702GaslessWalletConfig, "transferMaxFee" | "transactionMaxFee">): Provider | undefined;
    /**
     * Creates a new read-only evm 7702 gasless wallet account.
     *
     * @param {string} address - The evm account's address (the EOA address directly).
     * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee' | 'transactionMaxFee'>} config - The configuration object.
     */
    constructor(address: string, config: Omit<Evm7702GaslessWalletConfig, "transferMaxFee" | "transactionMaxFee">);
    /**
     * The read-only evm 7702 gasless wallet account configuration.
     *
     * @protected
     * @type {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee' | 'transactionMaxFee'>}
     */
    protected _config: Omit<Evm7702GaslessWalletConfig, "transferMaxFee" | "transactionMaxFee">;
    /**
     * The shared ethers provider used to interact with the blockchain. A single instance is
     * built here (or reused from the manager) and passed to every nested `WalletAccountReadOnlyEvm`
     * so accounts do not open their own connection.
     *
     * @protected
     * @type {Provider}
     */
    protected _provider: Provider;
    /**
     * The EIP-1193 view of {@link _provider} that abstractionkit requires. Backed by the same
     * underlying connection as {@link _provider}.
     *
     * @protected
     * @type {Eip1193Provider}
     */
    protected _eip1193Provider: Eip1193Provider;
    /**
     * The chain id.
     *
     * @protected
     * @type {bigint | undefined}
     */
    protected _chainId: bigint | undefined;
    /** @private */
    private _smartAccount;
    /** @private */
    private _bundler;
    /** @private */
    private _paymaster;
    /** @private */
    private _evmReadOnlyAccount;
    /**
     * Returns the account's eth balance.
     *
     * @returns {Promise<bigint>} The eth balance (in weis).
     */
    getBalance(): Promise<bigint>;
    /**
     * Returns the account balance for a specific token.
     *
     * @param {string} tokenAddress - The smart contract address of the token.
     * @returns {Promise<bigint>} The token balance (in base unit).
     */
    getTokenBalance(tokenAddress: string): Promise<bigint>;
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
     * @deprecated Use {@link getTransaction} instead, which returns a normalized, finality-based receipt. The raw ethers receipt and the user operation receipt remain available on its `receipt` and `userOperationReceipt` properties.
     * @param {string} hash - The user operation hash.
     * @returns {Promise<EvmTransactionReceipt | null>} The receipt, or null if the transaction has not been included in a block yet.
     */
    getTransactionReceipt(hash: string): Promise<EvmTransactionReceipt | null>;
    /**
     * Returns a normalized, finality-based receipt for a user operation. Finality and confirmations come from the bundling transaction; `success` and `fee` come from the user operation.
     *
     * @param {string} hash - The user operation hash.
     * @returns {Promise<TransactionReceipt & Evm7702GaslessTransactionDetails>} The normalized receipt.
     * @throws {ValueError} If the hash is not a valid user operation hash.
     * @throws {NoSuchElementError} If no user operation has been found for the given hash.
     */
    getTransaction(hash: string): Promise<TransactionReceipt & Evm7702GaslessTransactionDetails>;
    /**
     * Blocks until a user operation reaches a terminal state (the requested finality target or `dropped`), or times out.
     *
     * @param {string} hash - The user operation hash.
     * @param {WaitForTransactionOptions} [options] - The wait options.
     * @returns {Promise<TransactionReceipt & Evm7702GaslessTransactionDetails>} The terminal receipt: the finality target reached (inspect `success` to tell success from revert), or `dropped`.
     * @throws {TimeoutError} If the target is not reached before the timeout.
     */
    waitForTransaction(hash: string, options?: WaitForTransactionOptions): Promise<TransactionReceipt & Evm7702GaslessTransactionDetails>;
    /**
     * Overrides the base default to allow for slower gasless/bundler inclusion and confirmation.
     *
     * @type {number}
     */
    get defaultWaitTimeout(): number;
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
     * Verifies a message's signature.
     *
     * @param {string} message - The original message.
     * @param {string} signature - The signature to verify.
     * @returns {Promise<boolean>} True if the signature is valid.
     */
    verify(message: string, signature: string): Promise<boolean>;
    /**
     * Verifies a typed data signature.
     *
     * @param {TypedData} typedData - The typed data to verify.
     * @param {string} signature - The signature to verify.
     * @returns {Promise<boolean>} True if the signature is valid.
     */
    verifyTypedData(typedData: TypedData, signature: string): Promise<boolean>;
    /**
     * Builds the EIP-1193 view that abstractionkit needs. A caller-supplied EIP-1193 provider is
     * reused directly (so abstractionkit talks to it without an extra `BrowserProvider` round-trip);
     * otherwise the shared ethers provider is adapted so `request` forwards to `send`. Both share the
     * same underlying connection as {@link _provider}.
     *
     * @protected
     * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee' | 'transactionMaxFee'>} config - The configuration object.
     * @param {Provider} provider - The shared ethers provider built from `config`.
     * @returns {Eip1193Provider} The EIP-1193 provider that reuses the given connection.
     */
    protected _buildEip1193Provider(config: Omit<Evm7702GaslessWalletConfig, "transferMaxFee" | "transactionMaxFee">, provider: Provider): Eip1193Provider;
    /**
     * Validates the configuration to ensure all required fields are present and that
     * the selected EntryPoint version and delegation implementation are compatible.
     *
     * @protected
     * @param {Partial<Evm7702GaslessWalletConfig>} config - The configuration to validate.
     * @throws {ConfigurationError} If the configuration is invalid or has missing required fields.
     * @throws {ConfigurationError} If `entryPointVersion` is not a supported EntryPoint version.
     * @throws {ConfigurationError} If `delegationAddress` is the reference implementation of an EntryPoint version other than the configured one.
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
     * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee' | 'transactionMaxFee'>} config - The merged wallet configuration (base config merged with any per-call overrides).
     * @param {BuildSponsoredUserOperationOverrides} [overrides] - Optional overrides for the build step (currently only the pre-signed 7702 authorization).
     * @returns {Promise<SponsoredUserOperation>} The paymaster-populated user operation plus the token-quote data (when applicable).
     * @throws {Error} If the token paymaster reports AA50 (account does not hold the paymaster token).
     * @throws {ConfigurationError} If the configured `paymasterAddress` does not match the address returned by the paymaster RPC.
     */
    protected _buildSponsoredUserOperation(txs: EvmTransaction[], config: Omit<Evm7702GaslessWalletConfig, "transferMaxFee" | "transactionMaxFee">, overrides?: BuildSponsoredUserOperationOverrides): Promise<SponsoredUserOperation>;
    /**
     * Returns the EntryPoint version the account operates under, as selected by the
     * `entryPointVersion` configuration field. Every other EntryPoint-dependent
     * operation of the account resolves through it.
     *
     * @protected
     * @returns {Promise<'0.8' | '0.9'>} The selected EntryPoint version.
     */
    protected _getEntryPointVersion(): Promise<"0.8" | "0.9">;
    /**
     * Returns the address of the EntryPoint the account operates under.
     *
     * @protected
     * @returns {Promise<string>} The address of the EntryPoint user operations are submitted to and nonces are read from.
     */
    protected _getEntryPointAddress(): Promise<string>;
    /**
     * Builds the EIP-712 payload that authorizes a user operation under the
     * EntryPoint version the account operates under.
     *
     * @protected
     * @param {UserOperationV8} userOp - The user operation to authorize.
     * @param {bigint} chainId - The id of the chain the user operation is signed for.
     * @returns {Promise<TypedData>} The typed data to sign.
     */
    protected _getUserOperationTypedData(userOp: UserOperationV8, chainId: bigint): Promise<TypedData>;
    /** @private */
    private _getEntryPoint;
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
    /**
     * Builds the user operation and returns the gas cost in the paymaster
     * token's base units. Reached only on the token-paymaster path —
     * sponsored flows short-circuit to a zero fee in `quoteSendTransaction`
     * before calling this method.
     *
     * @protected
     * @param {EvmTransaction[]} txs - The transactions to batch into the user operation.
     * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee' | 'transactionMaxFee'>} config - The merged wallet configuration.
     * @param {BuildSponsoredUserOperationOverrides} [overrides] - Optional build overrides forwarded to `_buildSponsoredUserOperation` (e.g. an explicit EntryPoint nonce).
     * @returns {Promise<UserOperationGasCost>} The fee plus the built user operation and the token-quote data, cacheable between quote and send.
     */
    protected _getUserOperationGasCost(txs: EvmTransaction[], config: Omit<Evm7702GaslessWalletConfig, "transferMaxFee" | "transactionMaxFee">, overrides?: BuildSponsoredUserOperationOverrides): Promise<UserOperationGasCost>;
}
export type Provider = import("ethers").Provider;
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
export type TransactionReceipt = import("@tetherto/wdk-wallet").TransactionReceipt;
export type WaitForTransactionOptions = import("@tetherto/wdk-wallet").WaitForTransactionOptions;
/**
 * The EVM 7702 gasless-specific fields added to a normalized transaction receipt.
 */
export type Evm7702GaslessTransactionDetails = {
    /**
     * - The number of confirmations (0 while pending or dropped).
     */
    confirmations: number;
    /**
     * - The native ethers receipt of the bundling transaction, or null while the user operation is pending or dropped.
     */
    receipt: EvmTransactionReceipt | null;
    /**
     * - The user operation receipt, or null while the user operation is pending or its receipt is not yet available.
     */
    userOperationReceipt: UserOperationReceipt | null;
};
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
     * - Explicit EntryPoint nonce for the user operation. When omitted, the account derives it from the on-chain nonce.
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
     * - The url of the rpc provider, an already-built ethers `Provider` (reused as-is), or an instance of a class that implements eip-1193. It's also possible to provide an array of these instead. In such case, connection errors will cause the wallet to automatically fallback on the next provider in the list.
     */
    provider: string | Provider | Eip1193Provider | (string | Provider | Eip1193Provider)[];
    /**
     * - The chain id the wallet operates on (e.g. 1 for ethereum). When set, every UserOperation build asserts the provider reports this chain and throws `ConfigurationError` on mismatch before anything is built or signed; the underlying read-only account also pins to a static network, skipping per-call chain detection. When omitted, the provider's reported chain is trusted.
     */
    chainId?: number;
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
     * - The address of the smart account implementation to delegate to. It must be an implementation built for the configured `entryPointVersion` (e.g. '0xe6Cae83BdE06E4c305530e199D7217f42808555B' for SimpleAccount on EntryPoint v0.8, '0xa46cc63eBF4Bd77888AA327837d20b23A63a56B5' on v0.9).
     */
    delegationAddress: string;
    /**
     * - The ERC-4337 EntryPoint version the account operates under. It selects the EntryPoint address and the matching account implementation together. Default: '0.8'.
     */
    entryPointVersion?: "0.8" | "0.9";
    /**
     * - When true, each send is placed in a fresh, independent nonce lane (a random 192-bit key at sequence 0) so concurrent or back-to-back sends don't collide on the nonce. Ordering between such sends is not guaranteed and each consumes a new EntryPoint nonce slot. Ignored when `nonceKey` is set. Overridable per call.
     */
    parallel?: boolean;
    /**
     * - Send in an explicit nonce lane. A string is hashed to a deterministic key — a reusable named lane that resumes the same sequence across sessions; a number or bigint is used as the raw uint192 key and must be within the uint192 range (0 to 2^192 - 1), otherwise the send throws (pass a bigint or string for keys above 2^53). Sends sharing a key are ordered sequentially; different keys run in parallel. Overridable per call.
     */
    nonceKey?: number | bigint | string;
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
     * - The maximum fee, in the paymaster token's base units, accepted for transfer. Ignored when the transaction is sponsored.
     */
    transferMaxFee?: number | bigint;
    /**
     * - The maximum fee, in the paymaster token's base units, accepted for sendTransaction, signTransaction and approve. Ignored when the transaction is sponsored.
     */
    transactionMaxFee?: number | bigint;
};
export type Evm7702GaslessWalletConfig = Evm7702GaslessWalletCommonConfig & (Evm7702GaslessSponsorshipPolicyConfig | Evm7702GaslessPaymasterTokenConfig);
import { WalletAccountReadOnly } from '@tetherto/wdk-wallet';
import { Bundler } from 'abstractionkit';
