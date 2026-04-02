import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'
import * as bip39 from 'bip39'
import { Contract } from 'ethers'

const actualWalletEvm = await import('@tetherto/wdk-wallet-evm')
const actualViemAA = await import('viem/account-abstraction')
const actualPermissionless = await import('permissionless')
const actualPermissionlessAccounts = await import('permissionless/accounts')
const actualViem = await import('viem')
const actualViemAccounts = await import('viem/accounts')

const getNetworkMock = jest.fn()

const WalletAccountReadOnlyEvmMock = jest.fn().mockImplementation(() => ({
  _provider: { getNetwork: getNetworkMock }
}))

Object.defineProperties(WalletAccountReadOnlyEvmMock, Object.getOwnPropertyDescriptors(actualWalletEvm.WalletAccountReadOnlyEvm))

jest.unstable_mockModule('@tetherto/wdk-wallet-evm', () => ({
  ...actualWalletEvm,
  WalletAccountReadOnlyEvm: WalletAccountReadOnlyEvmMock
}))

const prepareUserOperationMock = jest.fn()
const signUserOperationMock = jest.fn()
const smartAccountClientRequestMock = jest.fn()

jest.unstable_mockModule('permissionless', () => ({
  ...actualPermissionless,
  createSmartAccountClient: jest.fn().mockReturnValue({
    prepareUserOperation: prepareUserOperationMock,
    account: {
      signUserOperation: signUserOperationMock,
      entryPoint: { address: '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108' }
    },
    request: smartAccountClientRequestMock
  })
}))

jest.unstable_mockModule('permissionless/accounts', () => ({
  ...actualPermissionlessAccounts,
  to7702SimpleSmartAccount: jest.fn().mockResolvedValue({
    address: '0x405005C7c4422390F4B334F64Cf20E0b767131d0',
    entryPoint: { address: '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108' }
  })
}))

jest.unstable_mockModule('viem/account-abstraction', () => ({
  ...actualViemAA,
  createBundlerClient: jest.fn().mockReturnValue({}),
  createPaymasterClient: jest.fn().mockReturnValue({}),
  formatUserOperationRequest: jest.fn().mockReturnValue({})
}))

jest.unstable_mockModule('viem', () => ({
  ...actualViem,
  createPublicClient: jest.fn().mockReturnValue({})
}))

jest.unstable_mockModule('viem/accounts', () => ({
  ...actualViemAccounts,
  toAccount: jest.fn().mockReturnValue({ address: '0x405005C7c4422390F4B334F64Cf20E0b767131d0', type: 'local' })
}))

const { WalletAccountEvm7702Gasless, WalletAccountReadOnlyEvm7702Gasless } = await import('../index.js')

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'
const INVALID_SEED_PHRASE = 'invalid seed phrase'
const SEED = bip39.mnemonicToSeedSync(SEED_PHRASE)

const ACCOUNT = {
  index: 0,
  path: "m/44'/60'/0'/0/0",
  address: '0x405005C7c4422390F4B334F64Cf20E0b767131d0',
  keyPair: {
    privateKey: '260905feebf1ec684f36f1599128b85f3a26c2b817f2065a2fc278398449c41f',
    publicKey: '036c082582225926b9356d95b91a4acffa3511b7cc2a14ef5338c090ea2cc3d0aa'
  }
}

const USDT_MAINNET_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7'

const MESSAGE = 'Dummy message to sign.'
const EXPECTED_SIGNATURE = '0xd130f94c52bf393206267278ac0b6009e14f11712578e5c1f7afe4a12685c5b96a77a0832692d96fc51f4bd403839572c55042ecbcc92d215879c5c8bb5778c51c'

const TYPED_DATA_DOMAIN = {
  name: 'TestApp',
  version: '1',
  chainId: 1,
  verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC'
}

const TYPED_DATA_TYPES = {
  Person: [
    { name: 'name', type: 'string' },
    { name: 'wallet', type: 'address' }
  ]
}

const TYPED_DATA_MESSAGE = {
  name: 'Alice',
  wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826'
}

const EXPECTED_TYPED_DATA_SIGNATURE = '0x1b319d2006b194b044eaff941404d39b8532de6c9a689dfa6cb03ca56fade1451ff857ea3c473cc66853e2f287a2c0ed4b7cc26de17e8b9145972c750514ac101c'

const DUMMY_USER_OP_HASH = '0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1'

