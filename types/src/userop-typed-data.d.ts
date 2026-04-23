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
 * @returns {{ domain: object, types: object, message: object }} Typed-data payload.
 */
export function buildUserOpV08TypedData(userOp: UserOperationV8, entrypointAddress: string, chainId: bigint): {
    domain: object;
    types: object;
    message: object;
};
export type UserOperationV8 = import("abstractionkit").UserOperationV8;
