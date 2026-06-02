import { describe, expect, test, beforeAll, beforeEach, afterAll, jest } from '@jest/globals'

import path from 'path'
import { ethers } from 'ethers'
import { alto } from 'prool/instances'
import { paymaster } from '@pimlico/mock-paymaster'
import { ENTRYPOINT_V8, Erc7677Paymaster, Simple7702Account } from 'abstractionkit'

import WalletManagerEvm7702Gasless from '@tetherto/wdk-wallet-evm-7702-gasless'

import { MOCK_PAYMASTER_TOKEN_ADDRESS, mintMockTokens } from '../helpers/mock-paymaster-token.js'
import { discoverPaymasterAddress } from '../helpers/erc-7677-discovery.js'
import { deploy, transfer, balanceOf } from '../helpers/test-token.js'

const detectProvider = Erc7677Paymaster.detectProvider
jest.spyOn(Erc7677Paymaster, 'detectProvider').mockImplementation((url) => {
  if (url?.includes('pimlico')) return 'pimlico'
  return detectProvider(url)
})

const TIMEOUT = 60000 // 60 seconds

const ENTRY_POINT_ADDRESS = ENTRYPOINT_V8
const DELEGATION_ADDRESS = Simple7702Account.DEFAULT_DELEGATEE_ADDRESS

const ethersProvider = new ethers.JsonRpcProvider('http://localhost:8545')
const fundedWallet = new ethers.Wallet('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', ethersProvider)

const SEED_PHRASE = 'cook voyage document eight skate token alien guide drink uncle term abuse'

const ACCOUNT0 = {
  index: 0,
  path: "m/44'/60'/0'/0/0",
  address: '0x405005C7c4422390F4B334F64Cf20E0b767131d0',
  keyPair: {
    privateKey: '260905feebf1ec684f36f1599128b85f3a26c2b817f2065a2fc278398449c41f',
    publicKey: '036c082582225926b9356d95b91a4acffa3511b7cc2a14ef5338c090ea2cc3d0aa'
  }
}

const ACCOUNT1 = {
  index: 1,
  path: "m/44'/60'/0'/0/1",
  address: '0xcC81e04BadA16DEf9e1AFB027B859bec42BE49dB',
  keyPair: {
    privateKey: 'ba3d34b786d909f83be1422b75ea18005843ff979862619987fb0bab59580158',
    publicKey: '02f8d04c3de44e53e5b0ef2f822a29087e6af80114560956518767c64fec6b0f69'
  }
}

async function waitForTx (txHash, account) {
  let receipt = null
  let counter = 0

  while (!receipt) {
    try {
      receipt = await account.getTransactionReceipt(txHash)
    } catch (error) {
    }

    if (!receipt) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      counter++
      if (counter > 60) {
        throw new Error(`Transaction not mined after 60 seconds: ${txHash}`)
      }
    }
  }
  return receipt
}

export function resolveAltoCli () {
  return path.resolve(process.cwd(), 'node_modules', '@pimlico', 'alto', 'esm', 'cli', 'alto.js')
}

const setupServers = async () => {
  const bundlerInstance = alto({
    port: 4337,
    entrypoints: [ENTRY_POINT_ADDRESS],
    rpcUrl: 'http://localhost:8545',
    logLevel: 'debug',
    'executor-private-keys': ['0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'],
    'utility-private-key': ['0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'],
    safeMode: false,
    pollingInterval: 0,
    binary: resolveAltoCli()
  })
  await bundlerInstance.start()

  const paymasterInstance = paymaster({
    port: 3000,
    anvilRpc: 'http://localhost:8545',
    altoRpc: 'http://localhost:4337'
  })

  await paymasterInstance.start()

  return {
    bundlerInstance,
    paymasterInstance
  }
}

async function deployTestTokens () {
  const mockPaymasterToken = new ethers.Contract(
    MOCK_PAYMASTER_TOKEN_ADDRESS,
    ['function balanceOf(address owner) view returns (uint256)', 'function sudoMint(address to, uint256 amount)', 'function transfer(address to, uint256 amount)'],
    ethersProvider
  )

  const testToken = await deploy(fundedWallet)

  return {
    mockPaymasterToken,
    testToken
  }
}

