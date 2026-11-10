// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

contract ParamTest {
    uint256 public count;
    string public label;
    address public owner;

    constructor(uint256 _count, string memory _label, address _owner) {
        count = _count;
        label = _label;
        owner = _owner;
    }

    function update(uint256 _count, string memory _label) public {
        count = _count;
        label = _label;
    }
}
