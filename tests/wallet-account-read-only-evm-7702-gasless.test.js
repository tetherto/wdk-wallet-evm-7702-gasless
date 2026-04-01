import { beforeEach, describe, expect, jest, test } from '@jest/globals'

import { UserOperationReceiptNotFoundError } from 'viem/account-abstraction'

import { WalletAccountReadOnlyEvm7702Gasless } from '../index.js'

const ADDRESS = '0x405005C7c4422390F4B334F64Cf20E0b767131d0'
const SPENDER = '0xa460AEbce0d3A4BecAd8ccf9D6D4861296c503Bd'
const TOKEN_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7'
const SECOND_TOKEN_ADDRESS = '0xa0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

const DUMMY_BALANCE = 1_000_000_000_000_000_000n
const DUMMY_TOKEN_BALANCE = 1_000_000n
const DUMMY_ALLOWANCE = 500_000n

const DUMMY_USER_OP_HASH = '0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1'
const DUMMY_TX_HASH = '0xdef456abc123def456abc123def456abc123def456abc123def456abc123def4'

const DUMMY_USER_OP_RECEIPT = {
  userOpHash: DUMMY_USER_OP_HASH,
  success: true,
  receipt: {
    transactionHash: DUMMY_TX_HASH
  }
}

const DUMMY_TX_RECEIPT = {
  hash: DUMMY_TX_HASH,
  blockNumber: 12345,
  status: 1,
  gasUsed: 21000n
}

const SPONSORED_CONFIG = {
  provider: 'https://dummy-provider.url/',
  delegationAddress: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
  bundlerUrl: 'https://dummy-bundler.url/',
  isSponsored: true
}

const PAYMASTER_TOKEN_CONFIG = {
  provider: 'https://dummy-provider.url/',
  delegationAddress: '0xe6Cae83BdE06E4c305530e199D7217f42808555B',
  bundlerUrl: 'https://dummy-bundler.url/',
  paymasterAddress: '0x888888888888Ec68A58AB8094Cc1AD20Ba3D2402',
  paymasterToken: { address: TOKEN_ADDRESS }
}

const MESSAGE = 'Dummy message to sign.'
const SIGNATURE = '0xd130f94c52bf393206267278ac0b6009e14f11712578e5c1f7afe4a12685c5b96a77a0832692d96fc51f4bd403839572c55042ecbcc92d215879c5c8bb5778c51c'

