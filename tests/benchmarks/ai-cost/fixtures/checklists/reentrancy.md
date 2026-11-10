# Audit Checklist — Reentrancy and External Calls

How the contract behaves when an external call re-enters it.

- [ ] State is updated before external calls (checks-effects-interactions)
- [ ] Functions that move value are protected by a reentrancy guard where needed
- [ ] Read-only reentrancy cannot expose stale state to other protocols
- [ ] Return values of low-level calls and token transfers are checked
- [ ] Callbacks (ERC721/1155 receivers, hooks) cannot re-enter into inconsistent state
- [ ] Loops over external calls cannot be griefed into running out of gas
