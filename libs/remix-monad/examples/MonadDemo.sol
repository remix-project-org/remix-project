// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IMonadDepth {
    function depth() external view returns (uint256);
}

contract MonadDemo {
    uint256 public value;
    address public immutable depthOracle;
    event ValueChanged(uint256 value);

    constructor() {
        // The runtime executes CALLSTACKDEPTH (AE 00), then returns its value.
        bytes memory initcode = hex"6008600c60003960086000f3ae005f5260205ff3";
        address oracle;
        assembly { oracle := create(0, add(initcode, 32), mload(initcode)) }
        require(oracle != address(0), "oracle creation failed");
        depthOracle = oracle;
    }

    function store(uint256 newValue) external {
        value = newValue;
        emit ValueChanged(newValue);
    }

    function recordDepth() external {
        value = IMonadDepth(depthOracle).depth();
        emit ValueChanged(value);
    }
}
