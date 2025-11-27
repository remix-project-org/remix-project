import async, { ErrorCallback } from 'async'
import { compileContractSources, writeTestAccountsContract } from './compiler'
import { deployAll } from './deployer'
import { runTest } from './testRunner'
import { EventEmitter } from 'events'
import { extendProvider } from '@remix-project/remix-simulator'
import {
  FinalResult, SrcIfc, compilationInterface, ASTInterface, Options,
  TestResultInterface, AstNode, CompilerConfiguration
} from './types'
require('colors')

export class UnitTestRunner {
  event
  accountsLibCode
  testsAccounts: string[] | null
  provider
  compiler
  compilerConfig

  constructor () {
    this.event = new EventEmitter()
  }

  async init (provider = null, accounts = null) {
    this.provider = await this.createWeb3Provider(provider)
    this.testsAccounts = accounts || (this.provider && await this.provider.send("eth_requestAccounts", []) ) || []
    this.accountsLibCode = writeTestAccountsContract(this.testsAccounts)
  }

  async createWeb3Provider (provider) {
    const web3 = provider
    if (web3) extendProvider(provider)
    return web3
  }

  /**
   * @dev Run tests from source of a test contract file (used for IDE)
   * @param contractSources Sources of contract
   * @param compilerConfig current compiler configuration
   * @param testCallback Test callback
   * @param resultCallback Result Callback
   * @param finalCallback Final Callback
   * @param importFileCb Import file callback
   * @param opts Options
   */
  async runTestSources (contractSources: SrcIfc, newCompilerConfig: CompilerConfiguration, testCallback, resultCallback, deployCb:any, finalCallback: any, importFileCb, opts: Options) {
    opts = opts || {}
    const sourceASTs: any = {}
    if (opts.provider || opts.accounts) this.init(opts.provider, opts.accounts)
    async.waterfall([
      (next) => {
        compileContractSources(contractSources, newCompilerConfig, importFileCb, this, { accounts: this.testsAccounts, testFilePath: opts.testFilePath, event: this.event }, next)
      },
      (compilationResult: compilationInterface, asts: ASTInterface, next) => {
        for (const filename in asts) {
          if (filename.endsWith('_test.sol')) { sourceASTs[filename] = asts[filename].ast }
        }
        deployAll(compilationResult, this.provider, this.testsAccounts, false, deployCb, (err, contracts) => {
          if (err) {
            // If contract deployment fails because of 'Out of Gas' error, try again with double gas
            // This is temporary, should be removed when remix-tests will have a dedicated UI to
            // accept deployment params from UI
            if (err.includes('missing revert data')) {
              deployAll(compilationResult, this.provider, this.testsAccounts, true, deployCb, (error, contracts) => {
                if (error) next([{ message: 'contract deployment failed after trying twice: ' + (error || error.error), severity: 'error' }]) // IDE expects errors in array
                else next(null, compilationResult, contracts)
              })
            } else { next([{ message: 'contract deployment failed: ' + (err || err.error), severity: 'error' }]) } // IDE expects errors in array
          } else { next(null, compilationResult, contracts) }
        })
      },
      function determineTestContractsToRun (compilationResult: compilationInterface, contracts: any, next) {
        const contractsToTest: string[] = []
        const contractsToTestDetails: any[] = []

        for (const filename in compilationResult) {
          if (!filename.endsWith('_test.sol')) {
            continue
          }
          Object.keys(compilationResult[filename]).forEach(contractName => {
            contractsToTestDetails.push(compilationResult[filename][contractName])
            contractsToTest.push(contractName)
          })
        }
        next(null, contractsToTest, contractsToTestDetails, contracts)
      },
      (contractsToTest: string[], contractsToTestDetails: any[], contracts: any, next) => {
        let totalPassing = 0
        let totalFailing = 0
        let totalTime = 0
        const errors: any[] = []
        // eslint-disable-next-line handle-callback-err
        const _testCallback = function (err: Error | null | undefined, result: TestResultInterface) {
          if (result.type === 'testFailure') {
            errors.push(result)
          }
          testCallback(result)
        }

        const _resultsCallback = function (_err, result, cb) {
          resultCallback(_err, result, () => {}) // eslint-disable-line @typescript-eslint/no-empty-function
          totalPassing += result.passingNum
          totalFailing += result.failureNum
          totalTime += result.timePassed
          cb()
        }

        async.eachOfLimit(contractsToTest, 1, (contractName: string, index: string | number, cb: ErrorCallback) => {
          const fileAST: AstNode = sourceASTs[contracts[contractName]['filename']]
          runTest(contractName, contracts[contractName], contractsToTestDetails[index], fileAST, { accounts: this.testsAccounts, provider: this.provider }, _testCallback, (err, result) => {
            if (err) {
              return cb(err)
            }
            _resultsCallback(null, result, cb)
          })
        }, function (err) {
          if (err) {
            return next(err)
          }

          const finalResults: FinalResult = {
            totalPassing: 0,
            totalFailing: 0,
            totalTime: 0,
            errors: []
          }

          finalResults.totalPassing = totalPassing || 0
          finalResults.totalFailing = totalFailing || 0
          finalResults.totalTime = totalTime || 0
          finalResults.errors = []

          errors.forEach((error, _index) => {
            finalResults.errors.push({ context: error.context, value: error.value, message: error.errMsg })
          })
          next(null, finalResults)
        })
      }
    ], finalCallback)
  }
}
