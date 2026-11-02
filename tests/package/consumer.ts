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

import { randomBytes } from 'node:crypto'
import { WalletAccountEvm as Evm17 } from 'evm-17'
import { WalletAccountEvm as Evm18 } from 'evm-18'
import { WalletAccountEvm as Evm19 } from '@tetherto/wdk-wallet-evm'
import { WalletAccountEvm7702Gasless } from '@tetherto/wdk-wallet-evm-7702-gasless'
import type { Evm7702GaslessOwnerAccount } from '@tetherto/wdk-wallet-evm-7702-gasless'
import { Simple7702Account } from 'abstractionkit'

const config = {
  provider: 'http://127.0.0.1:1',
  bundlerUrl: 'http://127.0.0.1:1',
  delegationAddress: Simple7702Account.DEFAULT_DELEGATEE_ADDRESS,
  isSponsored: true as const
}
const owners: Evm7702GaslessOwnerAccount[] = [
  new Evm17(randomBytes(64), "0'/0/0"),
  new Evm18(randomBytes(64), "0'/0/0"),
  new Evm19(randomBytes(64), "0'/0/0")
]
for (const owner of owners) new WalletAccountEvm7702Gasless(owner, config)
new WalletAccountEvm7702Gasless(randomBytes(64), "0'/0/0", config)
// @ts-expect-error An address alone does not provide signing or disposal capabilities.
new WalletAccountEvm7702Gasless({ address: owners[0].address }, config)
