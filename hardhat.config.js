/** @type {import('hardhat/config').HardhatUserConfig} */
export default {
  networks: {
    hardhat: {
      type: 'edr-simulated',
      chainId: 1,
      accounts: {
        mnemonic: 'test test test test test test test test test test test junk',
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
        accountsBalance: '10000000000000000000000'
      },
      mining: {
        auto: true,
        interval: 1000
      }
    }
  }
}
