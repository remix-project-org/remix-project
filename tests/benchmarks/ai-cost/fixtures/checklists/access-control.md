# Audit Checklist — Access Control

Who can call what, and whether that is enforced on every path.

- [ ] Every state-changing function that should be restricted has an explicit access check
- [ ] Ownership / admin roles are set in the constructor or initializer and cannot be claimed by anyone
- [ ] Role changes (grant, revoke, transfer ownership) are themselves restricted and emit events
- [ ] No function relies on `tx.origin` for authorization
- [ ] Privileged parameters (fees, oracles, limits) are bounded or validated when changed
- [ ] Emergency functions (pause, sweep, upgrade) cannot be abused to take user funds
