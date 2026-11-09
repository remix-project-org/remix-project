// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// Contract that uses a low-level call, which SMTChecker marks as an
/// "unsupported feature" (external calls break the closed-world assumption).
/// A formal check here should return NOT_PROVEN(unsupported_feature).
contract LowLevelCaller {
    address public target;

    constructor(address _target) {
        target = _target;
    }

    function forwardCall(bytes calldata data) external returns (bytes memory) {
        (bool ok, bytes memory result) = target.call(data);
        require(ok, "call failed");
        return result;
    }

    function checkTarget() external view {
        assert(target != address(0));
    }
}
