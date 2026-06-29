'use strict'
import tape from 'tape'
import { CompilerAbstract } from '@remix-project/remix-solidity'
const compiler = require('solc')
const fs = require('fs')
const path = require('path')
const compilerInput = require('../helpers/compilerHelper').compilerInput

const callTypesContract = {
  contract: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Contract A
contract ContractA {
    ContractB public contractBAddress;
    ContractC public contractCAddress;
    
    constructor() {
        contractBAddress = new ContractB();
        contractCAddress = new ContractC();
    }
    
    function callContracts() public {
        // CALL to ContractB
        (bool successB, ) = address(contractBAddress).call{value: 0}(abi.encodeWithSignature("contractBFunction()"));
        require(successB, "Call to ContractB failed");
        
        // STATICCALL to ContractC
        (bool successC, bytes memory resultC) = address(contractCAddress).staticcall(abi.encodeWithSignature("contractCFunction()"));
        require(successC, "Staticcall to ContractC failed");
        
        // DELEGATECALL to ContractB
        (bool successD, ) = address(contractBAddress).delegatecall(abi.encodeWithSignature("contractBFunction()"));
        require(successD, "Delegatecall to ContractB failed");

        // DELEGATECALL to ContractB
        (successD, ) = address(contractBAddress).delegatecall(abi.encodeWithSignature("contractBFunction()"));
        require(successD, "Delegatecall to ContractB failed");
    }
}

// Contract B
contract ContractB {
    function contractBFunction() public pure returns (string memory) {
        return "ContractB function called";
    }
}

// Contract C
contract ContractC {
    function contractCFunction() public pure returns (string memory) {
        return "ContractC function called";
    }
}`
}

const callTypesTest = require('./localsTests/callTypes')

tape('call types', function (t) {
  t.test('call types decoder', async function (st) {
    const privateKey = Buffer.from('503f38a9c967ed597e47fe25643985f032b072db8075426a92110f82df48dfcb', 'hex')
    await test(st, privateKey)
  })
})

async function test (st, privateKey) {
  let output = compiler.compile(compilerInput(callTypesContract.contract))
  output = JSON.parse(output)
  const sources = {
    target: 'test.sol',
    sources: { 'test.sol': { content: callTypesContract.contract } }
  }
  const compilationResults = new CompilerAbstract('json', output, sources)
  console.log('callTypesTest')
  await callTypesTest(st, privateKey, output.contracts['test.sol']['ContractA'].evm.bytecode.object, compilationResults, callTypesContract.contract)

  st.end()
}