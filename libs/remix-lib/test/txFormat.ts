'use strict'
import tape from 'tape'
import * as txFormat from '../src/execution/txFormat'
import * as txHelper from '../src/execution/txHelper'
let compiler = require('solc')
import { compilerInput } from '../src/helpers/compilerHelper'
import { hexToBytes, PrefixedHexString } from '@ethereumjs/util'
const solidityVersion = 'v0.6.0+commit.26b70077'

/* tape *********************************************************** */
tape('load compiler ' + solidityVersion, function (t) {
  compiler.loadRemoteVersion(solidityVersion, (error, solcSnapshot) => {
    if (error) console.log(error)
    console.warn('testing *txFormat* against', solidityVersion)
    compiler = solcSnapshot
    t.end()
  })
})

let context
tape('ContractParameters - (TxFormat.buildData) - format input parameters', function (t) {
  let output = compiler.compile(compilerInput(uintContract))
  output = JSON.parse(output)
  const contract = output.contracts['test.sol']['uintContractTest']
  context = { output, contract }

  t.test('(TxFormat.buildData)', async function (st) {
    st.plan(3)
    await testWithInput(st, '123123, "0xf7a10e525d4b168f45f74db1b61f63d3e7619ea8", "34"', '000000000000000000000000000000000000000000000000000000000001e0f3000000000000000000000000f7a10e525d4b168f45f74db1b61f63d3e7619ea80000000000000000000000000000000000000000000000000000000000000022')
    await testWithInput(st, '"123123" , 0xf7a10e525d4b168f45f74db1b61f63d3e7619ea8,   654   ', '000000000000000000000000000000000000000000000000000000000001e0f3000000000000000000000000f7a10e525d4b168f45f74db1b61f63d3e7619ea8000000000000000000000000000000000000000000000000000000000000028e')
    // parsing this as javascript number should overflow
    await testWithInput(st, '90071992547409910000, 0xf7a10e525d4b168f45f74db1b61f63d3e7619ea8, 0', '000000000000000000000000000000000000000000000004e1ffffffffffd8f0000000000000000000000000f7a10e525d4b168f45f74db1b61f63d3e7619ea80000000000000000000000000000000000000000000000000000000000000000')
  })
})

async function testWithInput (st, params, expected) {
  try {
    const data = await txFormat.buildData('uintContractTest', context.contract, context.output.contracts, true, context.contract.abi[0], params)
    console.log(data)
    if (!data.dataHex.endsWith(expected)) {
      st.fail(`result of buildData ${data.dataHex} should end with ${expected} . `)
    } else {
      st.pass(`testWithInput. result of buildData ${data.dataHex} ends with correct data`)
    }
  } catch (error) {
    st.fail(error)
  }
}

tape('ContractStringParameters - (TxFormat.buildData) - format string input parameters', function (t) {
  let output = compiler.compile(compilerInput(stringContract))
  output = JSON.parse(output)
  const contract = output.contracts['test.sol']['stringContractTest']
  context = { output, contract }
  t.test('(TxFormat.buildData)', async function (st) {
    st.plan(3)
    await testWithStringInput(st, '"1,2,3,4qwerty,5", 0xf7a10e525d4b168f45f74db1b61f63d3e7619ea8, "1,a,5,34"', '0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000f7a10e525d4b168f45f74db1b61f63d3e7619ea800000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000f312c322c332c347177657274792c3500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008312c612c352c3334000000000000000000000000000000000000000000000000')
    await testWithStringInput(st, '"1,2,3,4qwerty,5", "0xf7a10e525d4b168f45f74db1b61f63d3e7619ea8", "1,a,5,34"', '0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000f7a10e525d4b168f45f74db1b61f63d3e7619ea800000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000000000000f312c322c332c347177657274792c3500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008312c612c352c3334000000000000000000000000000000000000000000000000')
    // string with space
    await testWithStringInput(st, '"1,2,3,,4qw  erty,5", "0xf7a10e525d4b168f45f74db1b61f63d3e7619ea8", "abcdefghijkl"', '0000000000000000000000000000000000000000000000000000000000000060000000000000000000000000f7a10e525d4b168f45f74db1b61f63d3e7619ea800000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000012312c322c332c2c3471772020657274792c350000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c6162636465666768696a6b6c0000000000000000000000000000000000000000')
  })
})

