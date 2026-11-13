import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'
import { DisposalError, InvalidSignerError, NoSuchElementError } from '@tetherto/wdk-wallet'
import { PrivateKeySignerEvm, SeedSignerEvm } from '@tetherto/wdk-wallet-evm/signers'

const actualEthers = await import('ethers')

const getFeeDataMock = jest.fn()

jest.unstable_mockModule('ethers', () => ({
  ...actualEthers,
  JsonRpcProvider: jest.fn().mockImplementation(() => ({ getFeeData: getFeeDataMock })),
  BrowserProvider: jest.fn().mockImplementation(() => ({ getFeeData: getFeeDataMock }))
}))

const { default: WalletManagerEvm7702Gasless, WalletAccountEvm7702Gasless, ConfigurationError } = await import('../index.js')

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const OTHER_SEED_PHRASE = 'test test test test test test test test test test test junk'
const PRIVATE_KEY = '260905feebf1ec684f36f1599128b85f3a26c2b817f2065a2fc278398449c41f'
const ACCOUNT_ADDRESS = '0x405005C7c4422390F4B334F64Cf20E0b767131d0'

const SPONSORED_CONFIG = {
  provider: 'https://dummy-provider.url/',
  delegationAddress: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
  bundlerUrl: 'https://dummy-bundler.url/',
  isSponsored: true
}

