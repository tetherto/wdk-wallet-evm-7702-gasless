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

import { execFileSync, execSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const directory = mkdtempSync(join(tmpdir(), 'wdk-7702-package-'))
const root = fileURLToPath(new URL('../../', import.meta.url))
console.log(`Package consumer evidence: ${directory}`)

const packed = JSON.parse(execSync('npm pack --ignore-scripts --json', {
  cwd: root,
  env: { ...process.env, npm_config_pack_destination: directory },
  encoding: 'utf8',
  timeout: 30000
}))[0]

writeFileSync(join(directory, 'package.json'), JSON.stringify({
  private: true,
  type: 'module',
  dependencies: {
    '@tetherto/wdk-wallet-evm-7702-gasless': `file:${join(directory, packed.filename)}`,
    '@tetherto/wdk-wallet-evm': '1.0.0-beta.19',
    'evm-17': 'npm:@tetherto/wdk-wallet-evm@1.0.0-beta.17',
    'evm-18': 'npm:@tetherto/wdk-wallet-evm@1.0.0-beta.18',
    ethers: '6.17.0',
    abstractionkit: '0.3.8',
    typescript: '5.8.3',
    '@types/node': '22.15.30'
  }
}, null, 2))

for (const file of ['consumer.mjs', 'consumer.ts']) {
  copyFileSync(new URL(file, import.meta.url), join(directory, file))
}
execSync('npm install --ignore-scripts --no-audit --no-fund', {
  cwd: directory,
  stdio: 'inherit',
  timeout: 120000
})
execFileSync(process.execPath, ['consumer.mjs'], { cwd: directory, stdio: 'inherit', timeout: 30000 })
execFileSync(process.execPath, [
  'node_modules/typescript/bin/tsc', '--strict', '--noEmit', '--target', 'ES2022',
  '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--skipLibCheck',
  '--pretty', 'false', 'consumer.ts'
], { cwd: directory, stdio: 'inherit', timeout: 30000 })
console.log('Published consumer runtime and constructor declarations passed for EVM beta.17, beta.18 and beta.19.')
