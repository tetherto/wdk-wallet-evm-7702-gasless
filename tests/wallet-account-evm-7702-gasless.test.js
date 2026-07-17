import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals'
import * as bip39 from 'bip39'
import { Contract, keccak256, toUtf8Bytes } from 'ethers'

const actualWalletEvm = await import('@tetherto/wdk-wallet-evm')
const actualAk = await import('abstractionkit')

const getAllowanceMock = jest.fn()
const getNetworkMock = jest.fn()

const WalletAccountReadOnlyEvmMock = jest.fn().mockImplementation(() => ({
  getAllowance: getAllowanceMock,
  _provider: { getNetwork: getNetworkMock }
}))

Object.defineProperties(WalletAccountReadOnlyEvmMock, Object.getOwnPropertyDescriptors(actualWalletEvm.WalletAccountReadOnlyEvm))

jest.unstable_mockModule('@tetherto/wdk-wallet-evm', () => ({
  ...actualWalletEvm,
  WalletAccountReadOnlyEvm: WalletAccountReadOnlyEvmMock
}))

const createUserOperationMock = jest.fn()
const createPaymasterUserOperationMock = jest.fn()
const sendUserOperationMock = jest.fn()
const getUserOperationReceiptMock = jest.fn()
const sendJsonRpcRequestMock = jest.fn()
const fetchAccountNonceMock = jest.fn()

const Simple7702AccountMock = jest.fn().mockImplementation(() => ({
  createUserOperation: createUserOperationMock
}))
Simple7702AccountMock.getUserOperationEip712Data = actualAk.Simple7702Account.getUserOperationEip712Data

const BundlerMock = jest.fn().mockImplementation(() => ({
  sendUserOperation: sendUserOperationMock,
  getUserOperationReceipt: getUserOperationReceiptMock
}))

const Erc7677PaymasterMock = jest.fn().mockImplementation(() => ({
  createPaymasterUserOperation: createPaymasterUserOperationMock
}))

