import React from 'react' // eslint-disable-line
import { format } from 'util'
import { Plugin } from '@remixproject/engine'
import { compile, CompilerSettings } from '@remix-project/remix-solidity'
import { trackMatomoEvent } from '@remix-api'

const profile = {
  name: 'solidity-script',
  displayName: 'solidity-script',
  description: 'solidity-script',
  methods: ['execute']
}

export class SolidityScript extends Plugin {
  constructor() {
    super(profile)
  }

  async execute(path: string, functionName: string = 'run') {
    trackMatomoEvent(this, { category: 'SolidityScript', action: 'execute', name: 'script', isClick: true })
    this.call('terminal', 'log', `Running free function '${functionName}' from ${path}...`)
    let content = await this.call('fileManager', 'readFile', path)
    const params = await this.call('solidity', 'getCompilerQueryParameters')

    content = `
      // SPDX-License-Identifier: GPL-3.0

      pragma solidity >=0.7.1;

      import "${path}";

      contract SolidityScript {
          constructor () {}

          function remixRun () public view {
              ${functionName}();
          }
      }`
    const targets = { 'script.sol': { content } }

    // compile
    const settings: CompilerSettings = {
      evmVersion: params.evmVersion,
      optimizer: {
        enabled: params.optimize,
        runs: params.runs
      }
    }
    const compilation = await compile(
      targets,
      settings,
      params.language,
      params.version,
      async (url, cb) => {
        await this.call('contentImport', 'resolveAndSave', url)
          .then((result) => cb(null, result))
          .catch((error) => cb(error.message))
      })

    if (compilation.data.error) {
      this.call('terminal', 'log', compilation.data.error.formattedMessage)
    }
    if (compilation.data.errors && compilation.data.errors.length > 0) {
      compilation.data.errors.map((error) => {
        this.call('terminal', 'log', error.formattedMessage)
      })
    }

    await this.call('compilerArtefacts', 'saveCompilerAbstract', 'script.sol', compilation)
    // get the contract
    const contract = compilation.getContract('SolidityScript')
    if (!contract) {
      console.log('compilation failed')
      return
    }
    const bytecode = '0x' + contract.object.evm.bytecode.object
    const web3 = await this.call('blockchain', 'web3')
    const accounts = await this.call('blockchain', 'getAccounts')
    if (!accounts || accounts.length === 0) {
      throw new Error('no account available')
    }

    // deploy the contract
    let tx: any = {
      from: accounts[0],
      data: bytecode
    }
    let receipt
    const signer = await web3.getSigner(tx.from || 0)
    try {
      const { hash } = await signer.sendTransaction(tx)
      receipt = await web3.getTransactionReceipt(hash)
    } catch (e) {
      this.call('terminal', 'logHtml', e.message)
      return
    }

    tx = {
      from: accounts[0],
      to: receipt.contractAddress,
      data: '0x69d4394b' // function remixRun() public
    }
    let receiptCall

    try {
      const { hash } = await signer.sendTransaction(tx)
      receiptCall = await web3.getTransactionReceipt(hash)
    } catch (e) {
      this.call('terminal', 'logHtml', e.message)
      return
    }

    const hhlogs = await web3.remix.getHHLogsForTx(receiptCall.hash)

    if (hhlogs && hhlogs.length) {
      const finalLogs = (
        <div>
          <div>
            <b>console.log:</b>
          </div>
          {hhlogs.map((log) => {
            let formattedLog
            // Hardhat implements the same formatting options that can be found in Node.js' console.log,
            // which in turn uses util.format: https://nodejs.org/dist/latest-v12.x/docs/api/util.html#util_util_format_format_args
            // For example: console.log("Name: %s, Age: %d", remix, 6) will log 'Name: remix, Age: 6'
            // We check first arg to determine if 'util.format' is needed
            if (typeof log[0] === 'string' && (log[0].includes('%s') || log[0].includes('%d'))) {
              formattedLog = format(log[0], ...log.slice(1))
            } else {
              formattedLog = log.join(' ')
            }
            return <div>{formattedLog}</div>
          })}
        </div>
      )
      trackMatomoEvent(this, { category: 'udapp', action: 'hardhat', name: 'console.log', isClick: false })
      this.call('terminal', 'logHtml', finalLogs)
    }
  }
}
