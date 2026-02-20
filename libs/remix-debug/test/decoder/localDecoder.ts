'use strict'
import tape from 'tape'
import { CompilerAbstract } from '@remix-project/remix-solidity'
const compiler = require('solc')
const intLocal = require('./contracts/intLocal')
const miscLocal = require('./contracts/miscLocal')
const structArrayLocal = require('./contracts/structArrayLocal')
const calldataLocal = require('./contracts/calldata')
const intLocalTest = require('./localsTests/int')
const miscLocalTest = require('./localsTests/misc')
const misc2LocalTest = require('./localsTests/misc2')
const structArrayLocalTest = require('./localsTests/structArray')
const calldataLocalTest = require('./localsTests/calldata')
const compilerInput = require('../helpers/compilerHelper').compilerInput

tape('solidity', function (t) {
  t.test('local decoder', async function (st) {
    const privateKey = Buffer.from('503f38a9c967ed597e47fe25643985f032b072db8075426a92110f82df48dfcb', 'hex')
    await test(st, privateKey)
  })
})

async function test (st, privateKey) {
  let output = compiler.compile(compilerInput(intLocal.contract))
  output = JSON.parse(output)
  let sources = {
    target: 'test.sol',
    sources: { 'test.sol': { content: intLocal.contract } }
  }
  let compilationResults = new CompilerAbstract('json', output, sources)
  console.log('intLocalTest')
  await intLocalTest(st, privateKey, output.contracts['test.sol']['intLocal'].evm.bytecode.object, compilationResults, intLocal.contract)

  output = compiler.compile(compilerInput(miscLocal.contract))
  output = JSON.parse(output)
  sources = {
    target: 'test.sol',
    sources: { 'test.sol': { content: miscLocal.contract } }
  }
  compilationResults = new CompilerAbstract('json', output, sources)
  console.log('miscLocalTest')
  await miscLocalTest(st, privateKey, output.contracts['test.sol']['miscLocal'].evm.bytecode.object, compilationResults, miscLocal.contract)

  output = compiler.compile(compilerInput(miscLocal.contract))
  output = JSON.parse(output)
  sources = {
    target: 'test.sol',
    sources: { 'test.sol': { content: miscLocal.contract } }
  }
  compilationResults = new CompilerAbstract('json', output, sources)
  console.log('misc2LocalTest')
  await misc2LocalTest(st, privateKey, output.contracts['test.sol']['miscLocal2'].evm.bytecode.object, compilationResults, miscLocal.contract)

  output = compiler.compile(compilerInput(structArrayLocal.contract))
  output = JSON.parse(output)
  sources = {
    target: 'test.sol',
    sources: { 'test.sol': { content: structArrayLocal.contract } }
  }
  compilationResults = new CompilerAbstract('json', output, sources)
  console.log('structArrayLocalTest')
  await structArrayLocalTest(st, privateKey, output.contracts['test.sol']['structArrayLocal'].evm.bytecode.object, compilationResults, structArrayLocal.contract)

  output = compiler.compile(compilerInput(calldataLocal.contract))
  output = JSON.parse(output)
  sources = {
    target: 'test.sol',
    sources: { 'test.sol': { content: calldataLocal.contract } }
  }
  compilationResults = new CompilerAbstract('json', output, sources)
  console.log('calldataLocalTest')
  await calldataLocalTest(st, privateKey, output.contracts['test.sol']['calldataLocal'].evm.bytecode.object, compilationResults, calldataLocal.contract)

  st.end()
}