async function testWithStringInput (st, params, expected) {
  try {
    const data = await txFormat.buildData('stringContractTest', context.contract, context.output.contracts, true, context.contract.abi[0], params)
    console.log(data)
    if (!data.dataHex.endsWith(expected)) {
      st.fail(`result of buildData ${data.dataHex} should end with ${expected} . `)
    } else {
      st.pass(`testWithStringInput. result of buildData ${data.dataHex} ends with correct data`)
    }
  } catch (error) {
    st.fail(error)
  }
}

tape('ContractArrayParameters - (TxFormat.buildData) - format array input parameters', function (t) {
  let output = compiler.compile(compilerInput(arrayContract))
  output = JSON.parse(output)
  const contract = output.contracts['test.sol']['arrayContractTest']
  context = { output, contract }
  t.test('(TxFormat.buildData)', async function (st) {
    st.plan(3)
    await testWithArrayInput(st, '[true, false, true], ["0xf7a10e525d4b168f45f74db1b61f63d3e7619ea8", "0xf7a10e525d4b168f45f74db1b61f63d3e7619ea8"], ["0x0c5d9661b4fb92eb7472f28510ea68d4f369c8fe57b3ed4c2e8dfa4e79e549fd", "0x0c5d9661b4fb92eb7472f28510ea68d4f369c8fe57b3ed4c2e8dfa4e79e549fd"], [12, 34, 45], "itsremix"', '00000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001e0000000000000000000000000000000000000000000000000000000000000026000000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000f7a10e525d4b168f45f74db1b61f63d3e7619ea8000000000000000000000000f7a10e525d4b168f45f74db1b61f63d3e7619ea800000000000000000000000000000000000000000000000000000000000000020c5d9661b4fb92eb7472f28510ea68d4f369c8fe57b3ed4c2e8dfa4e79e549fd0c5d9661b4fb92eb7472f28510ea68d4f369c8fe57b3ed4c2e8dfa4e79e549fd0000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002d000000000000000000000000000000000000000000000000000000000000000869747372656d6978000000000000000000000000000000000000000000000000')
    await testWithArrayInput(st, '[true, false, true], ["0xf7a10e525d4b168f45f74db1b61f63d3e7619ea8", "0xf7a10e525d4b168f45f74db1b61f63d3e7619ea8"], ["0x0c5d9661b4fb92eb7472f28510ea68d4f369c8fe57b3ed4c2e8dfa4e79e549fd", "0x0c5d9661b4fb92eb7472f28510ea68d4f369c8fe57b3ed4c2e8dfa4e79e549fd"], ["12", "34", "45"], "itsremix"', '00000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001e0000000000000000000000000000000000000000000000000000000000000026000000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000f7a10e525d4b168f45f74db1b61f63d3e7619ea8000000000000000000000000f7a10e525d4b168f45f74db1b61f63d3e7619ea800000000000000000000000000000000000000000000000000000000000000020c5d9661b4fb92eb7472f28510ea68d4f369c8fe57b3ed4c2e8dfa4e79e549fd0c5d9661b4fb92eb7472f28510ea68d4f369c8fe57b3ed4c2e8dfa4e79e549fd0000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002d000000000000000000000000000000000000000000000000000000000000000869747372656d6978000000000000000000000000000000000000000000000000')
    // with complex string containing comma, space and underscore
    await testWithArrayInput(st, '[true, false, true], ["0xf7a10e525d4b168f45f74db1b61f63d3e7619ea8", "0xf7a10e525d4b168f45f74db1b61f63d3e7619ea8"], ["0x0c5d9661b4fb92eb7472f28510ea68d4f369c8fe57b3ed4c2e8dfa4e79e549fd", "0x0c5d9661b4fb92eb7472f28510ea68d4f369c8fe57b3ed4c2e8dfa4e79e549fd"], ["12", "34", "45"], "its  _  re, m,ix"', '00000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000018000000000000000000000000000000000000000000000000000000000000001e0000000000000000000000000000000000000000000000000000000000000026000000000000000000000000000000000000000000000000000000000000000030000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000f7a10e525d4b168f45f74db1b61f63d3e7619ea8000000000000000000000000f7a10e525d4b168f45f74db1b61f63d3e7619ea800000000000000000000000000000000000000000000000000000000000000020c5d9661b4fb92eb7472f28510ea68d4f369c8fe57b3ed4c2e8dfa4e79e549fd0c5d9661b4fb92eb7472f28510ea68d4f369c8fe57b3ed4c2e8dfa4e79e549fd0000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000022000000000000000000000000000000000000000000000000000000000000002d000000000000000000000000000000000000000000000000000000000000001069747320205f202072652c206d2c697800000000000000000000000000000000')
  })
})

