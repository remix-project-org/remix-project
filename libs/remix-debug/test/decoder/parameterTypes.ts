'use strict'
import tape from 'tape'
import { CompilerAbstract } from '@remix-project/remix-solidity'
const compiler = require('solc')
const fs = require('fs')
const path = require('path')
const compilerInput = require('../helpers/compilerHelper').compilerInput

const parameterTypesContract = {
  contract: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Base contract for inheritance testing
contract BaseContract {
    constructor(uint256 _baseValue, string memory _baseMessage) {
        // Parameters should be decoded here
        baseValue = _baseValue;
        baseMessage = _baseMessage;
    }
    
    uint256 public baseValue;
    string public baseMessage;
}

// Contract for external calls
contract ExternalTarget {
    function externalFunction(uint256 _value, string memory _message) public returns (uint256, string memory) {
        return (_value + 100, string(abi.encodePacked("External: ", _message)));
    }
    
    function readOnlyFunction(uint256 _value, string memory _message) public pure returns (uint256, string memory) {
        return (_value + 200, string(abi.encodePacked("ReadOnly: ", _message)));
    }
}

// Contract for delegate calls
contract DelegateTarget {
    uint256 public value;
    string public message;
    
    function delegateFunction(uint256 _value, string memory _message) public {
        value = _value + 300;
        message = string(abi.encodePacked("Delegate: ", _message));
    }
}

// Factory contract for CREATE/CREATE2
contract ChildContract {
    uint256 public childValue;
    string public childMessage;
    
    constructor(uint256 _value, string memory _message) {
        childValue = _value;
        childMessage = _message;
    }
}

// Main test contract that extends BaseContract
contract ParameterTestContract is BaseContract {
    ExternalTarget public externalTarget;
    DelegateTarget public delegateTarget;
    uint256 public value;
    string public message;
    
    constructor(uint256 _constructorValue, string memory _constructorMessage) 
        BaseContract(_constructorValue + 10, string(abi.encodePacked("Base: ", _constructorMessage))) {
        externalTarget = new ExternalTarget();
        delegateTarget = new DelegateTarget();
    }
    
    // 1. Direct function call (transaction target)
    function directCall(uint256 _directValue, string memory _directMessage) public {
        value = _directValue;
        message = _directMessage;
    }
    
    // 2. Internal function call
    function internalCallTest(uint256 _testValue, string memory _testMessage) public {
        _internalFunction(_testValue + 50, string(abi.encodePacked("Internal: ", _testMessage)));
    }
    
    function _internalFunction(uint256 _internalValue, string memory _internalMessage) internal {
        value = _internalValue;
        message = _internalMessage;
    }
    
    // 3. External call using this.function()
    function thisCallTest(uint256 _thisValue, string memory _thisMessage) public {
        this.externalCallViaThis(_thisValue + 25, string(abi.encodePacked("This: ", _thisMessage)));
    }
    
    function externalCallViaThis(uint256 _externalValue, string memory _externalMessage) public {
        value = _externalValue;
        message = _externalMessage;
    }
    
    // 4. CALL operation
    function callTest(uint256 _callValue, string memory _callMessage) public {
        (bool success, bytes memory result) = address(externalTarget).call(
            abi.encodeWithSignature("externalFunction(uint256,string)", 
                _callValue, 
                _callMessage)
        );
        require(success, "CALL failed");
        (uint256 resultValue, string memory resultMessage) = abi.decode(result, (uint256, string));
        value = resultValue;
        message = resultMessage;
    }
    
    // 5. STATICCALL operation
    function staticCallTest(uint256 _staticValue, string memory _staticMessage) public {
        (bool success, bytes memory result) = address(externalTarget).staticcall(
            abi.encodeWithSignature("readOnlyFunction(uint256,string)", 
                _staticValue, 
                _staticMessage)
        );
        require(success, "STATICCALL failed");
        (uint256 resultValue, string memory resultMessage) = abi.decode(result, (uint256, string));
        value = resultValue;
        message = resultMessage;
    }
    
    // 6. DELEGATECALL operation
    function delegateCallTest(uint256 _delegateValue, string memory _delegateMessage) public {
        (bool success,) = address(delegateTarget).delegatecall(
            abi.encodeWithSignature("delegateFunction(uint256,string)", 
                _delegateValue, 
                _delegateMessage)
        );
        require(success, "DELEGATECALL failed");
    }
    
    // 7. CREATE operation
    function createTest(uint256 _createValue, string memory _createMessage) public returns (address) {
        ChildContract child = new ChildContract(_createValue, _createMessage);
        value = _createValue + 400;
        message = string(abi.encodePacked("Created: ", _createMessage));
        return address(child);
    }
    
    // 8. CREATE2 operation
    function create2Test(uint256 _create2Value, string memory _create2Message, bytes32 _salt) public returns (address) {
        ChildContract child = new ChildContract{salt: _salt}(_create2Value, _create2Message);
        value = _create2Value + 500;
        message = string(abi.encodePacked("Create2: ", _create2Message));
        return address(child);
    }
    
    // 9. Function with return values - uint and string
    function returnValueTest(uint256 _inputValue, string memory _inputMessage) public returns (uint256, string memory) {
        uint256 returnUint = _inputValue + 1000;
        string memory returnString = string(abi.encodePacked("Return: ", _inputMessage));
        return (returnUint, returnString);
    }
    
    // 10. Pure function with return values
    function pureReturnTest(uint256 _pureValue, string memory _pureMessage) public pure returns (uint256, string memory) {
        return (_pureValue + 2000, string(abi.encodePacked("Pure: ", _pureMessage)));
    }
}`
}

const parameterTypesTest = require('./localsTests/parameterTypes')

tape('parameter types', function (t) {
  t.test('parameter types decoder', async function (st) {
    const privateKey = Buffer.from('503f38a9c967ed597e47fe25643985f032b072db8075426a92110f82df48dfcb', 'hex')
    await test(st, privateKey)
  })
})

async function test (st, privateKey) {
  let output = compiler.compile(compilerInput(parameterTypesContract.contract))
  output = JSON.parse(output)
  const sources = {
    target: 'test.sol',
    sources: { 'test.sol': { content: parameterTypesContract.contract } }
  }
  const compilationResults = new CompilerAbstract('json', output, sources)
  console.log('parameterTypesTest')
  await parameterTypesTest(st, privateKey, output.contracts['test.sol']['ParameterTestContract'].evm.bytecode.object, compilationResults, parameterTypesContract.contract)

  st.end()
}