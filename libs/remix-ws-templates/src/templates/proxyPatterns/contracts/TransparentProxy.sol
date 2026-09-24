// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

/**
 * @title MyTransparentProxy
 * @dev Example of the Transparent Proxy pattern.
 *
 * The Transparent Proxy separates the proxy admin (who can upgrade) from regular
 * users (who interact with the logic). If the caller is the ProxyAdmin, all calls
 * are admin calls (upgrade/changeAdmin). Otherwise, calls are delegated to the
 * implementation.
 *
 * HOW IT WORKS:
 * 1. Deploy the implementation contract (e.g., BoxV1)
 * 2. Deploy ProxyAdmin (controls who can upgrade)
 * 3. Deploy TransparentUpgradeableProxy(implementation, admin, initData)
 * 4. Users interact with the proxy address (gets delegated to implementation)
 * 5. To upgrade: admin calls proxyAdmin.upgradeAndCall(proxy, newImpl, data)
 *
 * ⚠️  Selector clash issue: admin calls on the proxy itself never reach the
 *     implementation. Use UUPS if you want admin functions in the logic.
 */
contract BoxV1 {
    uint256 private _value;

    event ValueChanged(uint256 value);

    function store(uint256 value) external {
        _value = value;
        emit ValueChanged(value);
    }

    function retrieve() external view returns (uint256) {
        return _value;
    }

    function version() external pure returns (string memory) {
        return "V1";
    }
}

/**
 * @title BoxV2
 * @dev Upgraded implementation — adds increment() function.
 * The state variable _value is preserved across upgrades.
 */
contract BoxV2 {
    uint256 private _value;

    event ValueChanged(uint256 value);

    function store(uint256 value) external {
        _value = value;
        emit ValueChanged(value);
    }

    function retrieve() external view returns (uint256) {
        return _value;
    }

    function increment() external {
        _value += 1;
        emit ValueChanged(_value);
    }

    function version() external pure returns (string memory) {
        return "V2";
    }
}
