// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Payable {
    uint256 public value;
    uint256 public chainId;

    constructor() payable {
        value = msg.value;
        chainId = block.chainid;
    }

    function deposit() external payable {
        value += msg.value;
        chainId = block.chainid;
    }
}
