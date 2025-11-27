import { Command } from 'commander';
import { ethers, BrowserProvider } from "ethers"
import path from 'path'
import axios, { AxiosResponse } from 'axios'
import { runTestFiles } from './runTestFiles'
import fs from './fileSystem'
import { Provider, extendProvider } from '@remix-project/remix-simulator'
import { CompilerConfiguration } from './types'
import Log from './logger'
import colors from 'colors'
const logger = new Log()
const log = logger.logger

const commander = new Command();
// parse verbosity
function mapVerbosity (v: string) {
  const levels = {
    '0': 'error',
    '1': 'warn',
    '2': 'info',
    '3': 'verbose',
    '4': 'debug',
    '5': 'silly'
  }
  return levels[v]
}

function mapOptimize (v: string) {
  const optimize = {
    true: true,
    false: false
  }
  return optimize[v]
}

const version = require('../package.json').version // eslint-disable-line

commander.version(version)

commander.command('version').description('output the version number').action(function () {
  console.log(version)
})

commander.command('help').description('output usage information').action(function () {
  commander.help()
})

// get current version
commander
  .option('-c, --compiler <string>', 'set compiler version (e.g: 0.6.1, 0.7.1 etc)')
  .option('-e, --evm <string>', 'set EVM version (e.g: petersburg, istanbul etc)')
  .option('-o, --optimize <bool>', 'enable/disable optimization', mapOptimize)
  .option('-r, --runs <number>', 'set runs (e.g: 150, 250 etc)')
  .option('-v, --verbose <level>', 'set verbosity level (0 to 5)', mapVerbosity)
  .option('-f, --fork <string>', 'set hard fork (e.g: istanbul, berlin etc. See full list of hard forks here: https://github.com/ethereumjs/ethereumjs-monorepo/tree/master/packages/common/src/hardforks.ts)')
  .option('-n, --nodeUrl <string>', 'set node url (e.g: https://mainnet.infura.io/v3/your-api-key)')
  .option('-b, --blockNumber <string>', 'set block number (e.g: 123456)')
  .option('-k, --killProcess <bool>', 'kill process when tests fail')
  .argument('file_path', 'path to test file or directory')
  .action(async (file_path) => {
    const options = commander.opts();
    // Check if path exists
    if (!fs.existsSync(file_path)) {
      log.error(file_path + ' not found')
      process.exit(1)
    }

    // Check if path is for a directory
    const isDirectory = fs.lstatSync(file_path).isDirectory()

    // If path is for a file, file name must have `_test.sol` suffix
    if (!isDirectory && !file_path.endsWith('_test.sol')) {
      log.error('Test filename should end with "_test.sol"')
      process.exit(1)
    }

    // Console message
    console.log(colors.bold('\n\t👁\t:: Running tests using remix-tests ::\t👁\n'))

    // Set logger verbosity
    if (options.verbose) {
      logger.setVerbosity(options.verbose)
      log.info('verbosity level set to ' + options.verbose.blue)
    }

    const compilerConfig = {} as CompilerConfiguration
    if (options.compiler) {
      const compVersion = options.compiler
      const baseURL = 'https://binaries.soliditylang.org/wasm/'
      const response: AxiosResponse = await axios.get(baseURL + 'list.json')
      const { releases, latestRelease } = response.data as { releases: string[], latestRelease: string }
      const compString = releases ? releases[compVersion] : null
      if (!compString) {
        log.error(`No compiler found in releases with version ${compVersion}`)
        process.exit(1)
      } else {
        compilerConfig.currentCompilerUrl = compString.replace('soljson-', '').replace('.js', '')
        log.info(`Compiler version set to ${compVersion}. Latest version is ${latestRelease}`)
      }
    }

    if (options.evm) {
      compilerConfig.evmVersion = options.evm
      log.info(`EVM set to ${compilerConfig.evmVersion}`)
    }

    if (options.optimize) {
      compilerConfig.optimize = options.optimize
      log.info(`Optimization is ${compilerConfig.optimize ? 'enabled' : 'disabled'}`)
    }

    if (options.runs) {
      if (!options.optimize) {
        log.error('Optimization should be enabled for runs')
        process.exit(1)
      }
      compilerConfig.runs = options.runs
      log.info(`Runs set to ${compilerConfig.runs}`)
    }

    if (options.fork && options.nodeUrl) {
      log.info('Using hard fork ' + colors.green(options.fork) + ' and node url ' + colors.blue(options.nodeUrl))
    }

    const providerConfig = {
      fork: options.fork || null,
      nodeUrl: options.nodeUrl || null,
      blockNumber: options.blockNumber || null
    }
    const simulatorProvider: any = new Provider(providerConfig)
    await simulatorProvider.init()
    const provider: BrowserProvider = new ethers.BrowserProvider(simulatorProvider as any)
    extendProvider(provider)
    runTestFiles(path.resolve(file_path), isDirectory, provider, compilerConfig, (error, totalPassing, totalFailing) => {
      if (error) process.exit(1)
      if (totalFailing > 0 && options.killProcess) process.exit(1)
    })
  })

if (!process.argv.slice(2).length) {
  log.error('Please specify a file or directory path')
  process.exit(1)
}
commander.parse(process.argv)
