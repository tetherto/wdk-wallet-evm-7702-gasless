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
     * Cached viem clients.
     *
     * @protected
     * @type {{ publicClient: PublicClient, bundlerClient: BundlerClient, chain: ViemChain } | null}
     */
    protected _viemClients: {
        publicClient: PublicClient;
        bundlerClient: BundlerClient;
        chain: ViemChain;
    } | null;
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
     * Validates the configuration to ensure all required fields are present.
     *
     * @protected
     * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>} config - The configuration to validate.
     * @throws {ConfigurationError} If the configuration is invalid or has missing required fields.
     * @returns {void}
     */
    protected _validateConfig(config: Omit<Evm7702GaslessWalletConfig, "transferMaxFee">): void;
    /**
     * Returns cached viem clients (publicClient + bundlerClient).
     *
     * @protected
     * @param {Omit<Evm7702GaslessWalletConfig, 'transferMaxFee'>} [config] - The configuration object. Defaults to this._config if not provided.
     * @returns {Promise<{ publicClient: PublicClient, bundlerClient: BundlerClient, chain: ViemChain }>}
     */
    protected _getViemClients(config?: Omit<Evm7702GaslessWalletConfig, "transferMaxFee">): Promise<{
        publicClient: PublicClient;
        bundlerClient: BundlerClient;
        chain: ViemChain;
    }>;
    /**
     * Returns the chain id.
     *
     * @protected
     * @returns {Promise<bigint>} The chain id.
     */
    protected _getChainId(): Promise<bigint>;
    /** @private */
    private _buildPaymasterContext;
    /** @private */
    private _getEvmReadOnlyAccount;
    /** @private */
    private _getUserOperationGasCost;
    /** @private */
    private _estimatePimlicoFeesPerGas;
    /** @private */
    private _estimateFeesPerGas;
}
export type Eip1193Provider = import("ethers").Eip1193Provider;
export type EvmTransaction = import("@tetherto/wdk-wallet-evm").EvmTransaction;
export type TransactionResult = import("@tetherto/wdk-wallet-evm").TransactionResult;
export type EvmTransferOptions = import("@tetherto/wdk-wallet-evm").EvmTransferOptions;
export type TransferResult = import("@tetherto/wdk-wallet-evm").TransferResult;
export type EvmTransactionReceipt = import("@tetherto/wdk-wallet-evm").EvmTransactionReceipt;
export type TypedData = import("@tetherto/wdk-wallet-evm").TypedData;
export type PublicClient = import("viem").PublicClient;
export type ViemChain = import("viem").Chain;
export type BundlerClient = import("viem/account-abstraction").BundlerClient;
export type Evm7702GaslessWalletCommonConfig = {
    /**
     * - The url of the rpc provider, or an instance of a class that implements eip-1193.
     */
    provider: string | Eip1193Provider;
    /**
     * - The url of the bundler/paymaster service.
     */
    bundlerUrl: string;
    /**
     * - The url of the paymaster service if different from bundlerUrl (e.g. for Candide which uses separate endpoints).
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
     * - The address of the paymaster smart contract.
     */
    paymasterAddress: string;
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
export type UserOperationReceipt = {
    /**
     * - The user operation hash.
     */
    userOpHash: string;
    /**
     * - The transaction hash.
     */
    transactionHash?: string;
    /**
     * - Whether the user operation was successful.
     */
    success: boolean;
};
import { WalletAccountReadOnly } from '@tetherto/wdk-wallet';
