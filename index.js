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

/** @typedef {import('@tetherto/wdk-wallet-evm').FeeRates} FeeRates */

/** @typedef {import('@tetherto/wdk-wallet-evm').KeyPair} KeyPair */
/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransaction} EvmTransaction */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransactionResult} TransactionResult */
/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransferOptions} EvmTransferOptions */
/** @typedef {import('@tetherto/wdk-wallet-evm').TransferResult} TransferResult */
/** @typedef {import('@tetherto/wdk-wallet-evm').EvmTransactionReceipt} EvmTransactionReceipt */
/** @typedef {import('@tetherto/wdk-wallet-evm').ApproveOptions} ApproveOptions */

/** @typedef {import('@tetherto/wdk-wallet-evm').TypedData} TypedData */

/** @typedef {import('./src/wallet-manager-evm-7702-gasless.js').Evm7702GaslessWalletConfig} Evm7702GaslessWalletConfig */

/** @typedef {import('./src/wallet-account-read-only-evm-7702-gasless.js').Evm7702GaslessWalletCommonConfig} Evm7702GaslessWalletCommonConfig */
/** @typedef {import('./src/wallet-account-read-only-evm-7702-gasless.js').Evm7702GaslessPaymasterTokenConfig} Evm7702GaslessPaymasterTokenConfig */
/** @typedef {import('./src/wallet-account-read-only-evm-7702-gasless.js').Evm7702GaslessSponsorshipPolicyConfig} Evm7702GaslessSponsorshipPolicyConfig */

export { default } from './src/wallet-manager-evm-7702-gasless.js'

export { default as WalletAccountReadOnlyEvm7702Gasless } from './src/wallet-account-read-only-evm-7702-gasless.js'

export { default as WalletAccountEvm7702Gasless } from './src/wallet-account-evm-7702-gasless.js'

export { ConfigurationError } from './src/errors.js'