async function testWithArrayInput (st, params, expected) {
  try {
    const data = await txFormat.buildData('arrayContractTest', context.contract, context.output.contracts, true, context.contract.abi[0], params)
    console.log(data)
    if (!data.dataHex.endsWith(expected)) {
      st.fail(`result of buildData ${data.dataHex} should end with ${expected} . `)
    } else {
      st.pass(`testWithArrayInput. result of buildData ${data.dataHex} ends with correct data`)
    }
  } catch (error) {
    st.fail(error)
  }
}

tape('ContractNestedArrayParameters - (TxFormat.buildData) - format nested array input parameters', function (t) {
  let output = compiler.compile(compilerInput(nestedArrayContract))
  output = JSON.parse(output)
  const contract = output.contracts['test.sol']['nestedArrayContractTest']
  context = { output, contract }
  t.test('(TxFormat.buildData)', async function (st) {
    st.plan(2)
    await testWithNestedArrayInput(st, '[[true],[false]]  , [ [[1,2],[3,4],[5,6]],  [[1,2],[3,4],[5,6]],  [ [1,2],[3,4],[5,6]] ],  "ab ab, a,b",  145', '0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000005000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000005000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000005000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000091000000000000000000000000000000000000000000000000000000000000000a61622061622c20612c6200000000000000000000000000000000000000000000')
    await testWithNestedArrayInput(st, '[[true],[false]]  , [ [["1","2"],["3","4"],["5","6"]],  [ ["1","2"],["3","4"],["5","6"]],  [ ["1","2"],["3","4"],["5","6"]] ],  "ab ab, a,b",  "145"', '0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000005000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000005000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000005000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000002c00000000000000000000000000000000000000000000000000000000000000091000000000000000000000000000000000000000000000000000000000000000a61622061622c20612c6200000000000000000000000000000000000000000000')
  })
})

async function testWithNestedArrayInput (st, params, expected) {
  try {
    const data = await txFormat.buildData('nestedArrayContractTest', context.contract, context.output.contracts, true, context.contract.abi[4], params)
    console.log(data)
    if (!data.dataHex.endsWith(expected)) {
      st.fail(`result of buildData ${data.dataHex} should end with ${expected} . `)
    } else {
      st.pass(`testWithNestedArrayInput. result of buildData ${data.dataHex} ends with correct data`)
    }
  } catch (error) {
    st.fail(error)
  }
}

tape('abiEncoderV2InvalidTuple - (TxFormat.buildData) - should throw error for invalid tuple value', function (t) {
  let output = compiler.compile(compilerInput(abiEncoderV2InvalidTuple))
  output = JSON.parse(output)
  const contract = output.contracts['test.sol']['test']
  context = { output, contract }
  t.test('(TxFormat.buildData)', async function (st) {
    st.plan(4)
    await testInvalidTupleInput(st, '[11, 12, "13"')
    await testInvalidTupleInput(st, '[11, 12, 13')
    await testInvalidTupleInput(st, '[11, 12, "13')
    await testInvalidTupleInput(st, '[11, 12, 13"')
  })
})

async function testInvalidTupleInput (st, params) {
  try {
    await txFormat.buildData('abiEncoderV2InvalidTuple', context.contract, context.output.contracts, true, context.contract.abi[2], params)
    st.fail('should have thrown an error for invalid tuple input')
  } catch (error) {
    st.ok(error.toString().includes('Error encoding arguments: Error: invalid tuple params'), 'should fail because of invalid tuple input')
  }
}

/* tape *********************************************************** */

tape('(TxFormat.buildData and link library (standard way))', async function (t) {
  t.plan(4)
  const compileData = compiler.compile(compilerInput(deploySimpleLib))
  const fakeDeployedContracts = {
    lib1: '0xf7a10e525d4b168f45f74db1b61f63d3e7619e11',
    lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2: '0xf7a10e525d4b168f45f74db1b61f63d3e7619e33',
    testContractLinkLibrary: '0xf7a10e525d4b168f45f74db1b61f63d3e7619e22'
  }
  const callbackDeployLibraries = (param, callback) => {
    callback(null, {
      receipt: {
        contractAddress: fakeDeployedContracts[param.data.contractName]
      }
    })
  }
  const output = JSON.parse(compileData)
  const contract = output.contracts['test.sol']['testContractLinkLibrary']
  context = { output, contract }
  await testLinkLibrary(t, fakeDeployedContracts, callbackDeployLibraries)
})

