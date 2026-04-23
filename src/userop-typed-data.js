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

/** @typedef {import('abstractionkit').UserOperationV8} UserOperationV8 */

/**
 * @typedef {Object} UserOpTypedData
 * @property {Object} domain - The EIP-712 domain separator.
 * @property {Object} types - The EIP-712 type definitions.
 * @property {string} primaryType - The name of the primary type being signed.
 * @property {Object} message - The PackedUserOperation message body.
 */

// Produces the EIP-712 typed-data payload the EntryPoint v0.8 verifier
// expects. The digest over this payload equals abstractionkit's
// createUserOperationHash(op, entrypoint, chainId) — so a signature from
// wdk's signTypedData is interchangeable with AK's signer adapters and
// keeps the private key inside MemorySafeSigningKey the entire time.
//
// Field layout mirrors abstractionkit/src/utils.ts baseCreatePackedUserOperationV8V9:
//   - initCode = eip7702Auth.address (+ factoryData) when 7702-delegated, else factory (+ factoryData)
//   - accountGasLimits = verificationGasLimit (uint128) || callGasLimit (uint128)
//   - gasFees = maxPriorityFeePerGas (uint128) || maxFeePerGas (uint128)
//   - paymasterAndData = paymaster || paymasterVerificationGasLimit (uint128) || paymasterPostOpGasLimit (uint128) || paymasterData
const TYPES = {
  PackedUserOperation: [
    { name: 'sender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'initCode', type: 'bytes' },
    { name: 'callData', type: 'bytes' },
    { name: 'accountGasLimits', type: 'bytes32' },
    { name: 'preVerificationGas', type: 'uint256' },
    { name: 'gasFees', type: 'bytes32' },
    { name: 'paymasterAndData', type: 'bytes' }
  ]
}

function uint128Hex (n) {
  // abiCoder.encode(["uint128"], [n]).slice(34) — strips the 0x and the leading
  // 16 zero bytes of a 32-byte abi-encoded uint128, leaving 16 bytes of value.
  return BigInt(n).toString(16).padStart(32, '0')
}

function buildInitCode (userOp) {
  if (userOp.eip7702Auth?.address) {
    const factoryData = userOp.factoryData ? userOp.factoryData.slice(2) : ''
    return userOp.eip7702Auth.address + factoryData
  }
  if (userOp.factory) {
    const factoryData = userOp.factoryData ? userOp.factoryData.slice(2) : ''
    return userOp.factory + factoryData
  }
  return '0x'
}

function buildPaymasterAndData (userOp) {
  if (!userOp.paymaster) return '0x'

  let out = userOp.paymaster
  if (userOp.paymasterVerificationGasLimit != null) {
    out += uint128Hex(userOp.paymasterVerificationGasLimit)
  }
  if (userOp.paymasterPostOpGasLimit != null) {
    out += uint128Hex(userOp.paymasterPostOpGasLimit)
  }
  if (userOp.paymasterData) {
    out += userOp.paymasterData.slice(2)
  }
  return out
}

/**
 * Builds the EIP-712 typed-data payload for an EntryPoint v0.8 user operation.
 *
 * The digest produced by hashing this payload is identical byte-for-byte to
 * abstractionkit's createUserOperationHash. Feed the result to
 * `ownerAccount.signTypedData(...)` to obtain a valid signature without
 * exposing the private key.
 *
 * @param {UserOperationV8} userOp - The user operation.
 * @param {string} entrypointAddress - EntryPoint v0.8 contract address.
 * @param {bigint} chainId - Target chain id.
 * @returns {UserOpTypedData} Typed-data payload.
 */
export function buildUserOpV08TypedData (userOp, entrypointAddress, chainId) {
  const initCode = buildInitCode(userOp)
  const paymasterAndData = buildPaymasterAndData(userOp)

  const accountGasLimits =
    '0x' + uint128Hex(userOp.verificationGasLimit) + uint128Hex(userOp.callGasLimit)
  const gasFees =
    '0x' + uint128Hex(userOp.maxPriorityFeePerGas) + uint128Hex(userOp.maxFeePerGas)

  return {
    domain: {
      name: 'ERC4337',
      version: '1',
      chainId,
      verifyingContract: entrypointAddress
    },
    types: TYPES,
    primaryType: 'PackedUserOperation',
    message: {
      sender: userOp.sender,
      nonce: BigInt(userOp.nonce),
      initCode,
      callData: userOp.callData,
      accountGasLimits,
      preVerificationGas: BigInt(userOp.preVerificationGas),
      gasFees,
      paymasterAndData
    }
  }
}