const DUMMY_EIP1193_PROVIDER = {
  request: jest.fn(async ({ method }) => {
    if (method === 'eth_chainId') return '0x1'
    if (method === 'eth_getCode') return '0x'
    if (method === 'eth_getTransactionCount') return '0x0'
    if (method === 'net_version') return '1'
    return null
  })
}

const SPONSORED_CONFIG = {
  provider: DUMMY_EIP1193_PROVIDER,
  delegationAddress: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
  bundlerUrl: 'https://dummy-bundler.url/',
  isSponsored: true
}

const DUMMY_PREPARED_USER_OP = {
  callGasLimit: 50_000n,
  verificationGasLimit: 100_000n,
  preVerificationGas: 30_000n,
  paymasterVerificationGasLimit: 20_000n,
  paymasterPostOpGasLimit: 10_000n,
  maxFeePerGas: 10_000_000_000n,
  signature: '0xsig'
}

describe('WalletAccountEvm7702Gasless', () => {
  let account

  beforeEach(() => {
    jest.clearAllMocks()

    getNetworkMock.mockResolvedValue({ chainId: 1n })

    account = new WalletAccountEvm7702Gasless(SEED_PHRASE, "0'/0/0", SPONSORED_CONFIG)
  })

  afterEach(() => {
    account.dispose()
  })

  describe('constructor', () => {
    test('should successfully initialize an account for the given seed phrase and path', () => {
      expect(account.index).toBe(ACCOUNT.index)
      expect(account.path).toBe(ACCOUNT.path)
      expect(account.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.publicKey, 'hex'))
      })
    })

    test('should successfully initialize an account for the given seed and path', () => {
      const account = new WalletAccountEvm7702Gasless(SEED, "0'/0/0", SPONSORED_CONFIG)

      expect(account.index).toBe(ACCOUNT.index)
      expect(account.path).toBe(ACCOUNT.path)
      expect(account.keyPair).toEqual({
        privateKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.privateKey, 'hex')),
        publicKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.publicKey, 'hex'))
      })
    })

    test('should throw if the seed phrase is invalid', () => {
      // eslint-disable-next-line no-new
      expect(() => { new WalletAccountEvm7702Gasless(INVALID_SEED_PHRASE, "0'/0/0", SPONSORED_CONFIG) })
        .toThrow('The seed phrase is invalid.')
    })

    test('should throw if the path is invalid', () => {
      // eslint-disable-next-line no-new
      expect(() => { new WalletAccountEvm7702Gasless(SEED_PHRASE, "a'/b/c", SPONSORED_CONFIG) })
        .toThrow('invalid path component')
    })
  })

  describe('sign', () => {
    test('should return the correct signature', async () => {
      const signature = await account.sign(MESSAGE)

      expect(signature).toBe(EXPECTED_SIGNATURE)
    })
  })

  describe('signTypedData', () => {
    test('should return the correct signature', async () => {
      const signature = await account.signTypedData({
        domain: TYPED_DATA_DOMAIN,
        types: TYPED_DATA_TYPES,
        message: TYPED_DATA_MESSAGE
      })

      expect(signature).toBe(EXPECTED_TYPED_DATA_SIGNATURE)
    })
  })

  describe('sendTransaction', () => {
    test('should successfully send a sponsored transaction', async () => {
      prepareUserOperationMock.mockResolvedValue(DUMMY_PREPARED_USER_OP)
      signUserOperationMock.mockResolvedValue('0xsignature')
      smartAccountClientRequestMock.mockResolvedValue(DUMMY_USER_OP_HASH)

      const TRANSACTION = { to: ACCOUNT.address, value: 1, data: '0x' }

      const { hash, fee } = await account.sendTransaction(TRANSACTION)

      expect(hash).toBe(DUMMY_USER_OP_HASH)
      expect(fee).toBe(0n)
    })
  })

  describe('transfer', () => {
    test('should successfully transfer tokens with sponsored flow', async () => {
      prepareUserOperationMock.mockResolvedValue(DUMMY_PREPARED_USER_OP)
      signUserOperationMock.mockResolvedValue('0xsignature')
      smartAccountClientRequestMock.mockResolvedValue(DUMMY_USER_OP_HASH)

      const TRANSFER = {
        token: USDT_MAINNET_ADDRESS,
        recipient: '0xa460AEbce0d3A4BecAd8ccf9D6D4861296c503Bd',
        amount: 100n
      }

      const { hash, fee } = await account.transfer(TRANSFER)

      expect(hash).toBe(DUMMY_USER_OP_HASH)
      expect(fee).toBe(0n)
    })

    test('should throw if transfer fee exceeds the transfer max fee configuration', async () => {
      const pmAccount = new WalletAccountEvm7702Gasless(SEED_PHRASE, "0'/0/0", {
        ...SPONSORED_CONFIG,
        isSponsored: false,
        paymasterAddress: '0x888888888888Ec68A58AB8094Cc1AD20Ba3D2402',
        paymasterToken: { address: USDT_MAINNET_ADDRESS },
        transferMaxFee: 0n
      })

      jest.spyOn(pmAccount, 'quoteSendTransaction').mockResolvedValue({ fee: 1_000_000n })

      const TRANSFER = {
        token: USDT_MAINNET_ADDRESS,
        recipient: '0xa460AEbce0d3A4BecAd8ccf9D6D4861296c503Bd',
        amount: 100n
      }

      await expect(pmAccount.transfer(TRANSFER))
        .rejects.toThrow('Exceeded maximum fee cost for transfer operation.')
    })
  })

  describe('approve', () => {
    const SPENDER = '0xa460AEbce0d3A4BecAd8ccf9D6D4861296c503Bd'
    const AMOUNT = 100n

    test('should throw if approving non-zero USDT on mainnet when allowance is non-zero', async () => {
      jest.spyOn(account, 'getAllowance').mockResolvedValue(1n)


      const APPROVE_OPTIONS = {
        token: USDT_MAINNET_ADDRESS,
        spender: SPENDER,
        amount: AMOUNT
      }

      await expect(account.approve(APPROVE_OPTIONS))
        .rejects.toThrow('USDT requires the current allowance to be reset to 0 before setting a new non-zero value.')
    })

    test('should successfully approve a non-zero amount for USDT on mainnet when allowance is zero', async () => {
      jest.spyOn(account, 'getAllowance').mockResolvedValue(0n)


      const sendTxSpy = jest.spyOn(account, 'sendTransaction').mockResolvedValue({ hash: DUMMY_USER_OP_HASH, fee: 0n })

      const APPROVE_OPTIONS = {
        token: USDT_MAINNET_ADDRESS,
        spender: SPENDER,
        amount: AMOUNT
      }

      const abi = ['function approve(address spender, uint256 amount) returns (bool)']
      const contract = new Contract(USDT_MAINNET_ADDRESS, abi)
      const expectedData = contract.interface.encodeFunctionData('approve', [SPENDER, AMOUNT])

      const { hash, fee } = await account.approve(APPROVE_OPTIONS)

      expect(hash).toBe(DUMMY_USER_OP_HASH)
      expect(fee).toBe(0n)
      expect(sendTxSpy).toHaveBeenCalledWith({
        to: USDT_MAINNET_ADDRESS,
        value: 0,
        data: expectedData
      })
    })

    test('should successfully approve a zero amount for USDT on mainnet when allowance is non-zero', async () => {
      jest.spyOn(account, 'getAllowance').mockResolvedValue(1n)


      const sendTxSpy = jest.spyOn(account, 'sendTransaction').mockResolvedValue({ hash: DUMMY_USER_OP_HASH, fee: 0n })

      const APPROVE_OPTIONS = {
        token: USDT_MAINNET_ADDRESS,
        spender: SPENDER,
        amount: 0
      }

      const abi = ['function approve(address spender, uint256 amount) returns (bool)']
      const contract = new Contract(USDT_MAINNET_ADDRESS, abi)
      const expectedData = contract.interface.encodeFunctionData('approve', [SPENDER, 0])

      const { hash, fee } = await account.approve(APPROVE_OPTIONS)

      expect(hash).toBe(DUMMY_USER_OP_HASH)
      expect(fee).toBe(0n)
      expect(sendTxSpy).toHaveBeenCalledWith({
        to: USDT_MAINNET_ADDRESS,
        value: 0,
        data: expectedData
      })
    })
  })

  describe('toReadOnlyAccount', () => {
    test('should return a read-only copy of the account', async () => {
      const readOnlyAccount = await account.toReadOnlyAccount()

      expect(readOnlyAccount).toBeInstanceOf(WalletAccountReadOnlyEvm7702Gasless)

      expect(await readOnlyAccount.getAddress()).toBe(ACCOUNT.address)
    })
  })

  describe('dispose', () => {
    test('should dispose the wallet account and erase the private key', async () => {
      const disposableAccount = new WalletAccountEvm7702Gasless(SEED_PHRASE, "0'/0/0", SPONSORED_CONFIG)

      disposableAccount.dispose()

      expect(disposableAccount.keyPair.privateKey).toBeUndefined()
    })
  })
})
