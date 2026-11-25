// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

error NestedFailure(uint256 value);

contract NestedLeaf {
    uint256 public value;
    event Written(uint256 value);

    function write(uint256 next) external returns (uint256) {
        value = next;
        emit Written(next);
        return next;
    }

    function read(uint256 extra) external view returns (uint256) {
        return value + extra;
    }
}

contract NestedCallee {
    uint256 public value;
    NestedLeaf public immutable leaf = new NestedLeaf();

    function inspect(address probe, uint8 kind) external returns (bytes memory result) {
        bool ok;
        if (kind == 0) (ok, result) = probe.call("");
        else if (kind == 1) (ok, result) = probe.staticcall("");
        else (ok, result) = probe.delegatecall("");
        require(ok, "probe failed");
    }

    function read(uint256 extra) external view returns (uint256) {
        return leaf.read(extra);
    }

    function mutate() external {
        value = 41;
        leaf.write(7);
        value = 42;
    }

    function fail() external {
        value = 20;
        leaf.write(30);
        revert NestedFailure(20);
    }
}

contract NestedCalls {
    uint256 public value;
    NestedCallee public immutable callee = new NestedCallee();
    address public immutable probe;
    event Written(uint256 value);
    event Failure(bytes reason);

    constructor() {
        // Return one ABI word from code without a Solidity source map.
        bytes memory runtime = hex"60635f5260205ff3";
        bytes memory initcode = abi.encodePacked(hex"6008600c60003960086000f3", runtime);
        address deployed;
        assembly { deployed := create(0, add(initcode, 32), mload(initcode)) }
        require(deployed != address(0), "probe creation failed");
        probe = deployed;
    }

    function inspect(uint8 kind) external returns (bytes memory) {
        return callee.inspect(probe, kind);
    }

    function staticRead(uint256 extra) external view returns (uint256) {
        return callee.read(extra);
    }

    function delegateStore() external {
        value = 10;
        (bool ok,) = address(callee).delegatecall(abi.encodeCall(callee.mutate, ()));
        require(ok, "delegate failed");
        value = 43;
    }

    function caughtRevert() external returns (bytes memory reason) {
        value = 10;
        try callee.fail() {} catch (bytes memory failure) { reason = failure; }
        value = 11;
        emit Failure(reason);
    }

    function propagatedRevert() external {
        value = 10;
        emit Written(10);
        callee.fail();
    }

    function catchHalt(address target) external returns (bool ok, bytes memory reason) {
        (ok, reason) = target.call{gas: 12000}("");
        value = 14;
        emit Failure(reason);
    }
}