async function fundAccountsWithTokens (testToken, accounts, nonce) {
  for (const account of accounts) {
    await transfer(testToken, account, 1000, fundedWallet, nonce++)
  }
  return nonce
}

async function delegateAccounts (accounts) {
  const delegationCode = `0xef0100${DELEGATION_ADDRESS.slice(2)}`

  for (const account of accounts) {
    await ethersProvider.send('hardhat_setCode', [account, delegationCode])
  }
}

describe('@wdk/wallet-evm-7702-gasless', () => {
  let wallet
  let testToken
  let mockPaymasterToken
  let bundlerInstance, paymasterInstance
  let paymasterAddress

  beforeAll(async () => {
    const servers = await setupServers()

    bundlerInstance = servers.bundlerInstance
    paymasterInstance = servers.paymasterInstance

    paymasterAddress = await discoverPaymasterAddress('http://localhost:3000', ENTRY_POINT_ADDRESS, MOCK_PAYMASTER_TOKEN_ADDRESS)

    const tokens = await deployTestTokens()
    testToken = tokens.testToken
    mockPaymasterToken = tokens.mockPaymasterToken

    const config = {
      provider: 'http://localhost:8545',
      bundlerUrl: 'http://localhost:4337',
      paymasterUrl: 'http://localhost:3000?pimlico',
      paymasterAddress,
      delegationAddress: DELEGATION_ADDRESS,
      paymasterToken: {
        address: MOCK_PAYMASTER_TOKEN_ADDRESS
      }
    }

    wallet = new WalletManagerEvm7702Gasless(SEED_PHRASE, config)

    const accounts = [ACCOUNT0.address, ACCOUNT1.address]

    await delegateAccounts(accounts)

    let nonce = await ethersProvider.getTransactionCount(fundedWallet.address)

    nonce = await fundAccountsWithTokens(testToken, accounts, nonce)

    await ethersProvider.send('hardhat_setBalance', [ACCOUNT0.address, ethers.toQuantity(ethers.parseEther('10'))])
    await ethersProvider.send('hardhat_setBalance', [ACCOUNT1.address, ethers.toQuantity(ethers.parseEther('10'))])
    await mintMockTokens(ACCOUNT0.address, ethers.parseEther('10000'), fundedWallet, nonce++)
    await mintMockTokens(ACCOUNT1.address, ethers.parseEther('10000'), fundedWallet, nonce++)
  }, TIMEOUT)

  afterAll(async () => {
    await bundlerInstance.stop()
    await paymasterInstance.stop()
  }, TIMEOUT)

  test('should derive accounts with correct properties and 7702 account addresses', async () => {
    const account0 = await wallet.getAccountByPath("0'/0/0")

    expect(account0.index).toBe(ACCOUNT0.index)
    expect(account0.path).toBe(ACCOUNT0.path)
    expect(account0.keyPair).toEqual({
      privateKey: new Uint8Array(Buffer.from(ACCOUNT0.keyPair.privateKey, 'hex')),
      publicKey: new Uint8Array(Buffer.from(ACCOUNT0.keyPair.publicKey, 'hex'))
    })

    const address0 = await account0.getAddress()

    expect(address0).toBe(ACCOUNT0.address)
  }, TIMEOUT)

  test('should derive an account, quote the cost of a tx and check the fee', async () => {
    const account0 = await wallet.getAccountByPath("0'/0/0")
    const account1 = await wallet.getAccountByPath("0'/0/1")

    const TRANSACTION = {
      to: await account1.getAddress(),
      value: 0
    }

    const { fee: estimatedFee } = await account0.quoteSendTransaction(TRANSACTION)

    const { hash, fee } = await account0.sendTransaction(TRANSACTION)

    const transaction = await waitForTx(hash, account0)

    expect(transaction.status).toBe(1)
    expect(transaction.to).toBe(ENTRY_POINT_ADDRESS)

    expect(fee).toBe(estimatedFee)
  }, TIMEOUT)

  test('should derive two accounts, send a tx from account 0 to 1 and get the correct balances', async () => {
    const account1 = await wallet.getAccountByPath("0'/0/1")

    const balance0Before = await ethersProvider.getBalance(ACCOUNT0.address)
    const balance1Before = await ethersProvider.getBalance(ACCOUNT1.address)

    const TRANSACTION = {
      to: ACCOUNT0.address,
      value: ethers.parseEther('1')
    }

    const { hash } = await account1.sendTransaction(TRANSACTION)

    const transaction = await waitForTx(hash, account1)

    expect(transaction.status).toBe(1)

    const balance0After = await ethersProvider.getBalance(ACCOUNT0.address)
    const balance1After = await ethersProvider.getBalance(ACCOUNT1.address)

    expect(balance0After).toBe(balance0Before + ethers.parseEther('1'))
    expect(balance1After).toBe(balance1Before - ethers.parseEther('1'))
  }, TIMEOUT)

  test('should derive an account by its path, quote the cost of transferring a token and transfer a token', async () => {
    const account0 = await wallet.getAccountByPath("0'/0/0")

    const TRANSACTION = {
      token: testToken.target,
      recipient: ACCOUNT1.address,
      amount: 1n
    }

    const { fee: estimatedFee } = await account0.quoteTransfer(TRANSACTION)

    const { hash, fee } = await account0.transfer(TRANSACTION)

    const transaction = await waitForTx(hash, account0)

    expect(transaction.status).toBe(1)

    expect(fee).toBe(estimatedFee)
    expect(transaction.to).toBe(ENTRY_POINT_ADDRESS)
  }, TIMEOUT)

  test('should derive two accounts by their paths, transfer a token from account 0 to 1 and get the correct balances and token balances', async () => {
    const account0 = await wallet.getAccountByPath("0'/0/0")

    const balance0Before = await balanceOf(testToken, ACCOUNT0.address)
    const balance1Before = await balanceOf(testToken, ACCOUNT1.address)

    const TRANSACTION = {
      token: testToken.target,
      recipient: ACCOUNT1.address,
      amount: 1n
    }

    const { hash } = await account0.transfer(TRANSACTION)

    const transaction = await waitForTx(hash, account0)

    expect(transaction.status).toBe(1)

    const balance0After = await balanceOf(testToken, ACCOUNT0.address)
    const balance1After = await balanceOf(testToken, ACCOUNT1.address)

    expect(balance0After).toBe(balance0Before - 1n)
    expect(balance1After).toBe(balance1Before + 1n)
  }, TIMEOUT)

  test('should derive two accounts, approve x tokens from account 0 to 1, transfer x tokens from account 1 to 2 and get the correct balances and token balances', async () => {
    const account0 = await wallet.getAccountByPath("0'/0/0")
    const account1 = await wallet.getAccountByPath("0'/0/1")

    const balance0Before = await balanceOf(testToken, ACCOUNT0.address)
    const balance1Before = await balanceOf(testToken, ACCOUNT1.address)

    const APPROVE_TRANSACTION = {
      to: testToken.target,
      value: 0,
      data: testToken.interface.encodeFunctionData('approve', [ACCOUNT1.address, 1n])
    }

    const { hash: approveHash } = await account0.sendTransaction(APPROVE_TRANSACTION)

    const approveTransaction = await waitForTx(approveHash, account0)

    expect(approveTransaction.status).toBe(1)

    const approvedAmount = await testToken.allowance(ACCOUNT0.address, ACCOUNT1.address)

    expect(approvedAmount).toBe(1n)

    const TRANSFER_TRANSACTION = {
      to: testToken.target,
      value: 0,
      data: testToken.interface.encodeFunctionData('transferFrom', [ACCOUNT0.address, ACCOUNT1.address, 1n])
    }

    const { hash: transferHash } = await account1.sendTransaction(TRANSFER_TRANSACTION)

    const transferTransaction = await waitForTx(transferHash, account1)

    expect(transferTransaction.status).toBe(1)

    const balance1After = await balanceOf(testToken, ACCOUNT1.address)
    const balance0After = await balanceOf(testToken, ACCOUNT0.address)

    expect(balance1After).toBe(balance1Before + 1n)
    expect(balance0After).toBe(balance0Before - 1n)
  }, TIMEOUT)

  test('should derive two accounts, transfer x eth from acount 0 to 1, and confirm the paymaster sponsored the tx using the mock paymaster token', async () => {
    const account0 = await wallet.getAccountByPath("0'/0/0")

    const balance0Before = await balanceOf(mockPaymasterToken, ACCOUNT0.address)

    const TRANSACTION = {
      to: ACCOUNT1.address,
      value: ethers.parseEther('1')
    }

    const { hash } = await account0.sendTransaction(TRANSACTION)

    const transaction = await waitForTx(hash, account0)

    expect(transaction.status).toBe(1)

    const balance0After = await balanceOf(mockPaymasterToken, ACCOUNT0.address)

    expect(balance0After).toBeLessThan(balance0Before)
  }, TIMEOUT)

  test('should derive an account, sign a message and verify its signature', async () => {
    const account0 = await wallet.getAccountByPath("0'/0/0")

    const MESSAGE = 'Hello, world!'

    const signature = await account0.sign(MESSAGE)

    const isValid = await account0.verify(MESSAGE, signature)
    expect(isValid).toBe(true)
  }, TIMEOUT)

  test('should derive an account, sign typed data and verify its signature', async () => {
    const account0 = await wallet.getAccountByPath("0'/0/0")

    const TYPED_DATA = {
      domain: {
        name: 'Test',
        version: '1',
        chainId: 1,
        verifyingContract: '0x0000000000000000000000000000000000000000'
      },
      types: {
        Message: [
          { name: 'content', type: 'string' }
        ]
      },
      message: {
        content: 'Hello, world!'
      }
    }

    const signature = await account0.signTypedData(TYPED_DATA)

    const isValid = await account0.verifyTypedData(TYPED_DATA, signature)
    expect(isValid).toBe(true)
  }, TIMEOUT)

  test('should fetch multiple token balances via getTokenBalances multicall', async () => {
    const account = await wallet.getAccountByPath("0'/0/0")

    const balances = await account.getTokenBalances([
      testToken.target,
      MOCK_PAYMASTER_TOKEN_ADDRESS
    ])

    const expectedTestTokenBalance = await balanceOf(testToken, ACCOUNT0.address)
    const expectedPaymasterTokenBalance = await balanceOf(mockPaymasterToken, ACCOUNT0.address)

    expect(balances[testToken.target]).toBe(expectedTestTokenBalance)
    expect(balances[MOCK_PAYMASTER_TOKEN_ADDRESS]).toBe(expectedPaymasterTokenBalance)
  }, TIMEOUT)

  test('should dispose the wallet and erase the private keys of the accounts', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const account0 = await wallet.getAccount(0)
    const account1 = await wallet.getAccount(1)

    wallet.dispose()

    const MESSAGE = 'Hello, world!'

    const TRANSACTION = {
      to: '0xa460AEbce0d3A4BecAd8ccf9D6D4861296c503Bd',
      value: 1_000
    }

    const TRANSFER = {
      token: testToken.target,
      recipient: '0xa460AEbce0d3A4BecAd8ccf9D6D4861296c503Bd',
      amount: 100
    }

    for (const account of [account0, account1]) {
      expect(account.keyPair.privateKey).toBe(undefined)

      await expect(account.sign(MESSAGE)).rejects.toThrow('Uint8Array expected')
      await expect(account.sendTransaction(TRANSACTION)).rejects.toThrow()
      await expect(account.transfer(TRANSFER)).rejects.toThrow()
    }

    consoleSpy.mockRestore()
  }, TIMEOUT)

  test('should create a wallet with a low transfer max fee, derive an account, try to transfer some tokens and gracefully fail', async () => {
    const config = {
      provider: 'http://localhost:8545',
      bundlerUrl: 'http://localhost:4337',
      paymasterUrl: 'http://localhost:3000?pimlico',
      paymasterAddress: paymasterAddress,
      delegationAddress: DELEGATION_ADDRESS,
      paymasterToken: {
        address: MOCK_PAYMASTER_TOKEN_ADDRESS
      },
      transferMaxFee: 100
    }

    const wallet = new WalletManagerEvm7702Gasless(SEED_PHRASE, config)

    const account = await wallet.getAccount(0)

    const TRANSFER = {
      token: testToken.target,
      recipient: '0xa460AEbce0d3A4BecAd8ccf9D6D4861296c503Bd',
      amount: 100
    }

    await expect(account.transfer(TRANSFER))
      .rejects.toThrow('Exceeded maximum fee cost for transfer operation.')
  }, TIMEOUT)

  test('should use cached fee when sendTransaction is called with the same quoted params', async () => {
    const account0 = await wallet.getAccountByPath("0'/0/0")
    account0._quoteCache.clear()
    const gasCostSpy = jest.spyOn(account0, '_getUserOperationGasCost')

    const TX = {
      to: ACCOUNT1.address,
      value: 0
    }

    const { fee: quotedFee } = await account0.quoteSendTransaction(TX)
    expect(quotedFee).toBeGreaterThan(0n)
    expect(gasCostSpy).toHaveBeenCalledTimes(1)

    const { hash, fee: sendFee } = await account0.sendTransaction(TX)
    await waitForTx(hash, account0)
    expect(sendFee).toBe(quotedFee)
    expect(gasCostSpy).toHaveBeenCalledTimes(1)

    gasCostSpy.mockRestore()
  }, TIMEOUT)

  test('should not use cached fee when sendTransaction params differ from quoted params', async () => {
    const account0 = await wallet.getAccountByPath("0'/0/0")
    const gasCostSpy = jest.spyOn(account0, '_getUserOperationGasCost')

    const TX_A = {
      to: ACCOUNT1.address,
      value: 0
    }

    const TX_B = {
      to: ACCOUNT0.address,
      value: 0
    }

    await account0.quoteSendTransaction(TX_A)
    expect(gasCostSpy).toHaveBeenCalledTimes(1)

    const { hash: hashB } = await account0.sendTransaction(TX_B)
    await waitForTx(hashB, account0)
    expect(gasCostSpy).toHaveBeenCalledTimes(2)

    gasCostSpy.mockRestore()
  }, TIMEOUT)

  describe('with EIP-1193 provider', () => {
    let walletEip1193

    beforeEach(() => {
      const eip1193Provider = {
        request ({ method, params }) {
          return ethersProvider.send(method, params ?? [])
        }
      }

      const config = {
        provider: eip1193Provider,
        bundlerUrl: 'http://localhost:4337',
        paymasterUrl: 'http://localhost:3000?pimlico',
        paymasterAddress,
        delegationAddress: DELEGATION_ADDRESS,
        paymasterToken: {
          address: MOCK_PAYMASTER_TOKEN_ADDRESS
        }
      }

      walletEip1193 = new WalletManagerEvm7702Gasless(SEED_PHRASE, config)
    })

    test('should derive accounts with the same 7702 account addresses as the URL-provider wallet', async () => {
      const account0 = await walletEip1193.getAccountByPath("0'/0/0")
      const account1 = await walletEip1193.getAccountByPath("0'/0/1")

      expect(await account0.getAddress()).toBe(ACCOUNT0.address)
      expect(await account1.getAddress()).toBe(ACCOUNT1.address)
    }, TIMEOUT)

    test('should quote and send a transaction using an Eip1193Provider', async () => {
      const account0 = await walletEip1193.getAccountByPath("0'/0/0")
      const account1 = await walletEip1193.getAccountByPath("0'/0/1")

      const TX = { to: await account1.getAddress(), value: 0 }

      const { fee: estimatedFee } = await account0.quoteSendTransaction(TX)
      const { hash, fee } = await account0.sendTransaction(TX)
      const receipt = await waitForTx(hash, account0)

      expect(receipt.status).toBe(1)
      expect(receipt.to).toBe(ENTRY_POINT_ADDRESS)
      expect(fee).toBe(estimatedFee)
    }, TIMEOUT)

    test('should quote and transfer a token using an Eip1193Provider', async () => {
      const account0 = await walletEip1193.getAccountByPath("0'/0/0")

      const TRANSFER = {
        token: testToken.target,
        recipient: ACCOUNT1.address,
        amount: 1n
      }

      const { fee: estimatedFee } = await account0.quoteTransfer(TRANSFER)
      const { hash, fee } = await account0.transfer(TRANSFER)
      const receipt = await waitForTx(hash, account0)

      expect(receipt.status).toBe(1)
      expect(fee).toBe(estimatedFee)
    }, TIMEOUT)

    test('should accept an array provider of multiple formats', async () => {
      const eip1193Provider = {
        request ({ method, params }) {
          return ethersProvider.send(method, params ?? [])
        }
      }

      const config = {
        provider: [eip1193Provider, 'http://localhost:8545'],
        bundlerUrl: 'http://localhost:4337',
        paymasterUrl: 'http://localhost:3000?pimlico',
        paymasterAddress,
        delegationAddress: DELEGATION_ADDRESS,
        paymasterToken: { address: MOCK_PAYMASTER_TOKEN_ADDRESS }
      }

      const arrayProviderWallet = new WalletManagerEvm7702Gasless(SEED_PHRASE, config)
      const account0 = await arrayProviderWallet.getAccountByPath("0'/0/0")

      const TX = { to: ACCOUNT1.address, value: 0 }
      const { hash } = await account0.sendTransaction(TX)
      const receipt = await waitForTx(hash, account0)

      expect(receipt.status).toBe(1)
    }, TIMEOUT)
  })

  test('should re-quote when cached fee has expired', async () => {
    const account0 = await wallet.getAccountByPath("0'/0/0")
    const gasCostSpy = jest.spyOn(account0, '_getUserOperationGasCost')

    const TX = {
      to: ACCOUNT1.address,
      value: 0
    }

    const { fee } = await account0.quoteSendTransaction(TX)
    expect(fee).toBeGreaterThan(0n)
    expect(gasCostSpy).toHaveBeenCalledTimes(1)

    const txKey = account0._quoteCache.keys().next().value
    account0._quoteCache.get(txKey).createdAt = Date.now() - 3 * 60 * 1_000

    const { hash } = await account0.sendTransaction(TX)
    await waitForTx(hash, account0)
    expect(gasCostSpy).toHaveBeenCalledTimes(2)

    gasCostSpy.mockRestore()
  }, TIMEOUT)

  test('should return 0n fee for sponsored transactions', async () => {
    const account0 = await wallet.getAccountByPath("0'/0/0")
    account0._quoteCache.clear()
    const gasCostSpy = jest.spyOn(account0, '_getUserOperationGasCost')

    const TX = {
      to: ACCOUNT1.address,
      value: 0
    }

    const sponsoredConfig = {
      isSponsored: true,
      paymasterUrl: 'http://localhost:3000?pimlico'
    }

    const { fee } = await account0.quoteSendTransaction(TX, sponsoredConfig)
    expect(fee).toBe(0n)
    expect(gasCostSpy).toHaveBeenCalledTimes(0)

    gasCostSpy.mockRestore()
  }, TIMEOUT)

  test.skip('should not consume cached transfer fee when approve is called in between', async () => {
    const account0 = await wallet.getAccountByPath("0'/0/0")
    account0._quoteCache.clear()
    const gasCostSpy = jest.spyOn(account0, '_getUserOperationGasCost')

    const TRANSFER = {
      token: testToken.target,
      recipient: ACCOUNT1.address,
      amount: 1n
    }

    const { fee: quotedFee } = await account0.quoteTransfer(TRANSFER)
    expect(gasCostSpy).toHaveBeenCalledTimes(1)

    const APPROVE_TRANSACTION = {
      to: testToken.target,
      value: 0,
      data: testToken.interface.encodeFunctionData('approve', [ACCOUNT1.address, 100n])
    }

    const { hash: approveHash } = await account0.sendTransaction(APPROVE_TRANSACTION)
    await waitForTx(approveHash, account0)
    expect(gasCostSpy).toHaveBeenCalledTimes(2)

    const { hash, fee: transferFee } = await account0.transfer(TRANSFER)
    await waitForTx(hash, account0)
    expect(gasCostSpy).toHaveBeenCalledTimes(2)

    expect(transferFee).toBe(quotedFee)

    gasCostSpy.mockRestore()
  }, TIMEOUT)
})
