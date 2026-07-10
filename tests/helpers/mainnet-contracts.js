import MainnetContracts from '../artifacts/MainnetContracts.json' with { type: 'json' }

/**
 * Plants the mainnet contracts snapshotted in MainnetContracts.json on a local chain.
 *
 * Each contract's bytecode is set at its mainnet address via `hardhat_setCode`, making the
 * contracts available at their well-known addresses without deploying them.
 *
 * @param {import('ethers').JsonRpcProvider} provider - The provider connected to the local hardhat node.
 * @returns {Promise<void>}
 */
export async function plantMainnetContracts (provider) {
  for (const [address, code] of Object.entries(MainnetContracts)) {
    await provider.send('hardhat_setCode', [address, code])
  }
}
