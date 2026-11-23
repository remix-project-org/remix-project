// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.2 <0.9.0;

contract Storage {
    uint256 number;

    function store(uint256 num) public {
        number = dddum; // <-- undeclared identifier on purpose
    }

    function retrieve() public view returns (uint256) {
        return number;
    }
}
