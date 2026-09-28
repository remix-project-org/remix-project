// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title TokenBeacon / TokenImplementation
 * @dev Example of the Beacon Proxy pattern — ideal for factory-deployed clones.
 *
 * The Beacon holds the current implementation address. Multiple BeaconProxy
 * instances all point to the same Beacon, so upgrading one Beacon address
 * upgrades ALL proxies simultaneously. Perfect for:
 * - Uniswap V3 pools (all pools share one implementation)
 * - NFT collection clones
 * - Any factory pattern with many identical contracts
 *
 * HOW IT WORKS:
 * 1. Deploy the implementation (TokenImplementation)
 * 2. Deploy UpgradeableBeacon(address(impl), owner)
 * 3. Deploy many BeaconProxy(address(beacon), initData) instances
 * 4. All proxies delegate to the same implementation
 * 5. To upgrade ALL proxies at once: beacon.upgradeTo(address(newImpl))
 *
 * ADVANTAGES:
 * - Single upgrade transaction updates all clones
 * - Cheap per-clone deployment (< 1kb of bytecode)
 * - Great for protocol-wide logic upgrades
 */
contract TokenImplementation is Initializable {
    string public name;
    string public symbol;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 value);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        string memory _name,
        string memory _symbol,
        uint256 initialSupply,
        address recipient
    ) external initializer {
        name = _name;
        symbol = _symbol;
        totalSupply = initialSupply;
        balanceOf[recipient] = initialSupply;
        emit Transfer(address(0), recipient, initialSupply);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function version() external pure returns (string memory) {
        return "V1";
    }
}

/**
 * @title TokenFactory
 * @dev Deploys BeaconProxy instances for each new token clone.
 * All clones share one UpgradeableBeacon — upgrade the beacon to upgrade all.
 */
contract TokenFactory {
    UpgradeableBeacon public immutable beacon;
    address[] public allTokens;

    event TokenCreated(address indexed token, string name, string symbol);

    constructor(address implementation) {
        beacon = new UpgradeableBeacon(implementation, msg.sender);
    }

    function createToken(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address recipient
    ) external returns (address) {
        bytes memory initData = abi.encodeCall(
            TokenImplementation.initialize,
            (name, symbol, initialSupply, recipient)
        );
        BeaconProxy proxy = new BeaconProxy(address(beacon), initData);
        allTokens.push(address(proxy));
        emit TokenCreated(address(proxy), name, symbol);
        return address(proxy);
    }

    function tokenCount() external view returns (uint256) {
        return allTokens.length;
    }
}
