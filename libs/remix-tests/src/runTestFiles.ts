import async from 'async'
import fs from './fileSystem'
import { runTest } from './testRunner'
import { TestResultInterface, ResultsInterface, CompilerConfiguration, compilationInterface, ASTInterface, Options, AstNode } from './types'
import colors from 'colors'
import { format } from 'util'
import { compileFileOrFiles } from './compiler'
import { deployAll } from './deployer'
import { BrowserProvider } from 'ethers'

/**
 * @dev run test contract files (used for CLI)
 * @param filepath Path of file
 * @param isDirectory True, if path is a directory
 * @param provider BrowserProvider
 * @param finalCallback optional callback to run finally
 * @param opts Options
 */

// eslint-disable-next-line @typescript-eslint/no-empty-function
export function runTestFiles (filepath: string, isDirectory: boolean, provider: BrowserProvider, compilerConfig: CompilerConfiguration, finalCallback: any = () => {}, opts?: Options) {
  opts = opts || {}
  compilerConfig = compilerConfig || {} as CompilerConfiguration
  const sourceASTs: any = {}
  const printLog = (log: string[]) => {
    let formattedLog
    if (typeof log[0] === 'string' && (log[0].includes('%s') || log[0].includes('%d'))) {
      formattedLog = format(log[0], ...log.slice(1))
    } else {
      formattedLog = log.join(' ')
    }
    signale.log(formattedLog)
  }
  const { Signale } = require('signale') // eslint-disable-line
  // signale configuration
  const options = {
    types: {
      result: {
        badge: '\t✓',
        label: '',
        color: 'greenBright'
      },
      name: {
        badge: '\n\t◼',
        label: '',
        color: 'whiteBright'
      },
      log: {
        badge: '\t',
        label: '',
        color: 'white'
      },
      error: {
        badge: '\t✘',
        label: '',
        color: 'redBright'
      }
    }
  }
  const signale = new Signale(options)
  let accounts = opts['accounts'] || null
  async.waterfall([
    function getAccountList (next) {
      if (accounts) return next(null)
      provider.send("eth_requestAccounts", [])
        .then(_accounts => {
          accounts = _accounts
          next(null)
        })
        .catch((_err: Error | null | undefined) => next(null))
    },
    function compile (next) {
      compileFileOrFiles(filepath, isDirectory, { accounts }, compilerConfig, next)
    },
    function deployAllContracts (compilationResult: compilationInterface, asts: ASTInterface, next) {
      // Extract AST of test contract file source
      for (const filename in asts) {
        if (filename.endsWith('_test.sol')) { sourceASTs[filename] = asts[filename].ast }
      }
      deployAll(compilationResult, provider, accounts, false, null, (err, contracts) => {
        if (err) {
          // If contract deployment fails because of 'Out of Gas' error, try again with double gas
          // This is temporary, should be removed when remix-tests will have a dedicated UI to
          // accept deployment params from UI
          if (err.error.includes('The contract code couldn\'t be stored, please check your gas limit')) {
            deployAll(compilationResult, provider, accounts, true, null, (error, contracts) => {
              if (error) next([{ message: 'contract deployment failed after trying twice: ' + (error.innerError || error.error), severity: 'error' }]) // IDE expects errors in array
              else next(null, compilationResult, contracts)
            })
          } else { next([{ message: 'contract deployment failed: ' + (err.innerError || err.error), severity: 'error' }]) } // IDE expects errors in array
        } else { next(null, compilationResult, contracts) }
      })
    },
    function determineTestContractsToRun (compilationResult: compilationInterface, contracts: any, next) {
      const contractsToTest: string[] = []
      const contractsToTestDetails: any[] = []
      const gatherContractsFrom = function (filename: string) {
        if (!filename.endsWith('_test.sol')) {
          return
        }
        try {
          Object.keys(compilationResult[filename]).forEach(contractName => {
            contractsToTest.push(contractName)
            contractsToTestDetails.push(compilationResult[filename][contractName])
          })
        } catch (e) {
          console.error(e)
        }
      }
      if (isDirectory) {
        fs.walkSync(filepath, (foundpath: string) => {
          gatherContractsFrom(foundpath)
        })
      } else {
        gatherContractsFrom(filepath)
      }
      next(null, contractsToTest, contractsToTestDetails, contracts)
    },
    function runTests (contractsToTest: string[], contractsToTestDetails: any[], contracts: any, next) {
      let totalPassing = 0
      let totalFailing = 0
      let totalTime = 0

      const _testCallback = function (err: Error | null | undefined, result: TestResultInterface) {
        if (err) throw err
        if (result.type === 'contract') {
          signale.name(result.value)
          console.log('\n')
        } else if (result.type === 'testPass') {
          if (result?.hhLogs?.length) result.hhLogs.forEach(printLog)
          signale.result(result.value.white)
        } else if (result.type === 'testFailure') {
          if (result?.hhLogs?.length) result.hhLogs.forEach(printLog)
          signale.error(result.value.white)
          if (result.assertMethod) {
            console.log(colors.green('\t    Expected value should be ' + result.assertMethod + ' to: ' + result.expected))
            console.log(colors.red('\t    Received: ' + result.returned))
          }
          console.log(colors.red('\t    Message: ' + result.errMsg))
          console.log('\n')
        }
      }
      const _resultsCallback = (_err: Error | null | undefined, result: ResultsInterface, cb) => {
        totalPassing += result.passingNum
        totalFailing += result.failureNum
        totalTime += result.timePassed
        cb()
      }

      async.eachOfLimit(contractsToTest, 1, (contractName: string, index, cb) => {
        try {
          const fileAST: AstNode = sourceASTs[contracts[contractName]['filename']]
          runTest(contractName, contracts[contractName], contractsToTestDetails[index], fileAST, { accounts, provider }, _testCallback, (err, result) => {
            if (err) {
              console.log(err)
              return cb(err)
            }
            _resultsCallback(null, result, cb)
          })
        } catch (e) {
          console.error(e)
        }
      }, function (err) {
        if (err) {
          return next(err)
        }
        console.log('\n')
        console.log(colors.bold.underline('Tests Summary: '))

        if (totalPassing >= 0) {
          console.log(colors.green('Passed: ' + totalPassing))
        }
        if (totalFailing >= 0) {
          console.log(colors.red('Failed: ' + totalFailing))
        }
        console.log(colors.white('Time Taken: ' + totalTime + 's'))
        console.log('')
        next(null, totalPassing, totalFailing)
      })
    }
  ], finalCallback)
}
