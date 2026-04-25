import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'

import WalletManagerEvm7702Gasless, { WalletAccountEvm7702Gasless } from '../index.js'

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'

const SPONSORED_CONFIG = {
  provider: 'https://dummy-provider.url/',
  delegationAddress: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
  bundlerUrl: 'https://dummy-bundler.url/',
  isSponsored: true
}

describe('WalletManagerEvm7702Gasless', () => {
  let wallet

  beforeEach(() => {
    wallet = new WalletManagerEvm7702Gasless(SEED_PHRASE, SPONSORED_CONFIG)
  })

  afterEach(() => {
    wallet.dispose()
  })

  describe('getAccount', () => {
    test('should return the account at index 0 by default', async () => {
      const account = await wallet.getAccount()

      expect(account).toBeInstanceOf(WalletAccountEvm7702Gasless)

      expect(account.path).toBe("m/44'/60'/0'/0/0")
    })

    test('should return the account at the given index', async () => {
      const account = await wallet.getAccount(3)

      expect(account).toBeInstanceOf(WalletAccountEvm7702Gasless)

      expect(account.path).toBe("m/44'/60'/0'/0/3")
    })

    test('should cache and return the same account for the same index', async () => {
      const account1 = await wallet.getAccount(0)
      const account2 = await wallet.getAccount(0)

      expect(account1).toBe(account2)
    })

    test('should throw if the index is a negative number', async () => {
      await expect(wallet.getAccount(-1))
        .rejects.toThrow('invalid path component')
    })
  })

  describe('getAccountByPath', () => {
    test('should return the account with the given path', async () => {
      const account = await wallet.getAccountByPath("1'/2/3")

      expect(account).toBeInstanceOf(WalletAccountEvm7702Gasless)

      expect(account.path).toBe("m/44'/60'/1'/2/3")
    })

    test('should throw if the path is invalid', async () => {
      await expect(wallet.getAccountByPath("a'/b/c"))
        .rejects.toThrow('invalid path component')
    })
  })

  describe('getFeeRates', () => {
    test('should return the correct fee rates', async () => {
      const DUMMY_FEE_DATA = {
        maxFeePerGas: 10_000_000_000n,
        gasPrice: null
      }

      jest.spyOn(wallet._provider, 'getFeeData').mockResolvedValue(DUMMY_FEE_DATA)

      const feeRates = await wallet.getFeeRates()

      expect(feeRates.normal).toBe(11_000_000_000n)
      expect(feeRates.fast).toBe(20_000_000_000n)
    })

    test('should use gasPrice when maxFeePerGas is not available', async () => {
      const DUMMY_FEE_DATA = {
        maxFeePerGas: null,
        gasPrice: 5_000_000_000n
      }

      jest.spyOn(wallet._provider, 'getFeeData').mockResolvedValue(DUMMY_FEE_DATA)

      const feeRates = await wallet.getFeeRates()

      expect(feeRates.normal).toBe(5_500_000_000n)
      expect(feeRates.fast).toBe(10_000_000_000n)
    })

    test('should throw if the wallet is not connected to a provider', async () => {
      const disconnectedWallet = new WalletManagerEvm7702Gasless(SEED_PHRASE, {
        ...SPONSORED_CONFIG,
        provider: undefined
      })

      await expect(disconnectedWallet.getFeeRates())
        .rejects.toThrow('The wallet must be connected to a provider to get fee rates.')
    })
  })

  describe('dispose', () => {
    test('should dispose the wallet and erase the private keys of the accounts', async () => {
      const account = await wallet.getAccount(0)

      wallet.dispose()

      expect(account.keyPair.privateKey).toBeUndefined()
    })
  })
})
