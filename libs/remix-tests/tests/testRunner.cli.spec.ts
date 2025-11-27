import { spawnSync, execSync } from 'child_process'
import { resolve } from 'path'
import { expect } from 'chai';

describe('testRunner: remix-tests CLI', function(){
  this.timeout(120000)
  // remix-tests binary, after build, is used as executable

  const executablePath = resolve(__dirname + '/../../../dist/libs/remix-tests/bin/remix-tests')

  const result = spawnSync('ls', { cwd: resolve(__dirname + '/../../../dist/libs/remix-tests') })
  if (result) {
    const dirContent = result.stdout.toString()
    // Install dependencies if 'node_modules' is not already present
    if (!dirContent.includes('node_modules')) {
      execSync('yarn add @remix-project/remix-lib ../../libs/remix-lib', { cwd: resolve(__dirname + '/../../../dist/libs/remix-tests') })
      execSync('yarn add @remix-project/remix-url-resolver ../../libs/remix-url-resolver', { cwd: resolve(__dirname + '/../../../dist/libs/remix-tests') })
      execSync('yarn add @remix-project/remix-solidity ../../libs/remix-solidity', { cwd: resolve(__dirname + '/../../../dist/libs/remix-tests') })
      execSync('yarn add @remix-project/remix-simulator ../../libs/remix-simulator', { cwd: resolve(__dirname + '/../../../dist/libs/remix-tests') })
      execSync('yarn install', { cwd: resolve(__dirname + '/../../../dist/libs/remix-tests') })
    }
  }

  describe('test various CLI options', function() {
    it('remix-tests version', () => {
      const res = spawnSync(executablePath, ['-V'])
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      expect(res.stdout.toString().trim()).to.equal(require('../package.json').version, `actual value: ${res.stdout.toString()}`)
    })

    it('remix-tests help', () => {
      const res = spawnSync(executablePath, ['-h'])
      console.log(res.stdout.toString())
      const expectedHelp = `Usage: remix-tests [options] [command] <file_path>

Arguments:
  file_path                   path to test file or directory

Options:
  -V, --version               output the version number
  -c, --compiler <string>     set compiler version (e.g: 0.6.1, 0.7.1 etc)
  -e, --evm <string>          set EVM version (e.g: petersburg, istanbul etc)
  -o, --optimize <bool>       enable/disable optimization
  -r, --runs <number>         set runs (e.g: 150, 250 etc)
  -v, --verbose <level>       set verbosity level (0 to 5)
  -f, --fork <string>         set hard fork (e.g: istanbul, berlin etc. See
                              full list of hard forks here:
                              https://github.com/ethereumjs/ethereumjs-monorepo/tree/master/packages/common/src/hardforks.ts)
  -n, --nodeUrl <string>      set node url (e.g:
                              https://mainnet.infura.io/v3/your-api-key)
  -b, --blockNumber <string>  set block number (e.g: 123456)
  -k, --killProcess <bool>    kill process when tests fail
  -h, --help                  display help for command

Commands:
  version                     output the version number
  help                        output usage information`
      expect(res.stdout.toString().trim()).to.equal(expectedHelp)
    })

    it('remix-tests running a test file', function() {
      const res = spawnSync(executablePath, [resolve(__dirname + '/examples_0/assert_ok_test.sol')])
      // match initial lines
      console.log(res.stdout.toString())
      expect(res.stdout.toString().trim()).to.match(/:: Running tests using remix-tests ::/)
      expect(res.stdout.toString().trim()).to.match(/creation of library remix_tests.sol:Assert pending.../)
      // match test result
      expect(res.stdout.toString().trim()).to.match(/AssertOkTest/)
      expect(res.stdout.toString().trim()).to.match(/AssertOkTest okPassTest/) // check if console.log is printed
      expect(res.stdout.toString().trim()).to.match(/Ok pass test/)
      expect(res.stdout.toString().trim()).to.match(/AssertOkTest okFailTest/) // check if console.log is printed
      expect(res.stdout.toString().trim()).to.match(/Ok fail test/)
      // match fail test details
      expect(res.stdout.toString().trim()).to.match(/Expected value should be ok to: true/)
      expect(res.stdout.toString().trim()).to.match(/Received: false/)
      expect(res.stdout.toString().trim()).to.match(/Message: okFailTest fails/)

    })

    it('remix-tests running a test file with custom compiler version', () => {
      const res = spawnSync(executablePath, ['--compiler', '0.7.4', resolve(__dirname + '/examples_0/assert_ok_test.sol')])
      // match initial lines
      expect(res.stdout.toString().trim()).to.contain('Compiler version set to 0.7.4. Latest version is')
      expect(res.stdout.toString().trim()).to.contain('Loading remote solc version v0.7.4+commit.3f05b770 ...')
      expect(res.stdout.toString().trim()).to.match(/:: Running tests using remix-tests ::/)
      expect(res.stdout.toString().trim()).to.match(/creation of library remix_tests.sol:Assert pending.../)
      // match test result
      expect(res.stdout.toString().trim()).to.match(/Ok pass test/)
      expect(res.stdout.toString().trim()).to.match(/Ok fail test/)
      // match fail test details
      expect(res.stdout.toString().trim()).to.match(/Message: okFailTest fails/)
    })

    it('remix-tests running a test file with unavailable custom compiler version (should fail)', () => {
      const res = spawnSync(executablePath, ['--compiler', '1.10.4', resolve(__dirname + '/examples_0/assert_ok_test.sol')])
      // match initial lines
      expect(res.stdout.toString().trim()).to.contain('No compiler found in releases with version 1.10.4')
    })

    it('remix-tests running a test file with custom EVM', () => {
      const res = spawnSync(executablePath, ['--evm', 'petersburg', resolve(__dirname + '/examples_0/assert_ok_test.sol')])
      // match initial lines
      expect(res.stdout.toString().trim()).to.contain('EVM set to petersburg')
      expect(res.stdout.toString().trim()).to.match(/:: Running tests using remix-tests ::/)
      expect(res.stdout.toString().trim()).to.match(/creation of library remix_tests.sol:Assert pending.../)
      // match test result
      expect(res.stdout.toString().trim()).to.match(/Ok pass test/)
      expect(res.stdout.toString().trim()).to.match(/Ok fail test/)
      // match fail test details
      expect(res.stdout.toString().trim()).to.match(/Message: okFailTest fails/)
    })

    it('remix-tests running a test file by enabling optimization', () => {
      const res = spawnSync(executablePath, ['--optimize', 'true', resolve(__dirname + '/examples_0/assert_ok_test.sol')])
      // match initial lines
      expect(res.stdout.toString().trim().includes('Optimization is enabled'))
      expect(res.stdout.toString().trim()).to.match(/:: Running tests using remix-tests ::/)
      expect(res.stdout.toString().trim()).to.match(/creation of library remix_tests.sol:Assert pending.../)
      // match test result
      expect(res.stdout.toString().trim()).to.match(/Ok pass test/)
      expect(res.stdout.toString().trim()).to.match(/Ok fail test/)
      // match fail test details
      expect(res.stdout.toString().trim()).to.match(/Message: okFailTest fails/)
    })

    it('remix-tests running a test file by enabling optimization and setting runs', () => {
      const res = spawnSync(executablePath, ['--optimize', 'true', '--runs', '300', resolve(__dirname + '/examples_0/assert_ok_test.sol')])
      // match initial lines
      expect(res.stdout.toString().trim()).to.contain('Optimization is enabled')
      expect(res.stdout.toString().trim()).to.contain('Runs set to 300')
      expect(res.stdout.toString().trim()).to.match(/:: Running tests using remix-tests ::/)
      expect(res.stdout.toString().trim()).to.match(/creation of library remix_tests.sol:Assert pending.../)
      // match test result
      expect(res.stdout.toString().trim()).to.match(/Ok pass test/)
      expect(res.stdout.toString().trim()).to.match(/Ok fail test/)
      // match fail test details
      expect(res.stdout.toString().trim()).to.match(/Message: okFailTest fails/)
    })

    it('remix-tests running a test file without enabling optimization and setting runs (should fail)', () => {
      const res = spawnSync(executablePath, ['--runs', '300', resolve(__dirname + '/examples_0/assert_ok_test.sol')])
      // match initial lines
      expect(res.stdout.toString().trim()).to.contain('Optimization should be enabled for runs')
    })

    it('remix-tests running a test file with all options', () => {
      const res = spawnSync(executablePath, ['--compiler', '0.7.5', '--evm', 'istanbul', '--optimize', 'true', '--runs', '250', resolve(__dirname + '/examples_0/assert_ok_test.sol')])
      // match initial lines
      expect(res.stdout.toString().trim()).to.contain('Compiler version set to 0.7.5. Latest version is')
      expect(res.stdout.toString().trim()).to.contain('Loading remote solc version v0.7.5+commit.eb77ed08 ...')
      expect(res.stdout.toString().trim()).to.contain('EVM set to istanbul')
      expect(res.stdout.toString().trim()).to.contain('Optimization is enabled')
      expect(res.stdout.toString().trim()).to.contain('Runs set to 250')
      expect(res.stdout.toString().trim()).to.match(/:: Running tests using remix-tests ::/)
      expect(res.stdout.toString().trim()).to.match(/creation of library remix_tests.sol:Assert pending.../)
      // match test result
      expect(res.stdout.toString().trim()).to.match(/Ok pass test/)
      expect(res.stdout.toString().trim()).to.match(/Ok fail test/)
      // match fail test details
      expect(res.stdout.toString().trim()).to.match(/Message: okFailTest fails/)
    })

  })
})