tape('(TxFormat.encodeConstructorCallAndLinkLibraries and link library (standard way))', async function (t) {
  t.plan(10)
  const compileData = compiler.compile(compilerInput(deploySimpleLib))
  const callbackDeployLibraries = (param, callback) => {
    const fakeDeployedContracts = {
      lib1: '0xf7a10e525d4b168f45f74db1b61f63d3e7619e11',
      lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2: '0xf7a10e525d4b168f45f74db1b61f63d3e7619e33',
      testContractLinkLibrary: '0xf7a10e525d4b168f45f74db1b61f63d3e7619e22'
    }
    callback(null, {
      receipt: {
        contractAddress: fakeDeployedContracts[param.data.contractName]
      }
    })
  }
  const output = JSON.parse(compileData)
  const contract = output.contracts['test.sol']['testContractLinkLibrary']
  context = { output, contract }
  await testLinkLibrary2(t, callbackDeployLibraries)
})

async function testLinkLibrary (st, fakeDeployedContracts, callbackDeployLibraries) {
  try {
    const data = await txFormat.buildData('testContractLinkLibrary', context.contract, context.output.contracts, true, context.contract.abi[0], '', callbackDeployLibraries)
    console.log(data)
    const linkedbyteCode = data.dataHex
    let libReference = context.contract.evm.bytecode.linkReferences['test.sol']['lib1']
    st.equal(linkedbyteCode.substr(2 * libReference[0].start, 40), fakeDeployedContracts['lib1'].replace('0x', ''))
    st.equal(linkedbyteCode.substr(2 * libReference[1].start, 40), fakeDeployedContracts['lib1'].replace('0x', ''))

    libReference = context.contract.evm.bytecode.linkReferences['test.sol']['lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2']
    st.equal(linkedbyteCode.substr(2 * libReference[0].start, 40), fakeDeployedContracts['lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2'].replace('0x', ''))
    st.equal(linkedbyteCode.substr(2 * libReference[1].start, 40), fakeDeployedContracts['lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2'].replace('0x', ''))
  } catch (error) {
    st.fail(error)
  }
}

async function testLinkLibrary2 (st, callbackDeployLibraries) {
  const librariesReference = {
    'test.sol': {
      'lib1': '0xf7a10e525d4b168f45f74db1b61f63d3e7619e11',
      'lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2': '0xf7a10e525d4b168f45f74db1b61f63d3e7619e33'
    }
  }

  const data = '608060405234801561001057600080fd5b506101e2806100206000396000f3fe608060405234801561001057600080fd5b506004361061002b5760003560e01c80636d4ce63c14610030575b600080fd5b61003861003a565b005b73f7a10e525d4b168f45f74db1b61f63d3e7619e116344733ae16040518163ffffffff1660e01b815260040160006040518083038186803b15801561007e57600080fd5b505af4158015610092573d6000803e3d6000fd5b5050505073f7a10e525d4b168f45f74db1b61f63d3e7619e336344733ae16040518163ffffffff1660e01b815260040160006040518083038186803b1580156100da57600080fd5b505af41580156100ee573d6000803e3d6000fd5b5050505073f7a10e525d4b168f45f74db1b61f63d3e7619e336344733ae16040518163ffffffff1660e01b815260040160006040518083038186803b15801561013657600080fd5b505af415801561014a573d6000803e3d6000fd5b5050505073f7a10e525d4b168f45f74db1b61f63d3e7619e116344733ae16040518163ffffffff1660e01b815260040160006040518083038186803b15801561019257600080fd5b505af41580156101a6573d6000803e3d6000fd5b5050505056fea264697066735822122007784c53df7f324243100f6642d889a08a88831c3811dd13eebe3163b7eb2e5464736f6c63430006000033'

  const result = txFormat.encodeConstructorCallAndLinkLibraries(context.contract, '', context.contract.abi[0], librariesReference, context.contract.evm.bytecode.linkReferences)
  console.log(result)
  st.equal(data, result.dataHex)
  let linkedbyteCode = result.dataHex
  let libReference = context.contract.evm.bytecode.linkReferences['test.sol']['lib1']
  st.equal(linkedbyteCode.substr(2 * libReference[0].start, 40), librariesReference['test.sol']['lib1'].replace('0x', ''))
  st.equal(linkedbyteCode.substr(2 * libReference[1].start, 40), librariesReference['test.sol']['lib1'].replace('0x', ''))
  libReference = context.contract.evm.bytecode.linkReferences['test.sol']['lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2']
  st.equal(linkedbyteCode.substr(2 * libReference[0].start, 40), librariesReference['test.sol']['lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2'].replace('0x', ''))
  st.equal(linkedbyteCode.substr(2 * libReference[1].start, 40), librariesReference['test.sol']['lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2'].replace('0x', ''))

  try {
    const result2 = await txFormat.encodeConstructorCallAndDeployLibraries('testContractLinkLibrary', context.contract, context.output.contracts, '', context.contract.abi[0], callbackDeployLibraries)
    console.log(result2)
    st.equal(data, result2.dataHex)
    linkedbyteCode = result2.dataHex
    libReference = context.contract.evm.bytecode.linkReferences['test.sol']['lib1']
    st.equal(linkedbyteCode.substr(2 * libReference[0].start, 40), librariesReference['test.sol']['lib1'].replace('0x', ''))
    st.equal(linkedbyteCode.substr(2 * libReference[1].start, 40), librariesReference['test.sol']['lib1'].replace('0x', ''))

    libReference = context.contract.evm.bytecode.linkReferences['test.sol']['lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2']
    st.equal(linkedbyteCode.substr(2 * libReference[0].start, 40), librariesReference['test.sol']['lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2'].replace('0x', ''))
    st.equal(linkedbyteCode.substr(2 * libReference[1].start, 40), librariesReference['test.sol']['lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2'].replace('0x', ''))
  } catch (error) {
    st.fail(error)
  }
}

