// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { verifyMessage, verifyTypedData } from 'ethers'
import { Simple7702Account } from 'abstractionkit'
import { WalletAccountEvm7702Gasless } from '@tetherto/wdk-wallet-evm-7702-gasless'

const require = createRequire(import.meta.url)
const internalRequire = createRequire(require.resolve('@tetherto/wdk-wallet-evm-7702-gasless'))
const internalPath = internalRequire.resolve('@tetherto/wdk-wallet-evm')
const { WalletAccountEvm: InternalAccount } = await import(pathToFileURL(internalPath))
const rpcCalls = []
const provider = {
  request: async ({ method }) => {
    rpcCalls.push(method)
    throw new Error(`Unexpected RPC request: ${method}`)
  }
}
const config = {
  provider,
  bundlerUrl: 'http://127.0.0.1:1',
  delegationAddress: Simple7702Account.DEFAULT_DELEGATEE_ADDRESS,
  isSponsored: true,
  chainId: 31337
}
const message = 'Cross-package account compatibility'
const typedData = {
  domain: { name: 'Compatibility', version: '1', chainId: 31337 },
  types: { Probe: [{ name: 'value', type: 'uint256' }] },
  message: { value: 1n }
}

for (const [name, version] of [['evm-17', 17], ['evm-18', 18], ['@tetherto/wdk-wallet-evm', 19]]) {
  const accountPath = require.resolve(name)
  const { WalletAccountEvm } = await import(pathToFileURL(accountPath))
  assert.equal(require(`${name}/package`).version, `1.0.0-beta.${version}`)
  assert.equal(accountPath === internalPath, version === 19)
  assert.equal(WalletAccountEvm === InternalAccount, version === 19)
  const owner = new WalletAccountEvm(randomBytes(64), "0'/0/0", { provider, chainId: 31337 })
  assert.equal(owner instanceof InternalAccount, version === 19)
  const address = await owner.getAddress()
  const calls = { sign: [], signTypedData: [], dispose: [] }
  for (const method of Object.keys(calls)) {
    const original = owner[method]
    owner[method] = function (...args) {
      assert.equal(this, owner)
      calls[method].push(args)
      return original.apply(this, args)
    }
  }
  const account = new WalletAccountEvm7702Gasless(owner, config)
  assert.equal(await account.getAddress(), address)
  assert.equal(account.index, owner.index)
  assert.equal(account.path, owner.path)
  assert.equal(verifyMessage(message, await account.sign(message)), address)
  assert.equal(verifyTypedData(typedData.domain, typedData.types, typedData.message,
    await account.signTypedData(typedData)), address)
  assert.deepEqual(calls.sign, [[message]])
  assert.deepEqual(calls.signTypedData, [[typedData]])
  const rejection = new Error('Owner rejected signing')
  owner.sign = async () => { throw rejection }
  await assert.rejects(account.sign(message), error => error === rejection)
  account.dispose()
  assert.deepEqual(calls.dispose, [[]])
  assert.equal(owner.keyPair.privateKey, null)

  const privateKeyOwner = WalletAccountEvm.fromPrivateKey(randomBytes(32))
  const privateKeyAccount = new WalletAccountEvm7702Gasless(privateKeyOwner, config)
  assert.equal(privateKeyAccount.index, undefined)
  assert.equal(privateKeyAccount.path, undefined)
  assert.equal(verifyMessage(message, await privateKeyAccount.sign(message)), await privateKeyOwner.getAddress())
  privateKeyAccount.dispose()
  assert.equal(privateKeyOwner.keyPair.privateKey, null)
  console.log(JSON.stringify({ version, accountPath, internalPath, passed: true }))
}
assert.deepEqual(rpcCalls, [])
