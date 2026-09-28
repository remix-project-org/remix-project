// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

/**
 * @title CounterV1
 * @dev Example UUPS (Universal Upgradeable Proxy Standard) implementation.
 *
 * Unlike the Transparent Proxy, UUPS puts the upgrade logic in the implementation
 * contract itself. The proxy is minimal (just delegatecall + storage). The
 * implementation defines _authorizeUpgrade() — here, restricted to the owner.
 *
 * HOW IT WORKS:
 * 1. Deploy the implementation (CounterV1)
 * 2. Deploy ERC1967Proxy(address(impl), abi.encodeCall(CounterV1.initialize, (owner)))
 * 3. Users call proxy → delegated to CounterV1
 * 4. To upgrade: proxy.upgradeToAndCall(address(CounterV2), initData)
 *    (This calls CounterV1._authorizeUpgrade on the proxy's context)
 *
 * ADVANTAGES over Transparent:
 * - Cheaper deployment (smaller proxy)
 * - No selector clash issues
 * - Logic can be upgraded without changing the proxy
 *
 * ⚠️  Risk: if you deploy a new impl without _authorizeUpgrade, you brick the proxy.
 *     Always verify the new implementation before upgrading.
 */
contract CounterV1 is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    uint256 public count;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner) external initializer {
        __Ownable_init(owner);
        __UUPSUpgradeable_init();
    }

    function increment() external {
        count += 1;
    }

    function version() external pure returns (string memory) {
        return "V1";
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}

/**
 * @title CounterV2
 * @dev Upgraded implementation — adds decrement() and a reset with access control.
 */
contract CounterV2 is Initializable, UUPSUpgradeable, OwnableUpgradeable {
    uint256 public count;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address owner) external initializer {
        __Ownable_init(owner);
        __UUPSUpgradeable_init();
    }

    function increment() external {
        count += 1;
    }

    function decrement() external {
        require(count > 0, "Cannot go below zero");
        count -= 1;
    }

    function reset() external onlyOwner {
        count = 0;
    }

    function version() external pure returns (string memory) {
        return "V2";
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
