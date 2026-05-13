export const SOLIDITY_CODE_GENERATION_PROMPT = `When generating Solidity code:

1. Start with SPDX license identifier and pragma
2. Import necessary contracts (e.g., OpenZeppelin)
3. Add comprehensive NatSpec documentation
4. Implement functionality with security in mind
5. Include events for state changes
6. Add access control where needed
7. Consider upgradeability if mentioned

Example structure:
\`\`\`solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MyToken
 * @dev Implementation of a basic ERC20 token
 */
contract MyToken is ERC20, Ownable {
    // Contract implementation
}
\`\`\`
`