/* tape *********************************************************** */

tape('(TxFormat.encodeFunctionCall)', function (t) {
  t.plan(1)
  encodeFunctionCallTest(t)
})

function encodeFunctionCallTest (st) {
  let output = compiler.compile(compilerInput(encodeFunctionCall))
  output = JSON.parse(output)
  const contract = output.contracts['test.sol']['testContractLinkLibrary']
  const encoded = txFormat.encodeFunctionCall('123, "test string"', contract.abi[0])

  st.equal(encoded.dataHex, '0x805da4ad000000000000000000000000000000000000000000000000000000000000007b0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000b7465737420737472696e67000000000000000000000000000000000000000000')
}

/* *********************************************************** */

tape('test fallback & receive function', function (t) {
  t.plan(3)
  let output = compiler.compile(compilerInput(fallbackAndReceiveFunction))
  output = JSON.parse(output)
  const contract = output.contracts['test.sol']['fallbackAndReceiveFunctionContract']
  t.equal(txHelper.encodeFunctionId(contract.abi[2]), '0x') // for receive function
  t.equal(txHelper.encodeFunctionId(contract.abi[1]), '0x805da4ad')
  t.equal(txHelper.encodeFunctionId(contract.abi[0]), '0x') // for fallback function
})

tape('test abiEncoderV2', function (t) {
  t.plan(2)
  const functionId = '0x56d89238'
  const encodedData = '0x000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000170000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000042ed123b0bd8203c2700000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000090746573745f737472696e675f746573745f737472696e675f746573745f737472696e675f746573745f737472696e675f746573745f737472696e675f746573745f737472696e675f746573745f737472696e675f746573745f737472696e675f746573745f737472696e675f746573745f737472696e675f746573745f737472696e675f746573745f737472696e675f00000000000000000000000000000000'
  const value1 = '1'
  const value2 = '1234567890123456789543'
  const value3 = 'test_string_test_string_test_string_test_string_test_string_test_string_test_string_test_string_test_string_test_string_test_string_test_string_'
  const decodedData = `[${value1}, ${value2}, "${value3}"], 23`
  let output = compiler.compile(compilerInput(abiEncoderV2))
  output = JSON.parse(output)
  const contract = output.contracts['test.sol']['test']
  const encoded = txFormat.encodeFunctionCall(decodedData, contract.abi[0])
  t.equal(encoded.dataHex, functionId + encodedData.replace('0x', ''))
  const decoded = txFormat.decodeResponse(hexToBytes(encodedData), contract.abi[0])
  console.log(decoded)
  t.equal(decoded[0], `tuple(uint256,uint256,string): ${value1},${value2},${value3}`)
})

