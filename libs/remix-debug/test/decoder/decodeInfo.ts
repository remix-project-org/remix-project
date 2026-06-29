'use strict'
import tape from 'tape'
import { compile } from 'solc'
import * as astHelper from '../../src/solidity-decoder/helpers/astHelper'
import * as decodeInfo from '../../src/solidity-decoder/decodeInfo'
import * as stateDecoder from '../../src/solidity-decoder/stateDecoder'
const contracts = require('./contracts/miscContracts')
const simplecontracts = require('./contracts/simpleContract')
import { compilerInput } from '../helpers/compilerHelper'
import * as util from '../../src/solidity-decoder/types/util'

tape('solidity', function (t) {
  t.test('astHelper, decodeInfo', function (st) {
    let output = compile(compilerInput(contracts))
    output = JSON.parse(output)

    let state: any = astHelper.extractStateDefinitions('test.sol:contractUint', output.sources, null)
    let states = astHelper.extractStatesDefinitions(output.sources, null)
    let stateDef = state.stateDefinitions
    let parsedType = decodeInfo.parseType(stateDef[0].typeDescriptions.typeString, states, 'contractUint', util.extractLocationFromAstVariable(stateDef[0]))
    checkDecodeInfo(st, parsedType, 1, 1, 'uint8')
    parsedType = decodeInfo.parseType(stateDef[1].typeDescriptions.typeString, states, 'contractUint', util.extractLocationFromAstVariable(stateDef[1]))
    checkDecodeInfo(st, parsedType, 1, 32, 'uint256')
    parsedType = decodeInfo.parseType(stateDef[2].typeDescriptions.typeString, states, 'contractUint', util.extractLocationFromAstVariable(stateDef[2]))
    checkDecodeInfo(st, parsedType, 1, 32, 'uint256')
    parsedType = decodeInfo.parseType(stateDef[3].typeDescriptions.typeString, states, 'contractUint', util.extractLocationFromAstVariable(stateDef[3]))
    checkDecodeInfo(st, parsedType, 1, 16, 'bytes16')

    state = astHelper.extractStateDefinitions('test.sol:contractStructAndArray', output.sources, null)
    stateDef = state.stateDefinitions
    parsedType = decodeInfo.parseType(stateDef[1].typeDescriptions.typeString, states, 'contractStructAndArray', util.extractLocationFromAstVariable(stateDef[1]))
    checkDecodeInfo(st, parsedType, 2, 32, 'struct contractStructAndArray.structDef')
    parsedType = decodeInfo.parseType(stateDef[2].typeDescriptions.typeString, states, 'contractStructAndArray', util.extractLocationFromAstVariable(stateDef[2]))
    checkDecodeInfo(st, parsedType, 6, 32, 'struct contractStructAndArray.structDef[3]')
    parsedType = decodeInfo.parseType(stateDef[3].typeDescriptions.typeString, states, 'contractStructAndArray', util.extractLocationFromAstVariable(stateDef[3]))
    checkDecodeInfo(st, parsedType, 2, 32, 'bytes12[4]')

    state = astHelper.extractStateDefinitions('test.sol:contractArray', output.sources, null)
    stateDef = state.stateDefinitions
    parsedType = decodeInfo.parseType(stateDef[0].typeDescriptions.typeString, states, 'contractArray', util.extractLocationFromAstVariable(stateDef[0]))
    checkDecodeInfo(st, parsedType, 1, 32, 'uint32[5]')
    parsedType = decodeInfo.parseType(stateDef[1].typeDescriptions.typeString, states, 'contractArray', util.extractLocationFromAstVariable(stateDef[1]))
    checkDecodeInfo(st, parsedType, 1, 32, 'int8[]')
    parsedType = decodeInfo.parseType(stateDef[2].typeDescriptions.typeString, states, 'contractArray', util.extractLocationFromAstVariable(stateDef[2]))
    checkDecodeInfo(st, parsedType, 4, 32, 'int16[][3][][4]')

    state = astHelper.extractStateDefinitions('test.sol:contractEnum', output.sources, null)
    stateDef = state.stateDefinitions
    parsedType = decodeInfo.parseType(stateDef[1].typeDescriptions.typeString, states, 'contractEnum', null)
    checkDecodeInfo(st, parsedType, 1, 1, 'enum')

    state = astHelper.extractStateDefinitions('test.sol:contractSmallVariable', output.sources, null)
    stateDef = state.stateDefinitions
    parsedType = decodeInfo.parseType(stateDef[0].typeDescriptions.typeString, states, 'contractSmallVariable', util.extractLocationFromAstVariable(stateDef[0]))
    checkDecodeInfo(st, parsedType, 1, 1, 'int8')
    parsedType = decodeInfo.parseType(stateDef[1].typeDescriptions.typeString, states, 'contractSmallVariable', util.extractLocationFromAstVariable(stateDef[1]))
    checkDecodeInfo(st, parsedType, 1, 1, 'uint8')
    parsedType = decodeInfo.parseType(stateDef[2].typeDescriptions.typeString, states, 'contractSmallVariable', util.extractLocationFromAstVariable(stateDef[2]))
    checkDecodeInfo(st, parsedType, 1, 2, 'uint16')
    parsedType = decodeInfo.parseType(stateDef[3].typeDescriptions.typeString, states, 'contractSmallVariable', util.extractLocationFromAstVariable(stateDef[3]))
    checkDecodeInfo(st, parsedType, 1, 4, 'int32')
    parsedType = decodeInfo.parseType(stateDef[4].typeDescriptions.typeString, states, 'contractSmallVariable', util.extractLocationFromAstVariable(stateDef[4]))
    checkDecodeInfo(st, parsedType, 1, 32, 'uint256')
    parsedType = decodeInfo.parseType(stateDef[5].typeDescriptions.typeString, states, 'contractSmallVariable', util.extractLocationFromAstVariable(stateDef[5]))
    checkDecodeInfo(st, parsedType, 1, 2, 'int16')

    output = compile(compilerInput(simplecontracts))
    output = JSON.parse(output)
    state = astHelper.extractStateDefinitions('test.sol:simpleContract', output.sources, null)
    states = astHelper.extractStatesDefinitions(output.sources, null)
    stateDef = state.stateDefinitions
    parsedType = decodeInfo.parseType(stateDef[2].typeDescriptions.typeString, states, 'simpleContract', util.extractLocationFromAstVariable(stateDef[2]))
    checkDecodeInfo(st, parsedType, 2, 32, 'struct simpleContract.structDef')
    parsedType = decodeInfo.parseType(stateDef[3].typeDescriptions.typeString, states, 'simpleContract', util.extractLocationFromAstVariable(stateDef[3]))
    checkDecodeInfo(st, parsedType, 6, 32, 'struct simpleContract.structDef[3]')
    parsedType = decodeInfo.parseType(stateDef[4].typeDescriptions.typeString, states, 'simpleContract', util.extractLocationFromAstVariable(stateDef[4]))
    checkDecodeInfo(st, parsedType, 1, 1, 'enum')

    state = astHelper.extractStateDefinitions('test.sol:test2', output.sources, null)
    stateDef = state.stateDefinitions
    parsedType = decodeInfo.parseType(stateDef[0].typeDescriptions.typeString, states, 'test1', util.extractLocationFromAstVariable(stateDef[0]))
    checkDecodeInfo(st, parsedType, 1, 32, 'struct test1.str')

    state = stateDecoder.extractStateVariables('test.sol:test2', output.sources)
    checkDecodeInfo(st, parsedType, 1, 32, 'struct test1.str')

    st.end()
  })
})

function checkDecodeInfo (st, decodeInfo, storageSlots, storageBytes, typeName) {
  st.equal(decodeInfo.storageSlots, storageSlots)
  st.equal(decodeInfo.storageBytes, storageBytes)
  st.equal(decodeInfo.typeName, typeName)
}