jest.unstable_mockModule('abstractionkit', () => ({
  ...actualAk,
  Simple7702Account: Simple7702AccountMock,
  Bundler: BundlerMock,
  Erc7677Paymaster: Erc7677PaymasterMock,
  sendJsonRpcRequest: sendJsonRpcRequestMock,
  fetchAccountNonce: fetchAccountNonceMock
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

const DUMMY_USER_OP_HASH = '0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1'

const DUMMY_SPONSORED_OP = {
  sender: ACCOUNT.address,
  nonce: 0n,
  callData: '0x',
  callGasLimit: 50_000n,
  verificationGasLimit: 100_000n,
  preVerificationGas: 30_000n,
  paymasterVerificationGasLimit: 20_000n,
  paymasterPostOpGasLimit: 10_000n,
  maxFeePerGas: 10_000_000_000n,
  maxPriorityFeePerGas: 1_000_000_000n,
  signature: '0x'
}

const EIP1193_PROVIDER = {
  request: jest.fn(async ({ method }) => {
    if (method === 'eth_chainId') return '0x1'
    if (method === 'eth_getCode') return '0x'
    if (method === 'eth_getTransactionCount') return '0x0'
    if (method === 'net_version') return '1'
    return null
  })
}

const SPONSORED_CONFIG = {
  provider: EIP1193_PROVIDER,
  delegationAddress: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
  bundlerUrl: 'https://dummy-bundler.url/',
  isSponsored: true
}

describe('@tetherto/wdk-wallet-evm-7702-gasless', () => {
  describe('WalletAccountEvm7702Gasless', () => {
    let account
  
    beforeEach(() => {
      jest.clearAllMocks()
  
      getNetworkMock.mockResolvedValue({ chainId: 1n })
  
      sendJsonRpcRequestMock.mockImplementation(async (_rpc, method) => {
        if (method === 'eth_gasPrice') return '0x174876e800'
        if (method === 'eth_maxPriorityFeePerGas') return '0x77359400'
        return '0x0'
      })
  
      createUserOperationMock.mockResolvedValue({ ...DUMMY_SPONSORED_OP })
      createPaymasterUserOperationMock.mockResolvedValue({ userOperation: { ...DUMMY_SPONSORED_OP } })
      sendUserOperationMock.mockResolvedValue(DUMMY_USER_OP_HASH)
      fetchAccountNonceMock.mockResolvedValue(0n)
  
      account = new WalletAccountEvm7702Gasless(SEED_PHRASE, "0'/0/0", SPONSORED_CONFIG)
    })
  
    afterEach(() => {
      account.dispose()
    })

    describe('nonce lanes', () => {
      const TX = { to: ACCOUNT.address, value: 1, data: '0x' }
      const MAX_UINT192 = (1n << 192n) - 1n
      const MAX_UINT64 = (1n << 64n) - 1n

      test('should not set a nonce override on a normal send (default key-0 path)', async () => {
        await account.sendTransaction(TX)

        expect(createUserOperationMock.mock.calls[0][3].nonce).toBeUndefined()
        expect(fetchAccountNonceMock).not.toHaveBeenCalled()
      })

      test('should place a parallel send in a fresh lane (non-zero key, sequence 0) without an on-chain nonce read', async () => {
        await account.sendTransaction(TX, { parallel: true })

        const nonce = createUserOperationMock.mock.calls[0][3].nonce
        expect(nonce >> 64n).not.toBe(0n)
        expect(nonce & MAX_UINT64).toBe(0n)
        expect(fetchAccountNonceMock).not.toHaveBeenCalled()
      })

      test('should give each parallel send its own distinct lane', async () => {
        await Promise.all([account.sendTransaction(TX, { parallel: true }), account.sendTransaction(TX, { parallel: true })])

        const keyA = createUserOperationMock.mock.calls[0][3].nonce >> 64n
        const keyB = createUserOperationMock.mock.calls[1][3].nonce >> 64n
        expect(keyA).not.toBe(keyB)
      })

      test('should use a raw bigint nonceKey verbatim, at its current sequence', async () => {
        const KEY = 42n
        const FULL_NONCE = (KEY << 64n) | 3n
        fetchAccountNonceMock.mockResolvedValue(FULL_NONCE)
        const address = await account.getAddress()

        await account.sendTransaction(TX, { nonceKey: KEY })

        expect(fetchAccountNonceMock).toHaveBeenCalledWith(expect.anything(), actualAk.ENTRYPOINT_V8, address, KEY)
        expect(createUserOperationMock.mock.calls[0][3].nonce).toBe(FULL_NONCE)
      })

      test('should derive a deterministic lane key from a string nonceKey', async () => {
        const LABEL = 'payments'
        const EXPECTED_KEY = BigInt(keccak256(toUtf8Bytes(LABEL))) & MAX_UINT192
        const address = await account.getAddress()

        await account.sendTransaction(TX, { nonceKey: LABEL })

        expect(fetchAccountNonceMock).toHaveBeenCalledWith(expect.anything(), actualAk.ENTRYPOINT_V8, address, EXPECTED_KEY)
      })

      test('should reject a bigint nonceKey above the uint192 range', async () => {
        await expect(account.sendTransaction(TX, { nonceKey: MAX_UINT192 + 1n }))
          .rejects.toThrow('nonceKey must be within the uint192 range (0 to 2^192 - 1).')
        expect(fetchAccountNonceMock).not.toHaveBeenCalled()
      })

      test('should reject a negative bigint nonceKey', async () => {
        await expect(account.sendTransaction(TX, { nonceKey: -1n }))
          .rejects.toThrow('nonceKey must be within the uint192 range (0 to 2^192 - 1).')
      })
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
        const acc = new WalletAccountEvm7702Gasless(SEED, "0'/0/0", SPONSORED_CONFIG)
  
        expect(acc.index).toBe(ACCOUNT.index)
        expect(acc.path).toBe(ACCOUNT.path)
        expect(acc.keyPair).toEqual({
          privateKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.privateKey, 'hex')),
          publicKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.publicKey, 'hex'))
        })
      })
  
      test('should successfully initialize an account from an existing WalletAccountEvm', () => {
        const ownerAccount = new actualWalletEvm.WalletAccountEvm(SEED_PHRASE, "0'/0/0", SPONSORED_CONFIG)
        const acc = new WalletAccountEvm7702Gasless(ownerAccount, SPONSORED_CONFIG)
  
        expect(acc.index).toBe(ACCOUNT.index)
        expect(acc.path).toBe(ACCOUNT.path)
        expect(acc.keyPair).toEqual({
          privateKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.privateKey, 'hex')),
          publicKey: new Uint8Array(Buffer.from(ACCOUNT.keyPair.publicKey, 'hex'))
        })
      })
  
      test('should throw if the seed phrase is invalid', () => {
        expect(() => { new WalletAccountEvm7702Gasless(INVALID_SEED_PHRASE, "0'/0/0", SPONSORED_CONFIG) })
          .toThrow('The seed phrase is invalid.')
      })
  
      test('should throw if the path is invalid', () => {
        expect(() => { new WalletAccountEvm7702Gasless(SEED_PHRASE, "a'/b/c", SPONSORED_CONFIG) })
          .toThrow('invalid path component')
      })
  
      test('should throw if provider is missing from the config', () => {
        expect(() => new WalletAccountEvm7702Gasless(SEED_PHRASE, "0'/0/0", { ...SPONSORED_CONFIG, provider: undefined }))
          .toThrow('Missing required configuration field: provider.')
      })
  
      test('should throw if bundlerUrl is missing from the config', () => {
        expect(() => new WalletAccountEvm7702Gasless(SEED_PHRASE, "0'/0/0", { ...SPONSORED_CONFIG, bundlerUrl: undefined }))
          .toThrow('Missing required configuration field: bundlerUrl.')
      })
  
      test('should throw if delegationAddress is missing from the config', () => {
        expect(() => new WalletAccountEvm7702Gasless(SEED_PHRASE, "0'/0/0", { ...SPONSORED_CONFIG, delegationAddress: undefined }))
          .toThrow('Missing required configuration field: delegationAddress.')
      })
    })
  
    describe('EIP-1193 provider support', () => {
      test('should forward an EIP-1193 provider object verbatim to abstractionkit', async () => {
        const TX = { to: ACCOUNT.address, value: 1, data: '0x' }
  
        await account.sendTransaction(TX)
  
        expect(createUserOperationMock.mock.calls[0][1]).toBe(EIP1193_PROVIDER)
      })
    })
  
    describe('sign', () => {
      const MESSAGE = 'Dummy message to sign.'
      const EXPECTED_SIGNATURE = '0xd130f94c52bf393206267278ac0b6009e14f11712578e5c1f7afe4a12685c5b96a77a0832692d96fc51f4bd403839572c55042ecbcc92d215879c5c8bb5778c51c'
  
      test('should return the correct signature', async () => {
        const signature = await account.sign(MESSAGE)
  
        expect(signature).toBe(EXPECTED_SIGNATURE)
      })
    })
  
    describe('signTypedData', () => {
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
  
      test('should return the correct signature', async () => {
        const signature = await account.signTypedData({
          domain: TYPED_DATA_DOMAIN,
          types: TYPED_DATA_TYPES,
          message: TYPED_DATA_MESSAGE
        })
  
        expect(signature).toBe(EXPECTED_TYPED_DATA_SIGNATURE)
      })
    })
  
    describe('quoteSendTransaction', () => {
      test('should return zero fee for sponsored transactions', async () => {
        const TX = { to: ACCOUNT.address, value: 1, data: '0x' }
  
        const { fee } = await account.quoteSendTransaction(TX)
  
        expect(fee).toBe(0n)
      })
  
      test('should return the fee in paymaster token base units for non-sponsored transactions', async () => {
        const QUOTED_TOKEN_FEE = 500_000n
  
        createPaymasterUserOperationMock.mockResolvedValue({
          userOperation: { ...DUMMY_SPONSORED_OP },
          tokenQuote: { tokenCost: QUOTED_TOKEN_FEE }
        })
  
        const pmAccount = new WalletAccountEvm7702Gasless(SEED_PHRASE, "0'/0/0", {
          ...SPONSORED_CONFIG,
          isSponsored: false,
          paymasterAddress: '0x888888888888Ec68A58AB8094Cc1AD20Ba3D2402',
          paymasterToken: { address: USDT_MAINNET_ADDRESS }
        })
  
        const { fee } = await pmAccount.quoteSendTransaction({ to: ACCOUNT.address, value: 1, data: '0x' })
  
        expect(fee).toBe(QUOTED_TOKEN_FEE)
        expect(createPaymasterUserOperationMock).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(Object),
          SPONSORED_CONFIG.bundlerUrl,
          { token: USDT_MAINNET_ADDRESS }
        )
        expect(createPaymasterUserOperationMock).toHaveBeenCalledTimes(1)
      })
  
      test('should re-validate the merged config when a per-call override is provided', async () => {
        await expect(account.quoteSendTransaction(
          { to: ACCOUNT.address, value: 1, data: '0x' },
          { isSponsored: false }
        )).rejects.toThrow('Missing required paymaster token configuration fields: paymasterToken.')
      })
    })
  
    describe('sendTransaction', () => {
      const EXPECTED_USER_OP_SIGNATURE = '0xe9739f744de8042aad75f8f9c66d4ebf90458eafa1d0dafb3013404029da548c68cc295755e8ebaf690db3b1655b580b5c3e8bcf3680273386914ccb2ba8736f1c'
  
      test('should successfully send a sponsored transaction', async () => {
        const TRANSACTION = { to: ACCOUNT.address, value: 1, data: '0x' }
  
        const { hash, fee } = await account.sendTransaction(TRANSACTION)
  
        expect(hash).toBe(DUMMY_USER_OP_HASH)
        expect(fee).toBe(0n)
        expect(sendUserOperationMock).toHaveBeenCalledWith(
          { ...DUMMY_SPONSORED_OP, signature: EXPECTED_USER_OP_SIGNATURE },
          actualAk.ENTRYPOINT_V8
        )
      })
  
      test('should re-validate the merged config when a per-call override is provided', async () => {
        await expect(account.sendTransaction(
          { to: ACCOUNT.address, value: 1, data: '0x' },
          { isSponsored: false }
        )).rejects.toThrow('Missing required paymaster token configuration fields: paymasterToken.')
      })
  
      test('should successfully send a non-sponsored transaction with no prior quote', async () => {
        const QUOTED_TOKEN_FEE = 500_000n
  
        createPaymasterUserOperationMock.mockResolvedValue({
          userOperation: { ...DUMMY_SPONSORED_OP },
          tokenQuote: { tokenCost: QUOTED_TOKEN_FEE }
        })
  
        const pmAccount = new WalletAccountEvm7702Gasless(SEED_PHRASE, "0'/0/0", {
          ...SPONSORED_CONFIG,
          isSponsored: false,
          paymasterAddress: '0x888888888888Ec68A58AB8094Cc1AD20Ba3D2402',
          paymasterToken: { address: USDT_MAINNET_ADDRESS }
        })
  
        const { hash, fee } = await pmAccount.sendTransaction({ to: ACCOUNT.address, value: 1, data: '0x' })
  
        expect(hash).toBe(DUMMY_USER_OP_HASH)
        expect(fee).toBe(QUOTED_TOKEN_FEE)
        expect(sendUserOperationMock).toHaveBeenCalledWith(
          { ...DUMMY_SPONSORED_OP, signature: EXPECTED_USER_OP_SIGNATURE },
          actualAk.ENTRYPOINT_V8
        )
      })
  
      test('should skip the EIP-7702 authorization when the EOA is already delegated to the configured address', async () => {
        const DELEGATED_CODE = '0xef0100' + SPONSORED_CONFIG.delegationAddress.slice(2).toLowerCase()
  
        const DELEGATED_PROVIDER = {
          request: jest.fn(async ({ method }) => {
            if (method === 'eth_chainId') return '0x1'
            if (method === 'eth_getCode') return DELEGATED_CODE
            if (method === 'eth_getTransactionCount') return '0x0'
            if (method === 'net_version') return '1'
            return null
          })
        }
  
        const delegatedAccount = new WalletAccountEvm7702Gasless(SEED_PHRASE, "0'/0/0", {
          ...SPONSORED_CONFIG,
          provider: DELEGATED_PROVIDER
        })
  
        const { hash, fee } = await delegatedAccount.sendTransaction({ to: ACCOUNT.address, value: 1, data: '0x' })
  
        expect(hash).toBe(DUMMY_USER_OP_HASH)
        expect(fee).toBe(0n)
        expect(createUserOperationMock.mock.calls[0][3].eip7702Auth).toBeUndefined()
      })
    })
  
    describe('transfer', () => {
      test('should successfully transfer tokens with sponsored flow', async () => {
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
  
        createPaymasterUserOperationMock.mockResolvedValue({
          userOperation: { ...DUMMY_SPONSORED_OP },
          tokenQuote: { tokenCost: 1_000_000n }
        })
  
        const TRANSFER = {
          token: USDT_MAINNET_ADDRESS,
          recipient: '0xa460AEbce0d3A4BecAd8ccf9D6D4861296c503Bd',
          amount: 100n
        }
  
        await expect(pmAccount.transfer(TRANSFER))
          .rejects.toThrow('Exceeded maximum fee cost for transfer operation.')
  
        expect(createPaymasterUserOperationMock).toHaveBeenCalledWith(
          expect.any(Object),
          expect.any(Object),
          SPONSORED_CONFIG.bundlerUrl,
          { token: USDT_MAINNET_ADDRESS }
        )
        expect(createPaymasterUserOperationMock).toHaveBeenCalledTimes(1)
      })
  
      test('should re-validate the merged config when a per-call override is provided', async () => {
        const TRANSFER = {
          token: USDT_MAINNET_ADDRESS,
          recipient: '0xa460AEbce0d3A4BecAd8ccf9D6D4861296c503Bd',
          amount: 100n
        }
  
        await expect(account.transfer(TRANSFER, { isSponsored: false }))
          .rejects.toThrow('Missing required paymaster token configuration fields: paymasterToken.')
      })
    })
  
    describe('approve', () => {
      const SPENDER = '0xa460AEbce0d3A4BecAd8ccf9D6D4861296c503Bd'
      const AMOUNT = 100n
  
      test('should throw if approving non-zero USDT on mainnet when allowance is non-zero', async () => {
        getAllowanceMock.mockResolvedValue(1n)
  
        await expect(account.approve({ token: USDT_MAINNET_ADDRESS, spender: SPENDER, amount: AMOUNT }))
          .rejects.toThrow('USDT requires the current allowance to be reset to 0 before setting a new non-zero value.')
  
        expect(getAllowanceMock).toHaveBeenCalledWith(USDT_MAINNET_ADDRESS, SPENDER)
      })
  
      test('should successfully approve a non-zero amount for USDT on mainnet when allowance is zero', async () => {
        getAllowanceMock.mockResolvedValue(0n)
  
        const abi = ['function approve(address spender, uint256 amount) returns (bool)']
        const contract = new Contract(USDT_MAINNET_ADDRESS, abi)
        const expectedData = contract.interface.encodeFunctionData('approve', [SPENDER, AMOUNT])
  
        const { hash, fee } = await account.approve({ token: USDT_MAINNET_ADDRESS, spender: SPENDER, amount: AMOUNT })
  
        expect(hash).toBe(DUMMY_USER_OP_HASH)
        expect(fee).toBe(0n)
        expect(getAllowanceMock).toHaveBeenCalledWith(USDT_MAINNET_ADDRESS, SPENDER)
        expect(createUserOperationMock.mock.calls[0][0]).toEqual([
          { to: USDT_MAINNET_ADDRESS, value: 0n, data: expectedData }
        ])
      })
  
      test('should successfully approve a zero amount for USDT on mainnet when allowance is non-zero', async () => {
        getAllowanceMock.mockResolvedValue(1n)
  
        const abi = ['function approve(address spender, uint256 amount) returns (bool)']
        const contract = new Contract(USDT_MAINNET_ADDRESS, abi)
        const expectedData = contract.interface.encodeFunctionData('approve', [SPENDER, 0])
  
        const { hash, fee } = await account.approve({ token: USDT_MAINNET_ADDRESS, spender: SPENDER, amount: 0 })
  
        expect(hash).toBe(DUMMY_USER_OP_HASH)
        expect(fee).toBe(0n)
        expect(getAllowanceMock).toHaveBeenCalledWith(USDT_MAINNET_ADDRESS, SPENDER)
        expect(createUserOperationMock.mock.calls[0][0]).toEqual([
          { to: USDT_MAINNET_ADDRESS, value: 0n, data: expectedData }
        ])
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
})
