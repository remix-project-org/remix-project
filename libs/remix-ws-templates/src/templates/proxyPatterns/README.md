# Proxy & Upgradeability Patterns

Three **proxy patterns** for making smart contracts upgradeable without changing their address. All use `delegatecall` to forward calls to a logic contract while keeping storage in the proxy.

## Contracts

| File | Pattern | Contracts |
|---|---|---|
| `TransparentProxy.sol` | Transparent Proxy | BoxV1, BoxV2 |
| `UUPSProxy.sol` | UUPS (Universal Upgradeable Proxy Standard) | CounterV1, CounterV2 |
| `BeaconProxy.sol` | Beacon Proxy | TokenImplementation, TokenFactory |

## Pattern Comparison

| Feature | Transparent | UUPS | Beacon |
|---|---|---|---|
| Upgrade logic location | ProxyAdmin | Implementation | Beacon contract |
| Deploy cost | Higher (ProxyAdmin) | Lower (smaller proxy) | Medium |
| Selector clash risk | Yes (admin calls) | No | No |
| Best for | General use | Gas efficiency | Many identical clones |
| Upgrade all clones at once | N/A | N/A | ✅ Yes |

## Transparent Proxy

Admin and user calls are separated: ProxyAdmin calls are admin operations, all other calls delegate to the implementation.

```
deploy BoxV1 → deploy ProxyAdmin → deploy TransparentUpgradeableProxy
→ upgrade: proxyAdmin.upgradeAndCall(proxy, BoxV2, "")
```

## UUPS Proxy

The upgrade function lives in the implementation. Cheaper proxy — just ERC1967 storage slots + delegatecall.

```
deploy CounterV1 → deploy ERC1967Proxy(CounterV1, initData)
→ upgrade: proxy.upgradeToAndCall(CounterV2, "")  (calls CounterV1._authorizeUpgrade)
```

## Beacon Proxy

All proxy instances share one Beacon. Upgrade the Beacon once → all clones upgrade.

```
deploy TokenImplementation → deploy TokenFactory(impl)
→ factory.createToken(...) → creates BeaconProxy instances
→ factory.beacon().upgradeTo(newImpl)  → ALL tokens upgraded at once
```

## Production Examples

- **Uniswap V3** — Beacon proxies for pool clones
- **OpenZeppelin contracts** — TransparentUpgradeableProxy and UUPS
- **Aave V3** — UUPS upgradeable pool contracts