tape('test abiEncoderV2 array of tuple', function (t) {
  /*
  {
    "685e37ad": "addStructs((uint256,string))",
    "e5cb65f9": "addStructs((uint256,string)[])"
  }
  */
  t.plan(2)

  let output = compiler.compile(compilerInput(abiEncoderV2ArrayOfTuple))
  output = JSON.parse(output)
  const contract = output.contracts['test.sol']['test']
  const encoded1 = txFormat.encodeParams('[34, "test"]', contract.abi[1])
  const decoded1 = txFormat.decodeResponse(hexToBytes(('0x' + encoded1.dataHex) as PrefixedHexString), contract.abi[1])
  console.log(decoded1)
  t.equal(decoded1[0], 'tuple(uint256,string): _strucmts 34,test')

  const encoded2 = txFormat.encodeParams('[[34, "test"], [123, "test2"]]', contract.abi[2])
  const decoded2 = txFormat.decodeResponse(hexToBytes(('0x' + encoded2.dataHex) as PrefixedHexString), contract.abi[2])
  console.log(decoded2)
  t.equal(decoded2[0], 'tuple(uint256,string)[]: strucmts 34,test,123,test2')
})

const uintContract = `contract uintContractTest {
    uint _tp;
    address _ap;
    function test(uint _t, address _a, uint _i) public {
        _tp = _t;
        _ap = _a;
    }
}`

const stringContract = `contract stringContractTest {
  string _tp;
  address _ap;
  function test(string memory _t, address _a, string memory _i) public {
      _tp = _t;
      _ap = _a;
  }
}`

const arrayContract = `contract arrayContractTest {
  string _sp;
  address _ap;
  uint _up;
  bytes32 _bp;
  bool _flag;

  function test(bool[] memory _b, address[] memory _a, bytes32[] memory names, uint[] memory _nums, string memory _i) public {
      _up = _nums[0];
      _ap = _a[0];
      _bp = names[0];
      _sp = _i;
      _flag = _b[0];
  }
}`

const nestedArrayContract = `contract nestedArrayContractTest {
  uint public co;
  string public str;
  bool public b1;
  bool public b2;

  function test(bool[1][2] memory _p, uint [2][3][3] memory _u, string memory _s, uint p) public {
      co = p;
      b1 = _p[0][0];
      b2= _p[1][0];
      str = _s;
  }
}`

const deploySimpleLib = `pragma solidity >= 0.5.0 < 0.7.0;

library lib1 {
    function getEmpty () public {
    }
}

library lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2 {
    function getEmpty () public {
    }
}

contract testContractLinkLibrary {
    function get () public {
        lib1.getEmpty();
        lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2.getEmpty();
        lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2_lib2.getEmpty();
        lib1.getEmpty();
 }
 }`

const encodeFunctionCall = `pragma solidity >= 0.5.0 < 0.7.0;

contract testContractLinkLibrary {
    function get (uint _p, string memory _o) public {
    }
 }`

const fallbackAndReceiveFunction = `pragma solidity >= 0.5.0 < 0.7.0;

contract fallbackAndReceiveFunctionContract {
    function get (uint _p, string memory _o) public {
    }

    fallback () external {}

    receive() payable external{}
 }`

const abiEncoderV2 = `pragma experimental ABIEncoderV2;

contract test {
    struct p {
        uint a;
        uint b;
        string s;
    }
    function t (p memory _p, uint _i) public returns (p memory) {
        return _p;
    }

     function t () public returns (p memory) {
        p memory mm;
        mm.a = 123;
        mm.b = 133;
        return mm;
    }

    function t2 (p memory _p) public {}
}`

const abiEncoderV2InvalidTuple = `pragma experimental ABIEncoderV2;

contract test {
    struct p {
        uint a;
        uint b;
        string s;
    }

    function t2 (p memory _p) public {}
}`

const abiEncoderV2ArrayOfTuple = `pragma experimental ABIEncoderV2;
contract test {

    struct MyStruct {uint256 num; string  _string;}

    constructor (MyStruct[] memory _structs, string memory _str) public {

    }

    function addStructs(MyStruct[] memory _structs) public returns (MyStruct[] memory strucmts) {
       strucmts = _structs;
    }

    function addStructs(MyStruct memory _structs) public returns (MyStruct memory _strucmts) {
      _strucmts = _structs;
    }
}`