describe('WalletAccountReadOnlyEvm7702Gasless', () => {
  let account

  beforeEach(() => {
    account = new WalletAccountReadOnlyEvm7702Gasless(ADDRESS, SPONSORED_CONFIG)
  })

  describe('constructor', () => {
    test('should successfully initialize a read-only account for the given address', async () => {
      const address = await account.getAddress()

      expect(address).toBe(ADDRESS)
    })
  })

  describe('getBalance', () => {
    test('should return the correct balance of the account', async () => {
      const mockEvmAccount = { getBalance: jest.fn().mockResolvedValue(DUMMY_BALANCE) }
      jest.spyOn(account, '_getEvmReadOnlyAccount').mockResolvedValue(mockEvmAccount)

      const balance = await account.getBalance()

      expect(balance).toBe(DUMMY_BALANCE)
      expect(mockEvmAccount.getBalance).toHaveBeenCalled()
    })
  })

  describe('getTokenBalance', () => {
    test('should return the correct token balance', async () => {
      const mockEvmAccount = { getTokenBalance: jest.fn().mockResolvedValue(DUMMY_TOKEN_BALANCE) }
      jest.spyOn(account, '_getEvmReadOnlyAccount').mockResolvedValue(mockEvmAccount)

      const balance = await account.getTokenBalance(TOKEN_ADDRESS)

      expect(balance).toBe(DUMMY_TOKEN_BALANCE)
      expect(mockEvmAccount.getTokenBalance).toHaveBeenCalledWith(TOKEN_ADDRESS)
    })
  })

  describe('getTokenBalances', () => {
    test('should return the correct token balances for multiple tokens', async () => {
      const DUMMY_BALANCES = {
        [TOKEN_ADDRESS]: DUMMY_TOKEN_BALANCE,
        [SECOND_TOKEN_ADDRESS]: 2_000_000n
      }

      const mockEvmAccount = { getTokenBalances: jest.fn().mockResolvedValue(DUMMY_BALANCES) }
      jest.spyOn(account, '_getEvmReadOnlyAccount').mockResolvedValue(mockEvmAccount)

      const balances = await account.getTokenBalances([TOKEN_ADDRESS, SECOND_TOKEN_ADDRESS])

      expect(balances).toEqual(DUMMY_BALANCES)
      expect(mockEvmAccount.getTokenBalances).toHaveBeenCalledWith([TOKEN_ADDRESS, SECOND_TOKEN_ADDRESS])
    })
  })

  describe('getPaymasterTokenBalance', () => {
    test('should return the paymaster token balance', async () => {
      const pmAccount = new WalletAccountReadOnlyEvm7702Gasless(ADDRESS, PAYMASTER_TOKEN_CONFIG)

      const mockEvmAccount = { getTokenBalance: jest.fn().mockResolvedValue(DUMMY_TOKEN_BALANCE) }
      jest.spyOn(pmAccount, '_getEvmReadOnlyAccount').mockResolvedValue(mockEvmAccount)

      const balance = await pmAccount.getPaymasterTokenBalance()

      expect(balance).toBe(DUMMY_TOKEN_BALANCE)
      expect(mockEvmAccount.getTokenBalance).toHaveBeenCalledWith(TOKEN_ADDRESS)
    })

    test('should throw if paymaster token is not configured', async () => {
      await expect(account.getPaymasterTokenBalance())
        .rejects.toThrow('Paymaster token is not configured.')
    })
  })

  describe('getAllowance', () => {
    test('should return the correct allowance', async () => {
      const mockEvmAccount = { getAllowance: jest.fn().mockResolvedValue(DUMMY_ALLOWANCE) }
      jest.spyOn(account, '_getEvmReadOnlyAccount').mockResolvedValue(mockEvmAccount)

      const allowance = await account.getAllowance(TOKEN_ADDRESS, SPENDER)

      expect(allowance).toBe(DUMMY_ALLOWANCE)
      expect(mockEvmAccount.getAllowance).toHaveBeenCalledWith(TOKEN_ADDRESS, SPENDER)
    })
  })

  describe('quoteSendTransaction', () => {
    test('should return zero fee for sponsored transactions', async () => {
      const TRANSACTION = { to: SPENDER, value: 1, data: '0x' }

      const { fee } = await account.quoteSendTransaction(TRANSACTION)

      expect(fee).toBe(0n)
    })
  })

  describe('quoteTransfer', () => {
    test('should return zero fee for sponsored transfers', async () => {
      const TRANSFER = { token: TOKEN_ADDRESS, recipient: SPENDER, amount: 1n }

      const { fee } = await account.quoteTransfer(TRANSFER)

      expect(fee).toBe(0n)
    })
  })

  describe('getTransactionReceipt', () => {
    test('should return the correct transaction receipt', async () => {
      const getUserOperationReceiptMock = jest.fn().mockResolvedValue(DUMMY_USER_OP_RECEIPT)
      const mockEvmAccount = { getTransactionReceipt: jest.fn().mockResolvedValue(DUMMY_TX_RECEIPT) }

      jest.spyOn(account, '_getViemClients').mockResolvedValue({
        bundlerClient: { getUserOperationReceipt: getUserOperationReceiptMock }
      })
      jest.spyOn(account, '_getEvmReadOnlyAccount').mockResolvedValue(mockEvmAccount)

      const receipt = await account.getTransactionReceipt(DUMMY_USER_OP_HASH)

      expect(receipt).toEqual(DUMMY_TX_RECEIPT)
      expect(getUserOperationReceiptMock).toHaveBeenCalledWith({ hash: DUMMY_USER_OP_HASH })
      expect(mockEvmAccount.getTransactionReceipt).toHaveBeenCalledWith(DUMMY_TX_HASH)
    })

    test('should return null if the transaction has not been included in a block yet', async () => {
      const getUserOperationReceiptMock = jest.fn().mockRejectedValue(
        new UserOperationReceiptNotFoundError({ hash: DUMMY_USER_OP_HASH })
      )

      jest.spyOn(account, '_getViemClients').mockResolvedValue({
        bundlerClient: { getUserOperationReceipt: getUserOperationReceiptMock }
      })

      const receipt = await account.getTransactionReceipt(DUMMY_USER_OP_HASH)

      expect(receipt).toBe(null)
    })
  })

  describe('getUserOperationReceipt', () => {
    test('should return the user operation receipt', async () => {
      const getUserOperationReceiptMock = jest.fn().mockResolvedValue(DUMMY_USER_OP_RECEIPT)

      jest.spyOn(account, '_getViemClients').mockResolvedValue({
        bundlerClient: { getUserOperationReceipt: getUserOperationReceiptMock }
      })

      const receipt = await account.getUserOperationReceipt(DUMMY_USER_OP_HASH)

      expect(receipt).toEqual(DUMMY_USER_OP_RECEIPT)
      expect(getUserOperationReceiptMock).toHaveBeenCalledWith({ hash: DUMMY_USER_OP_HASH })
    })

    test('should return null if the user operation has not been included in a block yet', async () => {
      const getUserOperationReceiptMock = jest.fn().mockRejectedValue(
        new UserOperationReceiptNotFoundError({ hash: DUMMY_USER_OP_HASH })
      )

      jest.spyOn(account, '_getViemClients').mockResolvedValue({
        bundlerClient: { getUserOperationReceipt: getUserOperationReceiptMock }
      })

      const receipt = await account.getUserOperationReceipt(DUMMY_USER_OP_HASH)

      expect(receipt).toBe(null)
    })

    test('should rethrow unexpected errors', async () => {
      const getUserOperationReceiptMock = jest.fn().mockRejectedValue(
        new Error('Network failure')
      )

      jest.spyOn(account, '_getViemClients').mockResolvedValue({
        bundlerClient: { getUserOperationReceipt: getUserOperationReceiptMock }
      })

      await expect(account.getUserOperationReceipt(DUMMY_USER_OP_HASH))
        .rejects.toThrow('Network failure')
    })
  })

  describe('verify', () => {
    test('should return true for a valid signature', async () => {
      const result = await account.verify(MESSAGE, SIGNATURE)

      expect(result).toBe(true)
    })

    test('should return false for an invalid signature', async () => {
      const result = await account.verify('wrong message', SIGNATURE)

      expect(result).toBe(false)
    })
  })

  describe('verifyTypedData', () => {
    const TYPED_DATA = {
      domain: {
        name: 'TestApp',
        version: '1',
        chainId: 1,
        verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC'
      },
      types: {
        Person: [
          { name: 'name', type: 'string' },
          { name: 'wallet', type: 'address' }
        ]
      },
      message: {
        name: 'Alice',
        wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826'
      }
    }

    const TYPED_DATA_SIGNATURE = '0x1b319d2006b194b044eaff941404d39b8532de6c9a689dfa6cb03ca56fade1451ff857ea3c473cc66853e2f287a2c0ed4b7cc26de17e8b9145972c750514ac101c'

    test('should return true for a valid typed data signature', async () => {
      const result = await account.verifyTypedData(TYPED_DATA, TYPED_DATA_SIGNATURE)

      expect(result).toBe(true)
    })

    test('should return false for an invalid typed data signature', async () => {
      const tamperedData = { ...TYPED_DATA, message: { name: 'Bob', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' } }

      const result = await account.verifyTypedData(tamperedData, TYPED_DATA_SIGNATURE)

      expect(result).toBe(false)
    })
  })
})
