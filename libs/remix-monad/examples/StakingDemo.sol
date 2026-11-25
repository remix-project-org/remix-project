// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract StakingDemo {
    address constant STAKING = address(0x1000);
    uint256 public value;
    bool public lastSuccess;
    bytes public result;

    event StakingCall(bytes4 selector, bool success, bytes output);
    error StakingFailed(bytes output);
    error CallerReverted();

    function stake(uint64 validatorId) external payable returns (bool) {
        return run(abi.encodeWithSignature("delegate(uint64)", validatorId), true);
    }

    function claim(uint64 validatorId) external returns (bool) {
        return run(abi.encodeWithSignature("claimRewards(uint64)", validatorId), true);
    }

    function unstake(uint64 validatorId, uint256 amount, uint8 withdrawalId) external returns (bool) {
        return run(abi.encodeWithSignature("undelegate(uint64,uint256,uint8)", validatorId, amount, withdrawalId), true);
    }

    function withdraw(uint64 validatorId, uint8 withdrawalId) external returns (bool) {
        return run(abi.encodeWithSignature("withdraw(uint64,uint8)", validatorId, withdrawalId), false);
    }

    function rejectAfterStake(uint64 validatorId) external payable {
        run(abi.encodeWithSignature("delegate(uint64)", validatorId), true);
        revert CallerReverted();
    }

    // Staking getters also require CALL. Use eth_call to read without committing state.
    function epoch() external returns (uint64 current, bool inDelay) {
        (bool success, bytes memory output) = STAKING.call(abi.encodeWithSignature("getEpoch()"));
        if (!success) revert StakingFailed(output);
        return abi.decode(output, (uint64, bool));
    }

    function run(bytes memory input, bool required) private returns (bool success) {
        value = 99;
        bytes memory output;
        (success, output) = STAKING.call{value: msg.value}(input);
        if (required && !success) revert StakingFailed(output);
        lastSuccess = success;
        result = output;
        value = success ? 42 : 11;
        emit StakingCall(bytes4(input), success, output);
    }
}
