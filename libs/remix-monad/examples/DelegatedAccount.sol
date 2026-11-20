// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract DelegatedChild {}

contract DelegatedAccount {
    uint256 public value;
    event Stored(address account, uint256 value);
    error Rejected();

    receive() external payable {}

    function self() external view returns (address) {
        return address(this);
    }

    function store(uint256 newValue) external {
        value = newValue;
        emit Stored(address(this), value);
    }

    function reject() external {
        value = 99;
        emit Stored(address(this), value);
        revert Rejected();
    }

    function transfer(address payable recipient, uint256 amount) external {
        (bool success,) = recipient.call{value: amount}("");
        require(success);
    }

    function createChild() external returns (address) {
        return address(new DelegatedChild());
    }

    function createChild2() external returns (address) {
        return address(new DelegatedChild{salt: bytes32(0)}());
    }
}
