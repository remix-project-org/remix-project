import * as async from 'async'
import { ethers } from 'ethers'
import * as assert from 'assert'
import { Provider, extendProvider } from '@remix-project/remix-simulator'
import { compileFileOrFiles } from '../src/compiler'
import { deployAll } from '../src/deployer'
import { runTest, compilationInterface } from '../src/index'
import { ResultsInterface, TestCbInterface } from '../src/index'

// deepEqualExcluding allows us to exclude specific keys whose values vary.
// In this specific test, we'll use this helper to exclude `time` keys.
// Assertions for the existence of these will be made at the correct places.
function deepEqualExcluding(a: any, b: any, excludedKeys: string[]) {
  function removeKeysFromObject(obj: any, excludedKeys: string[]) {
    if (obj !== Object(obj)) {
      return obj
    }

    if (Object.prototype.toString.call(obj) !== '[object Array]') {
      obj = Object.assign({}, obj)
      for (const key of excludedKeys) {
        delete obj[key]
      }

      return obj
    }

    const newObj = []
    for (const idx in obj) {
      newObj[idx] = removeKeysFromObject(obj[idx], excludedKeys);
    }

    return newObj
  }

  const aStripped: any = removeKeysFromObject(a, excludedKeys);
  const bStripped: any = removeKeysFromObject(b, excludedKeys);
  assert.deepEqual(aStripped, bStripped)
}

let accounts: string[]
const simulatorProvider: any = new Provider()

async function compileAndDeploy(filename: string, callback: any) {
  const sourceASTs: any = {}
  await simulatorProvider.init()
  const provider = new ethers.BrowserProvider(simulatorProvider)
  extendProvider(provider)
  let compilationData: any
  async.waterfall([
    function getAccountList(next: any): void {
      provider.send("eth_requestAccounts", [])
        .then(( _accounts: string[]) => {
          accounts = _accounts
          next(undefined)
        })
        .catch((_err: Error | null | undefined) => next(_err))
    },
    function compile(next: any): void {
      compileFileOrFiles(filename, false, { accounts, provider }, null, next)
    },
    function deployAllContracts(compilationResult: compilationInterface, asts, next: any): void {
      for (const filename in asts) {
        if (filename.endsWith('_test.sol'))
          sourceASTs[filename] = asts[filename].ast
      }
      // eslint-disable-next-line no-useless-catch
      try {
        compilationData = compilationResult
        deployAll(compilationResult, provider, accounts, false, null, next)
      } catch (e) {
        throw e
      }
    }
  ], function (_err: Error | null | undefined, contracts: any): void {
    callback(null, compilationData, contracts, sourceASTs, accounts, provider)
  })
}

