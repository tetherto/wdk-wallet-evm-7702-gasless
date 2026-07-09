import MainnetContracts from '../artifacts/MainnetContracts.json' with { type: 'json' }

// The erc-4337 flows expect these contracts at fixed, well-known addresses:
// the EntryPoints and the v0.7 SenderCreator, the Safe proxy factory,
// singletons, 4337 module and MultiSend, and the CREATE2 deployer that the
// bundler and paymaster use to deploy their own helpers. This plants their
// bytecode (snapshotted from mainnet in MainnetContracts.json) so a local
// chain can execute user operations.
export async function plantMainnetContracts (provider) {
  for (const [address, code] of Object.entries(MainnetContracts)) {
    await provider.send('hardhat_setCode', [address, code])
  }
}