describe('@tetherto/wdk-wallet-evm-7702-gasless', () => {
  describe('WalletManagerEvm7702Gasless', () => {
    let wallet

    beforeEach(() => {
      jest.clearAllMocks()

      wallet = new WalletManagerEvm7702Gasless(SEED_PHRASE, SPONSORED_CONFIG)
    })

    afterEach(() => {
      wallet.dispose()
    })

    describe('constructor', () => {
      test('should throw if the provider is an empty list', () => {
        expect(() => new WalletManagerEvm7702Gasless(SEED_PHRASE, { ...SPONSORED_CONFIG, provider: [] }))
          .toThrow(ConfigurationError)
      })
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

      test('should return a single account for concurrent calls and wipe the duplicate derived signer', async () => {
        const deriveSpy = jest.spyOn(SeedSignerEvm.prototype, 'derive')

        const [account1, account2] = await Promise.all([wallet.getAccount(0), wallet.getAccount(0)])

        expect(account1).toBe(account2)

        const children = await Promise.all(deriveSpy.mock.results.map(({ value }) => value))

        expect(children).toHaveLength(2)
        expect(children.filter(child => child.keyPair.privateKey === null)).toHaveLength(1)
        expect(account1.keyPair.privateKey).not.toBeNull()

        deriveSpy.mockRestore()
      })

      test('should return a single account for concurrent calls with a named signer', async () => {
        const namedSigner = new SeedSignerEvm(OTHER_SEED_PHRASE, "m/44'/60'")

        wallet.addSigner('other', namedSigner)

        const [account1, account2] = await Promise.all([
          wallet.getAccount(1, { signerName: 'other' }),
          wallet.getAccountByPath("0'/0/1", { signerName: 'other' })
        ])

        expect(account1).toBe(account2)

        namedSigner.dispose()
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

      test('should wipe the derived signer if the account cannot be created', async () => {
        const invalidWallet = new WalletManagerEvm7702Gasless(SEED_PHRASE, { ...SPONSORED_CONFIG, bundlerUrl: undefined })
        const disposeSpy = jest.spyOn(SeedSignerEvm.prototype, 'dispose')

        await expect(invalidWallet.getAccountByPath("0'/0/0")).rejects.toThrow(ConfigurationError)

        expect(disposeSpy).toHaveBeenCalledTimes(1)

        disposeSpy.mockRestore()
        invalidWallet.dispose()
      })
    })

    describe('with a default signer', () => {
      let defaultSigner
      let signerWallet

      beforeEach(() => {
        defaultSigner = new SeedSignerEvm(SEED_PHRASE, "m/44'/60'")
        signerWallet = new WalletManagerEvm7702Gasless(defaultSigner, SPONSORED_CONFIG)
      })

      afterEach(() => {
        signerWallet.dispose()
        defaultSigner.dispose()
      })

      test('should derive the same accounts as a wallet created from the seed phrase', async () => {
        const fromSigner = await signerWallet.getAccount(2)
        const fromSeed = await wallet.getAccount(2)

        expect(fromSigner.path).toBe("m/44'/60'/0'/0/2")
        expect(await fromSigner.getAddress()).toBe(await fromSeed.getAddress())
      })

      test('should throw if the default signer is not derivable', () => {
        const privateKeySigner = new PrivateKeySignerEvm(PRIVATE_KEY)

        expect(() => new WalletManagerEvm7702Gasless(privateKeySigner, SPONSORED_CONFIG))
          .toThrow(InvalidSignerError)

        privateKeySigner.dispose()
      })

      test('should not wipe a default signer supplied by the caller on disposal', () => {
        signerWallet.dispose()

        expect(defaultSigner.keyPair.privateKey).not.toBeNull()
      })

      test('should wipe the default signer it created from a seed on disposal', () => {
        const signer = wallet.getSigner()

        expect(signer.keyPair.privateKey).not.toBeNull()

        wallet.dispose()

        expect(signer.keyPair.privateKey).toBeNull()
      })
    })

    describe('with a signer whose address is only known after getAddress()', () => {
      class LazyAddressSigner {
        constructor (inner) {
          this._inner = inner
          this.address = undefined
        }

        get isDerivable () { return this._inner.isDerivable }
        get keyPair () { return this._inner.keyPair }
        get path () { return this._inner.path }

        async derive (path) {
          return new LazyAddressSigner(await this._inner.derive(path))
        }

        async getAddress () {
          this.address = await this._inner.getAddress()
          return this.address
        }

        signTypedData (typedData) { return this._inner.signTypedData(typedData) }
        dispose () { this._inner.dispose() }
      }

      let lazySigner

      beforeEach(() => {
        lazySigner = new LazyAddressSigner(new SeedSignerEvm(SEED_PHRASE, "m/44'/60'"))
      })

      afterEach(() => {
        lazySigner.dispose()
      })

      test('should create the account of a registered signer by name', async () => {
        wallet.addSigner('lazy', lazySigner)

        const account = await wallet.getAccount('lazy')

        expect(account.path).toBe("m/44'/60'")
      })

      test('should create derived accounts below a registered signer', async () => {
        wallet.addSigner('lazy', lazySigner)

        const byIndex = await wallet.getAccount(1, { signerName: 'lazy' })
        const byPath = await wallet.getAccountByPath("0'/0/2", { signerName: 'lazy' })

        expect(await byIndex.getAddress()).toBe(await (await wallet.getAccount(1)).getAddress())
        expect(byPath.path).toBe("m/44'/60'/0'/0/2")
      })

      test('should create derived accounts below the default signer', async () => {
        const lazyWallet = new WalletManagerEvm7702Gasless(lazySigner, SPONSORED_CONFIG)

        const account = await lazyWallet.getAccount(1)

        expect(await account.getAddress()).toBe(await (await wallet.getAccount(1)).getAddress())

        lazyWallet.dispose()
      })

      test('should wipe the derived signer on disposal even if its address cannot be resolved', async () => {
        const getAddressSpy = jest.spyOn(LazyAddressSigner.prototype, 'getAddress').mockRejectedValue(new Error('device locked'))

        wallet.addSigner('lazy', lazySigner)

        const account = await wallet.getAccount(0, { signerName: 'lazy' })

        await expect(account.getAddress()).rejects.toThrow('device locked')

        wallet.dispose()

        expect(account.keyPair.privateKey).toBeNull()

        getAddressSpy.mockRestore()
      })
    })

    describe('with named signers', () => {
      let privateKeySigner
      let otherSeedSigner

      beforeEach(() => {
        privateKeySigner = new PrivateKeySignerEvm(PRIVATE_KEY)
        otherSeedSigner = new SeedSignerEvm(OTHER_SEED_PHRASE, "m/44'/60'")

        wallet.addSigner('pk', privateKeySigner).addSigner('other', otherSeedSigner)
      })

      afterEach(() => {
        privateKeySigner.dispose()
        otherSeedSigner.dispose()
      })

      test('should return the account of a registered private-key signer as given', async () => {
        const account = await wallet.getAccount('pk')

        expect(account.path).toBeNull()
        expect(await account.getAddress()).toBe(ACCOUNT_ADDRESS)
      })

      test('should cache the account of a registered signer', async () => {
        expect(await wallet.getAccount('pk')).toBe(await wallet.getAccount('pk'))
      })

      test('should not wipe a registered signer when the wallet is disposed', async () => {
        await wallet.getAccount('pk')

        wallet.dispose()

        expect(privateKeySigner.keyPair.privateKey).not.toBeNull()
      })

      test('should return the account of a derivable registered signer at its own path, without deriving', async () => {
        const account = await wallet.getAccount('other')

        expect(account.path).toBe("m/44'/60'")
      })

      test('should derive an account below a derivable registered signer', async () => {
        const account = await wallet.getAccount(1, { signerName: 'other' })
        const byPath = await wallet.getAccountByPath("0'/0/1", { signerName: 'other' })

        expect(account.path).toBe("m/44'/60'/0'/0/1")
        expect(account).toBe(byPath)
        expect(account).not.toBe(await wallet.getAccount(1))
      })

      test('should wipe the signers derived below a registered signer when the wallet is disposed', async () => {
        const account = await wallet.getAccount(0, { signerName: 'other' })

        wallet.dispose()

        expect(account.keyPair.privateKey).toBeNull()
        expect(otherSeedSigner.keyPair.privateKey).not.toBeNull()
      })

      test('should throw if the registered signer is not derivable and a path is requested', async () => {
        await expect(wallet.getAccountByPath("0'/0/0", { signerName: 'pk' }))
          .rejects.toThrow(InvalidSignerError)
        await expect(wallet.getAccount(0, { signerName: 'pk' }))
          .rejects.toThrow(InvalidSignerError)
      })

      test('should throw if no signer is registered with the given name', async () => {
        await expect(wallet.getAccount('unknown'))
          .rejects.toThrow(NoSuchElementError)
        await expect(wallet.getAccount(0, { signerName: 'unknown' }))
          .rejects.toThrow(NoSuchElementError)
      })
    })

    describe('getFeeRates', () => {
      test('should return the correct fee rates', async () => {
        const DUMMY_FEE_DATA = {
          maxFeePerGas: 10_000_000_000n,
          gasPrice: null
        }

        getFeeDataMock.mockResolvedValue(DUMMY_FEE_DATA)

        const feeRates = await wallet.getFeeRates()

        expect(feeRates.normal).toBe(11_000_000_000n)
        expect(feeRates.fast).toBe(20_000_000_000n)
      })

      test('should use gasPrice when maxFeePerGas is not available', async () => {
        const DUMMY_FEE_DATA = {
          maxFeePerGas: null,
          gasPrice: 5_000_000_000n
        }

        getFeeDataMock.mockResolvedValue(DUMMY_FEE_DATA)

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

        expect(account.keyPair.privateKey).toBeNull()
      })

      test('should expose the disposed state', () => {
        expect(wallet.disposed).toBe(false)

        wallet.dispose()

        expect(wallet.disposed).toBe(true)
      })

      test('should throw DisposalError when getting an account after disposal', async () => {
        wallet.dispose()

        await expect(wallet.getAccount(0)).rejects.toThrow(DisposalError)
        await expect(wallet.getAccountByPath("0'/0/0")).rejects.toThrow(DisposalError)
      })

      test('should throw DisposalError when getting an account from a disposed signer', async () => {
        const namedSigner = new SeedSignerEvm(OTHER_SEED_PHRASE, "m/44'/60'")

        wallet.addSigner('other', namedSigner)
        namedSigner.dispose()

        await expect(wallet.getAccount(0, { signerName: 'other' })).rejects.toThrow(DisposalError)
        await expect(wallet.getAccountByPath("0'/0/0", { signerName: 'other' })).rejects.toThrow(DisposalError)
      })
    })
  })
})