describe('testRunner', function () {
  let tests: any[] = [], results: ResultsInterface;

  const testCallback: TestCbInterface = (err, test) => {
    if (err) { throw err }

    if (test.type === 'testPass' || test.type === 'testFailure') {
      assert.ok(test.time, 'test time not reported')
      assert.ok(!Number.isInteger(test.time || 0), 'test time should not be an integer')
    }

    tests.push(test)
  }

  const resultsCallback = (done) => {
    return (err, _results) => {
      if (err) { throw err }
      results = _results
      done()
    }
  }

  describe('#runTest', function () {
    this.timeout(10000)
    describe('assert library OK method tests', () => {
      const filename: string = __dirname + '/examples_0/assert_ok_test.sol'

      before((done) => {
        compileAndDeploy(filename, (_err: Error | null | undefined, compilationData: any, contracts: any, asts: any, accounts: string[], provider: any) => {
          runTest('AssertOkTest', contracts.AssertOkTest, compilationData[filename]['AssertOkTest'], asts[filename], { accounts, provider }, testCallback, resultsCallback(done))
        })
      })

      after(() => { tests = [] })

      it('should have 1 passing test', () => {
        assert.equal(results.passingNum, 1)
      })

      it('should have 1 failing test', () => {
        assert.equal(results.failureNum, 1)
      })

      const hhLogs1 = [["AssertOkTest", "okPassTest"]]
      const hhLogs2 = [["AssertOkTest", "okFailTest"]]
      it('should return', () => {
        deepEqualExcluding(tests, [
          { type: 'accountList', value: accounts },
          { type: 'contract', value: 'AssertOkTest', filename: __dirname + '/examples_0/assert_ok_test.sol' },
          { type: 'testPass', debugTxHash: '0x5b665752a4faf83229259b9b2811d3295be0af633b0051d4b90042283ef55707', value: 'Ok pass test', filename: __dirname + '/examples_0/assert_ok_test.sol', context: 'AssertOkTest', hhLogs: hhLogs1 },
          { type: 'testFailure', debugTxHash: '0xa0a30ad042a7fc3495f72be7ba788d705888ffbbec7173f60bb27e07721510f2', value: 'Ok fail test', filename: __dirname + '/examples_0/assert_ok_test.sol', errMsg: 'okFailTest fails', context: 'AssertOkTest', hhLogs: hhLogs2, assertMethod: 'ok', location: '366:36:0', expected: 'true', returned: 'false' },

        ], ['time','type','debugTxHash','location','expected','returned','errMsg','assertMethod','provider'])
      })
    })

    describe('assert library EQUAL method tests', function () {
      const filename: string = __dirname + '/examples_0/assert_equal_test.sol'

      before((done) => {
        compileAndDeploy(filename, (_err: Error | null | undefined, compilationData: any, contracts: any, asts: any, accounts: string[], provider: any) => {
          runTest('AssertEqualTest', contracts.AssertEqualTest, compilationData[filename]['AssertEqualTest'], asts[filename], { accounts, provider }, testCallback, resultsCallback(done))
        })
      })

      after(() => { tests = [] })

      it('should have 6 passing test', () => {
        assert.equal(results.passingNum, 6)
      })

      it('should have 6 failing test', () => {
        assert.equal(results.failureNum, 6)
      })

      it('should return', () => {
        deepEqualExcluding(tests, [
          { type: 'accountList', value: accounts },
          { type: 'contract', value: 'AssertEqualTest', filename: __dirname + '/examples_0/assert_equal_test.sol' },
          { type: 'testPass', debugTxHash: '0x921f2533b4304238614de216b6caff9d7cb9315551fab159e675c3aba1cee766', value: 'Equal uint pass test', filename: __dirname + '/examples_0/assert_equal_test.sol', context: 'AssertEqualTest' },
          { type: 'testFailure', debugTxHash: '0xe04f39dd9e7bace96e2939085a4b8212e00ef111603d577d92f9773b64a5a09c', value: 'Equal uint fail test', filename: __dirname + '/examples_0/assert_equal_test.sol', errMsg: 'equalUintFailTest fails', context: 'AssertEqualTest', assertMethod: 'equal', location: '273:57:0', expected: '2', returned: '1' },
          { type: 'testPass', debugTxHash: '0x768dfed9ea78b704efafff52ac4c9fd57a7bd797d65a93e507504762a6e54b06', value: 'Equal int pass test', filename: __dirname + '/examples_0/assert_equal_test.sol', context: 'AssertEqualTest' },
          { type: 'testFailure', debugTxHash: '0xde43b602d61f7e1ccbc62e86b2e009236500abeb03edd7e18cc65655c105d13d', value: 'Equal int fail test', filename: __dirname + '/examples_0/assert_equal_test.sol', errMsg: 'equalIntFailTest fails', context: 'AssertEqualTest', assertMethod: 'equal', location: '493:45:0', expected: '2', returned: '-1' },
          { type: 'testPass', debugTxHash: '0x5fe0fea4731d8a06af919f3e96241a16ff9641d00ecf6300262dd5d2ea1706df', value: 'Equal bool pass test', filename: __dirname + '/examples_0/assert_equal_test.sol', context: 'AssertEqualTest' },
          { type: 'testFailure', debugTxHash: '0xb3024829add1eee0ca3bd00786745d0f21d772f3983ff86598c519df772f4d25', value: 'Equal bool fail test', filename: __dirname + '/examples_0/assert_equal_test.sol', errMsg: 'equalBoolFailTest fails', context: 'AssertEqualTest', assertMethod: 'equal', location: '708:52:0', expected: false, returned: true },
          { type: 'testPass', debugTxHash: '0xcf23a45ce972e8ffdc47c7dbfc826e9705fe246f6c23dbb02881552537d6f3a3', value: 'Equal address pass test', filename: __dirname + '/examples_0/assert_equal_test.sol', context: 'AssertEqualTest' },
          { type: 'testFailure', debugTxHash: '0x1a999393eadf62349971d26a9037f73911664777787a3c92440e2965acbde550', value: 'Equal address fail test', filename: __dirname + '/examples_0/assert_equal_test.sol', errMsg: 'equalAddressFailTest fails', context: 'AssertEqualTest', assertMethod: 'equal', location: '1015:130:0', expected: '0x1c6637567229159d1eFD45f95A6675e77727E013', returned: '0x7994f14563F39875a2F934Ce42cAbF48a93FdDA9' },
          { type: 'testPass', debugTxHash: '0xa537aaacb34aafe65e039927bb42219ebee11e47e6293e8d857b501e7d5d09c0', value: 'Equal bytes32 pass test', filename: __dirname + '/examples_0/assert_equal_test.sol', context: 'AssertEqualTest' },
          { type: 'testFailure', debugTxHash: '0x36c2939907d4e772201b3d2dc6e88fdc7c8ca3f4e1b249e36337986752999608', value: 'Equal bytes32 fail test', filename: __dirname + '/examples_0/assert_equal_test.sol', errMsg: 'equalBytes32FailTest fails', context: 'AssertEqualTest', assertMethod: 'equal', location: '1670:48:0', expected: '0x72656d6978000000000000000000000000000000000000000000000000000000', returned: '0x72656d6979000000000000000000000000000000000000000000000000000000' },
          { type: 'testPass', debugTxHash: '0x786192d1af0eb15134397914bad3c782def38ce74adc765d58c52124be59cee6', value: 'Equal string pass test', filename: __dirname + '/examples_0/assert_equal_test.sol', context: 'AssertEqualTest' },
          { type: 'testFailure', debugTxHash: '0xa5a415f880ce8217949af8bff5e8c0c47bcab422cf5cc2baeff831843a0360ea', value: 'Equal string fail test', filename: __dirname + '/examples_0/assert_equal_test.sol', errMsg: 'equalStringFailTest fails', context: 'AssertEqualTest', assertMethod: 'equal', location: '1916:81:0', expected: 'remix-tests', returned: 'remix' }
        ], ['time', 'provider'])
      })
    })

    describe('assert library NOTEQUAL method tests', function () {
      const filename: string = __dirname + '/examples_0/assert_notEqual_test.sol'

      before((done) => {
        compileAndDeploy(filename, (_err: Error | null | undefined, compilationData: any, contracts: any, asts: any, accounts: string[], provider: any) => {
          runTest('AssertNotEqualTest', contracts.AssertNotEqualTest, compilationData[filename]['AssertNotEqualTest'], asts[filename], { accounts, provider }, testCallback, resultsCallback(done))
        })
      })

      after(() => { tests = [] })

      it('should have 6 passing test', () => {
        assert.equal(results.passingNum, 6)
      })

      it('should have 6 failing test', () => {
        assert.equal(results.failureNum, 6)
      })

      it('should return', () => {
        deepEqualExcluding(tests, [
          { type: 'accountList', value: accounts },
          { type: 'contract', value: 'AssertNotEqualTest', filename: __dirname + '/examples_0/assert_notEqual_test.sol' },
          { type: 'testPass', debugTxHash: '0xdcad7012585de21639b77e017c9e02da30812e6afeb7283e3d6d5bf077661fa8', value: 'Not equal uint pass test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', context: 'AssertNotEqualTest' },
          { type: 'testFailure', debugTxHash: '0x49a4b2aa5108ac9add7ba521bbe71972d43d765855680ba5f909f38b5f1d14f8', value: 'Not equal uint fail test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', errMsg: 'notEqualUintFailTest fails', context: 'AssertNotEqualTest', assertMethod: 'notEqual', location: '288:63:0', expected: '1', returned: '1' },
          { type: 'testPass', debugTxHash: '0x04de641a305b73d5d4b119e0bd66a342f3c28003862b23eea9670f144af43af5', value: 'Not equal int pass test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', context: 'AssertNotEqualTest' },
          { type: 'testFailure', debugTxHash: '0x3c128cd318bea05607e6d349a6e5c435751d207dd3ab7c08af4301d4d6338294', value: 'Not equal int fail test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', errMsg: 'notEqualIntFailTest fails', context: 'AssertNotEqualTest', assertMethod: 'notEqual', location: '525:52:0', expected: '-2', returned: '-2' },
          { type: 'testPass', debugTxHash: '0xe630b6ad1a3f08cd98076129ca02a8bc9e33fb40b6d37fdc80404f3e2dfc71e1', value: 'Not equal bool pass test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', context: 'AssertNotEqualTest' },
          { type: 'testFailure', debugTxHash: '0x6a10abe819541919fbe15f67066ddcd51788a529e97210979e67546e8abd20b7', value: 'Not equal bool fail test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', errMsg: 'notEqualBoolFailTest fails', context: 'AssertNotEqualTest', assertMethod: 'notEqual', location: '760:57:0', expected: true, returned: true },
          { type: 'testPass', debugTxHash: '0x23a571f36f594d644d9e7d026d23175c71354b606e70c7d3dcab4c8df4de18ea', value: 'Not equal address pass test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', context: 'AssertNotEqualTest' },
          // eslint-disable-next-line @typescript-eslint/no-loss-of-precision
          { type: 'testFailure', debugTxHash: '0x1757359acdebd0c98f50f63178808eb4c9c3d338effd1fa35d2b1512cd2fbb6c', value: 'Not equal address fail test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', errMsg: 'notEqualAddressFailTest fails', context: 'AssertNotEqualTest', assertMethod: 'notEqual', location: '1084:136:0', expected: 0x7994f14563F39875a2F934Ce42cAbF48a93FdDA9, returned: 0x7994f14563F39875a2F934Ce42cAbF48a93FdDA9 },
          { type: 'testPass', debugTxHash: '0xa92d3209da4b2592afd2d6b071ea5a31d01c6cd7a481b98eb500e836a38f22a5', value: 'Not equal bytes32 pass test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', context: 'AssertNotEqualTest' },
          { type: 'testFailure', debugTxHash: '0x942eafdb591df9c4a34c901385525dcde0d736b1bf55b93946d4511de7665cf1', value: 'Not equal bytes32 fail test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', errMsg: 'notEqualBytes32FailTest fails', context: 'AssertNotEqualTest', assertMethod: 'notEqual', location: '1756:54:0', expected: '0x72656d6978000000000000000000000000000000000000000000000000000000', returned: '0x72656d6978000000000000000000000000000000000000000000000000000000' },
          { type: 'testPass', debugTxHash: '0x94e798eb9799046736aa8a4f5a5ee897c5f2231962f6403b617fa3ad1e769d24', value: 'Not equal string pass test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', context: 'AssertNotEqualTest' },
          { type: 'testFailure', debugTxHash: '0x699b9d2b477357d486dde4b6db4f1a71b7c98e8f8913f59b19d106d4f50ae90f', value: 'Not equal string fail test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', errMsg: 'notEqualStringFailTest fails', context: 'AssertNotEqualTest', assertMethod: 'notEqual', location: '2026:81:0', expected: 'remix', returned: 'remix' },
        ], ['time', 'provider'])
      })
    })

    describe('assert library GREATERTHAN method tests', function () {
      const filename: string = __dirname + '/examples_0/assert_greaterThan_test.sol'

      before((done) => {
        compileAndDeploy(filename, (_err: Error | null | undefined, compilationData: any, contracts: any, asts: any, accounts: string[], provider: any) => {
          runTest('AssertGreaterThanTest', contracts.AssertGreaterThanTest, compilationData[filename]['AssertGreaterThanTest'], asts[filename], { accounts, provider }, testCallback, resultsCallback(done))
        })
      })

      after(() => { tests = [] })

      it('should have 4 passing test', () => {
        assert.equal(results.passingNum, 4)
      })

      it('should have 3 failing test', () => {
        assert.equal(results.failureNum, 3)
      })
      it('should return', () => {
        deepEqualExcluding(tests, [
          { type: 'accountList', value: accounts },
          { type: 'contract', value: 'AssertGreaterThanTest', filename: __dirname + '/examples_0/assert_greaterThan_test.sol' },
          { type: 'testPass', debugTxHash: '0x5d6dfb78ef129552605e276691765e1b108bab5d1f3d7fd6aae1d5ab02e77699', value: 'Greater than uint pass test', filename: __dirname + '/examples_0/assert_greaterThan_test.sol', context: 'AssertGreaterThanTest' },
          { type: 'testFailure', debugTxHash: '0x7953fabbd85e70aff7db2890cc5b03ab044d17f41184bead0846d08a1b7273e0', value: 'Greater than uint fail test', filename: __dirname + '/examples_0/assert_greaterThan_test.sol', errMsg: 'greaterThanUintFailTest fails', context: 'AssertGreaterThanTest', assertMethod: 'greaterThan', location: '303:69:0', expected: '4', returned: '1' },
          { type: 'testPass', debugTxHash: '0x76887ef782b51b62ae58b83fb104ba818fece80d620830a882009164ceff8b40', value: 'Greater than int pass test', filename: __dirname + '/examples_0/assert_greaterThan_test.sol', context: 'AssertGreaterThanTest' },
          { type: 'testFailure', debugTxHash: '0x5ba100940ad58fef20713d44ce849548f326536b6ce6a30e7650eb6e8002246b', value: 'Greater than int fail test', filename: __dirname + '/examples_0/assert_greaterThan_test.sol', errMsg: 'greaterThanIntFailTest fails', context: 'AssertGreaterThanTest', assertMethod: 'greaterThan', location: '569:67:0', expected: '1', returned: '-1' },
          { type: 'testPass', debugTxHash: '0x6568cb9b025e413bd3665f5d3c07d3738ad1641a237f943bb75ed17a69c8d86c', value: 'Greater than uint int pass test', filename: __dirname + '/examples_0/assert_greaterThan_test.sol', context: 'AssertGreaterThanTest' },
          { type: 'testFailure', debugTxHash: '0xa355a9b26e8a685fc9fb04fc8a6556d4c51b94d8a361fe826cb95dd50487ea67', value: 'Greater than uint int fail test', filename: __dirname + '/examples_0/assert_greaterThan_test.sol', errMsg: 'greaterThanUintIntFailTest fails', context: 'AssertGreaterThanTest', assertMethod: 'greaterThan', location: '845:71:0', expected: '2', returned: '1' },
          { type: 'testPass', debugTxHash: '0x92e816d452a7e34dd9446b5914df6588de0a46b0ec33ea47e162ac5af529be25', value: 'Greater than int uint pass test', filename: __dirname + '/examples_0/assert_greaterThan_test.sol', context: 'AssertGreaterThanTest' },
        ], ['time', 'provider'])
      })
    })

    describe('assert library LESSERTHAN method tests', function () {
      const filename: string = __dirname + '/examples_0/assert_lesserThan_test.sol'

      before((done) => {
        compileAndDeploy(filename, (_err: Error | null | undefined, compilationData: any, contracts: any, asts: any, accounts: string[], provider: any) => {
          runTest('AssertLesserThanTest', contracts.AssertLesserThanTest, compilationData[filename]['AssertLesserThanTest'], asts[filename], { accounts, provider }, testCallback, resultsCallback(done))
        })
      })

      after(() => { tests = [] })

      it('should have 3 passing test', () => {
        assert.equal(results.passingNum, 3)
      })

      it('should have 3 failing test', () => {
        assert.equal(results.failureNum, 3)
      })

      it('should return', () => {
        deepEqualExcluding(tests, [
          { type: 'accountList', value: accounts },
          { type: 'contract', value: 'AssertLesserThanTest', filename: __dirname + '/examples_0/assert_lesserThan_test.sol' },
          { type: 'testPass', debugTxHash: '0xf24a07de2eab33c4c3df0466f829e4a0403187a38da4fe44678dcf7ac2f3d3c7', value: 'Lesser than uint pass test', filename: __dirname + '/examples_0/assert_lesserThan_test.sol', context: 'AssertLesserThanTest' },
          { type: 'testFailure', debugTxHash: '0x411420679f0058983d140847abe5b8a9e0af6c1ce3a87ee70e741f6baf598b9c', value: 'Lesser than uint fail test', filename: __dirname + '/examples_0/assert_lesserThan_test.sol', errMsg: 'lesserThanUintFailTest fails', context: 'AssertLesserThanTest', assertMethod: 'lesserThan', location: '298:67:0', expected: '2', returned: '4' },
          { type: 'testPass', debugTxHash: '0x48cbced998ba5131b9a23e76a2fa04e2ec7ee58838f66257e340c411fe6c767e', value: 'Lesser than int pass test', filename: __dirname + '/examples_0/assert_lesserThan_test.sol', context: 'AssertLesserThanTest' },
          { type: 'testFailure', debugTxHash: '0xa8087fbcaf6f89a7cfc5ece1121d910bd587a8e42706fcb7a4d6315856d69a54', value: 'Lesser than int fail test', filename: __dirname + '/examples_0/assert_lesserThan_test.sol', errMsg: 'lesserThanIntFailTest fails', context: 'AssertLesserThanTest', assertMethod: 'lesserThan', location: '557:65:0', expected: '-1', returned: '1' },
          { type: 'testPass', debugTxHash: '0xc655d98831af9b00803152a002d1a2b18055eaee775baea124539e3842942b89', value: 'Lesser than uint int pass test', filename: __dirname + '/examples_0/assert_lesserThan_test.sol', context: 'AssertLesserThanTest' },
          { type: 'testFailure', debugTxHash: '0x97d2db8ee48efb127d2e8205179ca1f05213dcb9b078629651e135218a385c4a', value: 'Lesser than int uint fail test', filename: __dirname + '/examples_0/assert_lesserThan_test.sol', errMsg: 'lesserThanIntUintFailTest fails', context: 'AssertLesserThanTest', assertMethod: 'lesserThan', location: '826:69:0', expected: '1', returned: '1' },
        ], ['time', 'provider'])
      })
    })

    describe('test with before', function () {
      const filename: string = __dirname + '/examples_1/simple_storage_test.sol'

      before((done) => {
        compileAndDeploy(filename, (_err: Error | null | undefined, compilationData: any, contracts: any, asts: any, accounts: string[], provider: any) => {
          runTest('MyTest', contracts.MyTest, compilationData[filename]['MyTest'], asts[filename], { accounts, provider }, testCallback, resultsCallback(done))
        })
      })

      after(() => { tests = [] })

      it('should have 3 passing test', () => {
        assert.equal(results.passingNum, 3)
      })

      it('should have 1 failing test', () => {
        assert.equal(results.failureNum, 1)
      })

      it('should return 6 messages', () => {
        deepEqualExcluding(tests, [
          { type: 'accountList', value: accounts },
          { type: 'contract', value: 'MyTest', filename: __dirname + '/examples_1/simple_storage_test.sol' },
          { type: 'testPass', debugTxHash: '0x116665902078116d8040f440c25142196759656c47b0f97aa6038c6a5d348299', value: 'Initial value should be100', filename: __dirname + '/examples_1/simple_storage_test.sol', context: 'MyTest' },
          { type: 'testPass', debugTxHash: '0x3be39a7fa4fcc2ac60e608bd670093b3a7ec837294f031e04f315c72b7bbafe9', value: 'Initial value should not be200', filename: __dirname + '/examples_1/simple_storage_test.sol', context: 'MyTest' },
          { type: 'testFailure', debugTxHash: '0x1a3c0039e67655d4b676d821c9fa6a773a06c9ec956400f81829a50c60ad0b8a', value: 'Should trigger one fail', filename: __dirname + '/examples_1/simple_storage_test.sol', errMsg: 'uint test 1 fails', context: 'MyTest', assertMethod: 'equal', location: '532:51:1', expected: '2', returned: '1' },
          { type: 'testPass', debugTxHash: '0x38e63ff1a38165fb460634d20b5fc48305754a73a6e4b73d7ad56b7a5b5366cb', value: 'Should trigger one pass', filename: __dirname + '/examples_1/simple_storage_test.sol', context: 'MyTest' }
        ], ['time', 'provider'])
      })
    })

    describe('test with beforeEach', function () {
      const filename: string = __dirname + '/examples_2/simple_storage_test.sol'

      before(done => {
        compileAndDeploy(filename, function (_err: Error | null | undefined, compilationData: any, contracts: any, asts: any, accounts: string[], provider: any) {
          runTest('MyTest', contracts.MyTest, compilationData[filename]['MyTest'], asts[filename], { accounts, provider }, testCallback, resultsCallback(done))
        })
      })

      after(() => { tests = [] })

      it('should have 2 passing tests', () => {
        assert.equal(results.passingNum, 2)
      })

      it('should 0 failing tests', () => {
        assert.equal(results.failureNum, 0)
      })

      it('should return 4 messages', () => {
        deepEqualExcluding(tests, [
          { type: 'accountList', value: accounts },
          { type: 'contract', value: 'MyTest', filename: __dirname + '/examples_2/simple_storage_test.sol' },
          { type: 'testPass', debugTxHash: '0x116665902078116d8040f440c25142196759656c47b0f97aa6038c6a5d348299', value: 'Initial value should be100', filename: __dirname + '/examples_2/simple_storage_test.sol', context: 'MyTest' },
          { type: 'testPass', debugTxHash: '0x12125c1bf679282dfff880a8597bfd187ef57a192e560b09c635f71d43c73382', value: 'Value is set200', filename: __dirname + '/examples_2/simple_storage_test.sol', context: 'MyTest' }
        ], ['time', 'provider'])
      })
    })

    // // Test string equality
    describe('test string equality', function () {
      const filename: string = __dirname + '/examples_3/simple_string_test.sol'

      before(done => {
        compileAndDeploy(filename, function (_err: Error | null | undefined, compilationData: any, contracts: any, asts: any, accounts: string[], provider: any) {
          runTest('StringTest', contracts.StringTest, compilationData[filename]['StringTest'], asts[filename], { accounts, provider }, testCallback, resultsCallback(done))
        })
      })

      after(() => { tests = [] })

      it('should 2 passing tests', () => {
        assert.equal(results.passingNum, 2)
      })

      it('should return 4 messages', () => {
        deepEqualExcluding(tests, [
          { type: 'accountList', value: accounts },
          { type: 'contract', value: 'StringTest', filename: __dirname + '/examples_3/simple_string_test.sol' },
          { type: 'testPass', debugTxHash: '0x17d66cfa9f7f2ad1673634c03a3711be1ffaed65e2ae68d9976d8cf1c9736083', value: 'Initial value should be hello world', filename: __dirname + '/examples_3/simple_string_test.sol', context: 'StringTest' },
          { type: 'testPass', debugTxHash: '0x2d1e5f61baab0a5b3817409c13c4baf0a41e201473a493f76d6ae871601cc579', value: 'Value should not be hello wordl', filename: __dirname + '/examples_3/simple_string_test.sol', context: 'StringTest' }
        ], ['time', 'provider'])
      })
    })

    // Test multiple directory import in test contract
    describe('test multiple directory import in test contract', function () {
      const filename: string = __dirname + '/examples_5/test/simple_storage_test.sol'

      before(done => {
        compileAndDeploy(filename, function (_err: Error | null | undefined, compilationData: any, contracts: any, asts: any, accounts: string[], provider: any) {
          runTest('StorageResolveTest', contracts.StorageResolveTest, compilationData[filename]['StorageResolveTest'], asts[filename], { accounts, provider }, testCallback, resultsCallback(done))
        })
      })

      after(() => { tests = [] })

      it('should 3 passing tests', () => {
        assert.equal(results.passingNum, 3)
      })

      it('should return 4 messages', () => {
        deepEqualExcluding(tests, [
          { type: 'accountList', value: accounts },
          { type: 'contract', value: 'StorageResolveTest', filename: __dirname + '/examples_5/test/simple_storage_test.sol' },
          { type: 'testPass', debugTxHash: '0x116665902078116d8040f440c25142196759656c47b0f97aa6038c6a5d348299', value: 'Initial value should be100', filename: __dirname + '/examples_5/test/simple_storage_test.sol', context: 'StorageResolveTest' },
          { type: 'testPass', debugTxHash: '0x4eef142561e8108cf925200a5072a3e149b8d02a97efb181103204cbb58306ab', value: 'Check if even', filename: __dirname + '/examples_5/test/simple_storage_test.sol', context: 'StorageResolveTest' },
          { type: 'testPass', debugTxHash: '0x819da36f60b981eca165321ec6a7b41018d86063cad94e5db9b6c101f4ecde7c', value: 'Check if odd', filename: __dirname + '/examples_5/test/simple_storage_test.sol', context: 'StorageResolveTest' }
        ], ['time', 'provider'])
      })
    })

    //Test SafeMath library methods
    describe('test SafeMath library', function () {
      const filename: string = __dirname + '/examples_4/SafeMath_test.sol'

      before(done => {
        compileAndDeploy(filename, function (_err: Error | null | undefined, compilationData: any, contracts: any, asts: any, accounts: string[], provider: any) {
          runTest('SafeMathTest', contracts.SafeMathTest, compilationData[filename]['SafeMathTest'], asts[filename], { accounts, provider }, testCallback, resultsCallback(done))
        })
      })

      after(() => { tests = [] })

      it('should have 7 passing tests', () => {
        assert.equal(results.passingNum, 7)
      })
      it('should have 0 failing tests', () => {
        assert.equal(results.failureNum, 0)
      })
    })

    //Test signed/unsigned integer weight
    describe('test number weight', function () {
      const filename: string = __dirname + '/number/number_test.sol'

      before(done => {
        compileAndDeploy(filename, function (_err: Error | null | undefined, compilationData: any, contracts: any, asts: any, accounts: string[], provider: any) {
          runTest('IntegerTest', contracts.IntegerTest, compilationData[filename]['IntegerTest'], asts[filename], { accounts, provider }, testCallback, resultsCallback(done))
        })
      })

      after(() => { tests = [] })

      it('should have 6 passing tests', () => {
        assert.equal(results.passingNum, 6)
      })
      it('should have 2 failing tests', () => {
        assert.equal(results.failureNum, 2)
      })
    })

    // Test Transaction with custom sender & value
    describe('various sender', function () {
      const filename: string = __dirname + '/various_sender/sender_and_value_test.sol'

      before(done => {
        compileAndDeploy(filename, function (_err: Error | null | undefined, compilationData: any, contracts: any, asts: any, accounts: string[], provider: any) {
          runTest('SenderAndValueTest', contracts.SenderAndValueTest, compilationData[filename]['SenderAndValueTest'], asts[filename], { accounts, provider }, testCallback, resultsCallback(done))
        })
      })

      after(() => { tests = [] })

      it('should have 17 passing tests', () => {
        assert.equal(results.passingNum, 17)
      })
      it('should have 0 failing tests', () => {
        assert.equal(results.failureNum, 0)
      })
    })

    // Test `runTest` method without sending contract object (should throw error)
    describe('runTest method without contract json interface', function () {
      const filename: string = __dirname + '/various_sender/sender_and_value_test.sol'
      const errorCallback: any = (done) => {
        return (err, _results) => {
          if (err && err.message.includes('Contract interface not available')) {
            results = _results
            done()
          }
          else throw err
        }
      }
      before(done => {
        compileAndDeploy(filename, function (_err: Error | null | undefined, compilationData: any, contracts: any, asts: any, accounts: string[], provider: any) {
          runTest('SenderAndValueTest', undefined, compilationData[filename]['SenderAndValueTest'], asts[filename], { accounts, provider }, testCallback, errorCallback(done))
        })
      })

      it('should have 0 passing tests', () => {
        assert.equal(results.passingNum, 0)
      })
      it('should have 0 failing tests', () => {
        assert.equal(results.failureNum, 0)
      })
    })

  })
})
