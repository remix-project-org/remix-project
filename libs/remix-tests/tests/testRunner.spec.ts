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
          { type: 'testPass', debugTxHash: '0x15b52a9081653c9d6d910378c30386f36c5740ffd25ad62e0c92c08e654560f5', value: 'Equal uint pass test', filename: __dirname + '/examples_0/assert_equal_test.sol', context: 'AssertEqualTest' },
          { type: 'testFailure', debugTxHash: '0xaaf89bcdad7a5cf283c122ed5e3d18fae5da45c2244ee225b3758822f89f3286', value: 'Equal uint fail test', filename: __dirname + '/examples_0/assert_equal_test.sol', errMsg: 'equalUintFailTest fails', context: 'AssertEqualTest', assertMethod: 'equal', location: '273:57:0', expected: '2', returned: '1' },
          { type: 'testPass', debugTxHash: '0xffd078476f9d569cdc81ac9657d0cba539f2242bc55ea8e00c9a5f79202962bd', value: 'Equal int pass test', filename: __dirname + '/examples_0/assert_equal_test.sol', context: 'AssertEqualTest' },
          { type: 'testFailure', debugTxHash: '0xe5825fe29fc517cd5838bcdcd8d4b265ec7ea1e26f1436a2449358b7c4e6265f', value: 'Equal int fail test', filename: __dirname + '/examples_0/assert_equal_test.sol', errMsg: 'equalIntFailTest fails', context: 'AssertEqualTest', assertMethod: 'equal', location: '493:45:0', expected: '2', returned: '-1' },
          { type: 'testPass', debugTxHash: '0xdf0c7136558a8575ffbacde38f66a510524871c1159983fb66971825f0ccf01c', value: 'Equal bool pass test', filename: __dirname + '/examples_0/assert_equal_test.sol', context: 'AssertEqualTest' },
          { type: 'testFailure', debugTxHash: '0xc4d5cb36e53aac58193d7811388f572eeedf67def1e73f7b99c30ec40a93f500', value: 'Equal bool fail test', filename: __dirname + '/examples_0/assert_equal_test.sol', errMsg: 'equalBoolFailTest fails', context: 'AssertEqualTest', assertMethod: 'equal', location: '708:52:0', expected: false, returned: true },
          { type: 'testPass', debugTxHash: '0xfe0f0c759c5dd07135dfbc249d4e963cc442e454bb46d760623642a2b7eb6dbe', value: 'Equal address pass test', filename: __dirname + '/examples_0/assert_equal_test.sol', context: 'AssertEqualTest' },
          { type: 'testFailure', debugTxHash: '0xf482704ba6fb1e3a21f014e085bd6974efea4be7a57a0d7998c2809c5aee65c4', value: 'Equal address fail test', filename: __dirname + '/examples_0/assert_equal_test.sol', errMsg: 'equalAddressFailTest fails', context: 'AssertEqualTest', assertMethod: 'equal', location: '1015:130:0', expected: '0x1c6637567229159d1eFD45f95A6675e77727E013', returned: '0x7994f14563F39875a2F934Ce42cAbF48a93FdDA9' },
          { type: 'testPass', debugTxHash: '0x615af0a14d8e605944cdd8f938523e093c2d937d4715aee373650028c905385e', value: 'Equal bytes32 pass test', filename: __dirname + '/examples_0/assert_equal_test.sol', context: 'AssertEqualTest' },
          { type: 'testFailure', debugTxHash: '0x20ff637a0fb28c9f943d0eaa23d9391e9177810d77a9ac5478873f8838719fc5', value: 'Equal bytes32 fail test', filename: __dirname + '/examples_0/assert_equal_test.sol', errMsg: 'equalBytes32FailTest fails', context: 'AssertEqualTest', assertMethod: 'equal', location: '1670:48:0', expected: '0x72656d6978000000000000000000000000000000000000000000000000000000', returned: '0x72656d6979000000000000000000000000000000000000000000000000000000' },
          { type: 'testPass', debugTxHash: '0x2a7c3f1f5d87620d8f1f2a83984e2cae6ff985f25f9cb96a046b507b357941bb', value: 'Equal string pass test', filename: __dirname + '/examples_0/assert_equal_test.sol', context: 'AssertEqualTest' },
          { type: 'testFailure', debugTxHash: '0x7d9381986adb7e9e6d7d65191f82633cb453406556569f77f5e0b4aa39274324', value: 'Equal string fail test', filename: __dirname + '/examples_0/assert_equal_test.sol', errMsg: 'equalStringFailTest fails', context: 'AssertEqualTest', assertMethod: 'equal', location: '1916:81:0', expected: 'remix-tests', returned: 'remix' }
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
          { type: 'testPass', debugTxHash: '0xebc513bd2625be3b228840ebb8f5a9ea53e4f32870f015c97d1b6f91b916b367', value: 'Not equal uint pass test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', context: 'AssertNotEqualTest' },
          { type: 'testFailure', debugTxHash: '0x2cb59a137f2d3a76eee28bce662cb8618ad9cb9068f6be51935bf24911f90b43', value: 'Not equal uint fail test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', errMsg: 'notEqualUintFailTest fails', context: 'AssertNotEqualTest', assertMethod: 'notEqual', location: '288:63:0', expected: '1', returned: '1' },
          { type: 'testPass', debugTxHash: '0xc66c3c63a74463e5ce77311393d143b014ea510fb49992a7a828a78f00f9ca51', value: 'Not equal int pass test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', context: 'AssertNotEqualTest' },
          { type: 'testFailure', debugTxHash: '0x1606fcdf8583d0e629125bcadf2f115334228fac79cbbb5d756fafd9ca6b8f06', value: 'Not equal int fail test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', errMsg: 'notEqualIntFailTest fails', context: 'AssertNotEqualTest', assertMethod: 'notEqual', location: '525:52:0', expected: '-2', returned: '-2' },
          { type: 'testPass', debugTxHash: '0x8cce267a27b4b7aedb9f50499017b971d4058cd11c7f61a267b9ff159126af6d', value: 'Not equal bool pass test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', context: 'AssertNotEqualTest' },
          { type: 'testFailure', debugTxHash: '0x2e08b9742bf3d99f08c5563600ab228a54c3b9e432a40912ab6d4a5f3779a671', value: 'Not equal bool fail test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', errMsg: 'notEqualBoolFailTest fails', context: 'AssertNotEqualTest', assertMethod: 'notEqual', location: '760:57:0', expected: true, returned: true },
          { type: 'testPass', debugTxHash: '0x03cb41ad90b032bb94a994e62828bf03f8042c8b41f51c46f68171a3b4ab36a3', value: 'Not equal address pass test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', context: 'AssertNotEqualTest' },
          // eslint-disable-next-line @typescript-eslint/no-loss-of-precision
          { type: 'testFailure', debugTxHash: '0xa68c8214a422e42335ba50407f5bc096332c289a9fede3d264ef27e02e6565af', value: 'Not equal address fail test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', errMsg: 'notEqualAddressFailTest fails', context: 'AssertNotEqualTest', assertMethod: 'notEqual', location: '1084:136:0', expected: 0x7994f14563F39875a2F934Ce42cAbF48a93FdDA9, returned: 0x7994f14563F39875a2F934Ce42cAbF48a93FdDA9 },
          { type: 'testPass', debugTxHash: '0xb83a9e2dd2bc916b40a87f038b0c96b3be6b2796d65900bbdf1467027d0b4f96', value: 'Not equal bytes32 pass test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', context: 'AssertNotEqualTest' },
          { type: 'testFailure', debugTxHash: '0x3a8e50586fee6fe4e5d765d1392151e550b28959ea8eb823e8fdf54627fa861e', value: 'Not equal bytes32 fail test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', errMsg: 'notEqualBytes32FailTest fails', context: 'AssertNotEqualTest', assertMethod: 'notEqual', location: '1756:54:0', expected: '0x72656d6978000000000000000000000000000000000000000000000000000000', returned: '0x72656d6978000000000000000000000000000000000000000000000000000000' },
          { type: 'testPass', debugTxHash: '0x8b84801330bbd44f358aee9089263ad7400ffc738f2f1f9e6b06cf6af20816d1', value: 'Not equal string pass test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', context: 'AssertNotEqualTest' },
          { type: 'testFailure', debugTxHash: '0xb2e1b7cdfdc622e1c39e436054168861ca68bb51147940bff6ebd075f8afd2da', value: 'Not equal string fail test', filename: __dirname + '/examples_0/assert_notEqual_test.sol', errMsg: 'notEqualStringFailTest fails', context: 'AssertNotEqualTest', assertMethod: 'notEqual', location: '2026:81:0', expected: 'remix', returned: 'remix' },
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
          { type: 'testPass', debugTxHash: '0x563a5b040bd6403de8543a8c44f1b11bb99dbece557f428b966fb70d389e602b', value: 'Greater than uint pass test', filename: __dirname + '/examples_0/assert_greaterThan_test.sol', context: 'AssertGreaterThanTest' },
          { type: 'testFailure', debugTxHash: '0x14ec758d313b505d92b0505e0ce940df318bc0136ea6ab9b40bba1a94baeaca5', value: 'Greater than uint fail test', filename: __dirname + '/examples_0/assert_greaterThan_test.sol', errMsg: 'greaterThanUintFailTest fails', context: 'AssertGreaterThanTest', assertMethod: 'greaterThan', location: '303:69:0', expected: '4', returned: '1' },
          { type: 'testPass', debugTxHash: '0x2de3f6fdf2c93f50289dd5fe469a13e03c22961ddcf110e5f3819a7af39e3e25', value: 'Greater than int pass test', filename: __dirname + '/examples_0/assert_greaterThan_test.sol', context: 'AssertGreaterThanTest' },
          { type: 'testFailure', debugTxHash: '0xa8b897e011895858be4bc37f20e1e17a490b964d0683df5b430ac648e992bd57', value: 'Greater than int fail test', filename: __dirname + '/examples_0/assert_greaterThan_test.sol', errMsg: 'greaterThanIntFailTest fails', context: 'AssertGreaterThanTest', assertMethod: 'greaterThan', location: '569:67:0', expected: '1', returned: '-1' },
          { type: 'testPass', debugTxHash: '0xf52652ef6020ae091022455df8713d20cb00a35de8bf485e177128a457a50d6c', value: 'Greater than uint int pass test', filename: __dirname + '/examples_0/assert_greaterThan_test.sol', context: 'AssertGreaterThanTest' },
          { type: 'testFailure', debugTxHash: '0x9f826060a0e5a8c0187d5e9ffe83a153080379a1e1fea0b267745eb8bd52fd6f', value: 'Greater than uint int fail test', filename: __dirname + '/examples_0/assert_greaterThan_test.sol', errMsg: 'greaterThanUintIntFailTest fails', context: 'AssertGreaterThanTest', assertMethod: 'greaterThan', location: '845:71:0', expected: '2', returned: '1' },
          { type: 'testPass', debugTxHash: '0x04e1703c75cc4beb4b8c9ddfb79489192423fe745089382cadb1811cbf2d915c', value: 'Greater than int uint pass test', filename: __dirname + '/examples_0/assert_greaterThan_test.sol', context: 'AssertGreaterThanTest' },
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
          { type: 'testPass', debugTxHash: '0x407c27582c0b6b2275d03372907c2efcafa1c9e8a1e6ea8d4e20f88e3222b6c7', value: 'Lesser than uint pass test', filename: __dirname + '/examples_0/assert_lesserThan_test.sol', context: 'AssertLesserThanTest' },
          { type: 'testFailure', debugTxHash: '0x6e7fc07decdb5deb71b1177fc7b151bce5b8e42fc6137e1418b4e7277960d972', value: 'Lesser than uint fail test', filename: __dirname + '/examples_0/assert_lesserThan_test.sol', errMsg: 'lesserThanUintFailTest fails', context: 'AssertLesserThanTest', assertMethod: 'lesserThan', location: '298:67:0', expected: '2', returned: '4' },
          { type: 'testPass', debugTxHash: '0x353c9bcf4b61abaf4b6ffaae02f18ea0a7fb38a8c3c7a915939561cdf97f2d72', value: 'Lesser than int pass test', filename: __dirname + '/examples_0/assert_lesserThan_test.sol', context: 'AssertLesserThanTest' },
          { type: 'testFailure', debugTxHash: '0xccab30c5a154c4c2e8ca9a8966b86a55f08188d606c3519a5c29534b4b64fb47', value: 'Lesser than int fail test', filename: __dirname + '/examples_0/assert_lesserThan_test.sol', errMsg: 'lesserThanIntFailTest fails', context: 'AssertLesserThanTest', assertMethod: 'lesserThan', location: '557:65:0', expected: '-1', returned: '1' },
          { type: 'testPass', debugTxHash: '0x8e90fb7f3b8343d037444275cd69d431f75a7fc6b46322c69397373463cee22a', value: 'Lesser than uint int pass test', filename: __dirname + '/examples_0/assert_lesserThan_test.sol', context: 'AssertLesserThanTest' },
          { type: 'testFailure', debugTxHash: '0x7912b2535fe0f5a56b274a7ec5ef6dbb0f52a7199f11831867a98961568f2883', value: 'Lesser than int uint fail test', filename: __dirname + '/examples_0/assert_lesserThan_test.sol', errMsg: 'lesserThanIntUintFailTest fails', context: 'AssertLesserThanTest', assertMethod: 'lesserThan', location: '826:69:0', expected: '1', returned: '1' },
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
          { type: 'testPass', debugTxHash: '0xd86dbe1efaf707981475a9a4762826c6852cce3e5b0e987827027602d6d6d734', value: 'Initial value should be100', filename: __dirname + '/examples_1/simple_storage_test.sol', context: 'MyTest' },
          { type: 'testPass', debugTxHash: '0x1b5cce7f93b78f8c97ba915e24648127b7f28e86008668d20a4c20fd0fde40bc', value: 'Initial value should not be200', filename: __dirname + '/examples_1/simple_storage_test.sol', context: 'MyTest' },
          { type: 'testFailure', debugTxHash: '0xdb9cbef289c9e53f4119ad60c1f3e29770de930091e17ab987529c7057013628', value: 'Should trigger one fail', filename: __dirname + '/examples_1/simple_storage_test.sol', errMsg: 'uint test 1 fails', context: 'MyTest', assertMethod: 'equal', location: '532:51:1', expected: '2', returned: '1' },
          { type: 'testPass', debugTxHash: '0x21472600af5de67cd53a489f2435169fdfbe83d7b7dd43c8a0150725fd91e254', value: 'Should trigger one pass', filename: __dirname + '/examples_1/simple_storage_test.sol', context: 'MyTest' }
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
          { type: 'testPass', debugTxHash: '0xd86dbe1efaf707981475a9a4762826c6852cce3e5b0e987827027602d6d6d734', value: 'Initial value should be100', filename: __dirname + '/examples_2/simple_storage_test.sol', context: 'MyTest' },
          { type: 'testPass', debugTxHash: '0xa447f168cd1ce406635ea2368b61828b107473905e270957b7ee38b94a12e055', value: 'Value is set200', filename: __dirname + '/examples_2/simple_storage_test.sol', context: 'MyTest' }
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
          { type: 'testPass', debugTxHash: '0x0f988e614ae6e9a5f560734e8b63f835de14460a5b797e16fa5c68091452d2c5', value: 'Initial value should be hello world', filename: __dirname + '/examples_3/simple_string_test.sol', context: 'StringTest' },
          { type: 'testPass', debugTxHash: '0x713ec0ad3cd02ffcd64f54e45b4da5498983d18b5a696ea34e9fb5d01928cb3f', value: 'Value should not be hello wordl', filename: __dirname + '/examples_3/simple_string_test.sol', context: 'StringTest' }
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
          { type: 'testPass', debugTxHash: '0xd86dbe1efaf707981475a9a4762826c6852cce3e5b0e987827027602d6d6d734', value: 'Initial value should be100', filename: __dirname + '/examples_5/test/simple_storage_test.sol', context: 'StorageResolveTest' },
          { type: 'testPass', debugTxHash: '0xc9e1523f6f094cdd909b3977d1eef7c83284b15c22b17b9b0a4a632bf59881f6', value: 'Check if even', filename: __dirname + '/examples_5/test/simple_storage_test.sol', context: 'StorageResolveTest' },
          { type: 'testPass', debugTxHash: '0xe3f415f2cade92243fd795b9988fc9e9c4318983933c0a0b103e968f31c40f55', value: 'Check if odd', filename: __dirname + '/examples_5/test/simple_storage_test.sol', context: 'StorageResolveTest' }
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
