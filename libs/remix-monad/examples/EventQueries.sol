// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract EventQueries {
    uint256 public value;

    event Updated(address indexed sender, uint256 indexed key, uint256 value, string note);
    event AnonymousValue(uint256 value) anonymous;

    function store(uint256 key, uint256 next, string calldata note) external {
        value = next;
        emit Updated(msg.sender, key, next, note);
        emit AnonymousValue(next);
    }

    function reject(uint256 key) external {
        value = 99;
        emit Updated(msg.sender, key, 99, "reverted");
        revert("discard event");
    }

    function catchFailure(uint256 key) external {
        try this.reject(key) {} catch {
            emit Updated(msg.sender, key, value, "caught");
        }
    }
}
