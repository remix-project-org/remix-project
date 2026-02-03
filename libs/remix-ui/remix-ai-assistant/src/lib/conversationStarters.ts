export interface ConversationStarter {
  question: string;
  level: 'beginner' | 'intermediate' | 'expert';
  category: string;
}

// Original conversation starters (pre-MCP)
const CONVERSATION_STARTERS_ORIGINAL: ConversationStarter[] = [
  // Beginner Level (20 Questions)
  { question: "What is the purpose of pragma statement", level: "beginner", category: "programming" },
  { question: "How to use blob storage?", level: "beginner", category: "Solidity" },
  { question: "What is the difference between storage, memory, and calldata in Solidity?", level: "beginner", category: "Solidity" },
  { question: "How are dynamic arrays stored in contract storage?", level: "beginner", category: "Solidity" },
  { question: "How does delegatecall differ from call? ", level: "beginner", category: "Solidity" },
  { question: "How to avoid using dynamic array in Solidity?", level: "beginner", category: "Solidity" },
  { question: "List some gas saving techniques", level: "beginner", category: "Solidity" },
  { question: "How do NFTs work?", level: "beginner", category: "blockchain" },
  { question: "Debugging strategies?", level: "beginner", category: "development" },

  // Intermediate Level (20 Questions)
  { question: "What's a Uniswap hook?", level: "intermediate", category: "DeFi" },
  { question: "How to use 1inch?", level: "intermediate", category: "DeFi" },
  { question: "Show a contract that includes a flash loan", level: "intermediate", category: "DeFi" },
  { question: "Show a smart contract that records carbon credits", level: "intermediate", category: "blockchain" },
  { question: "Show a sybil-resistant voting contract", level: "intermediate", category: "programming" },

  // Expert Level (20 Questions)
  { question: "Account abstraction impact on UX?", level: "expert", category: "blockchain" },
  { question: "MEV protection strategies?", level: "expert", category: "DeFi" },
  { question: "ZK-rollups vs optimistic rollups?", level: "expert", category: "blockchain" },
  { question: "Formal verification tools worth it?", level: "expert", category: "development" },
  { question: "What is the power of tau?", level: "expert", category: "ZK" },
  { question: "Groth16 vs Plonk?", level: "expert", category: "ZK" },
  { question: "Cross-chain messaging protocols?", level: "expert", category: "blockchain" },
  { question: "EIP-4844 blob space economics?", level: "expert", category: "blockchain" },
  { question: "Restaking security assumptions?", level: "expert", category: "blockchain" },
  { question: "AI-assisted smart contract auditing?", level: "expert", category: "development" },
  { question: "Maximal extractable value mitigation?", level: "expert", category: "blockchain" },
  { question: "Explain a witness in a ZK circuit", level: "expert", category: "ZK" },
  { question: "Explain a rate limiting nullifier", level: "expert", category: "blockchain" },
  { question: "Proto-danksharding readiness?", level: "expert", category: "blockchain" },
  { question: "Homomorphic encryption in web3?", level: "expert", category: "blockchain" },
  { question: "Explain the UUPS upgradeable contract", level: "expert", category: "blockchain" },
  { question: "Explain the Diamond Pattern", level: "expert", category: "blockchain" },
  { question: "Explain an underflow in Solidity", level: "expert", category: "blockchain" },
  { question: "What are some tools that can help with security?", level: "expert", category: "blockchain" },
  { question: "Explain the Transparent upgradeable contract", level: "expert", category: "blockchain" },
  { question: "What the difference between an ERC and an EIP?", level: "expert", category: "blockchain" },
  { question: "How to work with EIP 7702?", level: "expert", category: "blockchain" },
  { question: "How to work a EIP 4337 Smart Account", level: "expert", category: "blockchain" },
];

// MCP-based conversation starters (experimental)
const CONVERSATION_STARTERS_MCP: ConversationStarter[] = [
  // Beginner Level - Fundamentals & Quick Actions
  { question: "Create a simple ERC20 token contract and deploy it", level: "beginner", category: "development" },
  { question: "What is the difference between storage, memory, and calldata in Solidity?", level: "beginner", category: "Solidity" },
  { question: "Compile my contract with optimization enabled", level: "beginner", category: "development" },
  { question: "How does delegatecall differ from call?", level: "beginner", category: "Solidity" },
  { question: "Debug my last transaction and show me what went wrong", level: "beginner", category: "development" },
  { question: "What are the best gas saving techniques in Solidity?", level: "beginner", category: "Solidity" },
  { question: "Analyze my contract for security vulnerabilities", level: "beginner", category: "development" },
  { question: "How do NFTs work and can you show me an example?", level: "beginner", category: "blockchain" },
  { question: "Create a voting contract with access control", level: "beginner", category: "development" },
  { question: "What is the purpose of the pragma statement?", level: "beginner", category: "Solidity" },
  { question: "Show me how to interact with a deployed contract", level: "beginner", category: "development" },
  { question: "How are dynamic arrays stored in contract storage?", level: "beginner", category: "Solidity" },
  { question: "Deploy my contract with constructor arguments", level: "beginner", category: "development" },
  { question: "What are events and how do I use them?", level: "beginner", category: "Solidity" },
  { question: "Create a simple multisig wallet contract", level: "beginner", category: "development" },

  // Intermediate Level - Advanced Features & Integration
  { question: "Build a Uniswap V4 hook for custom swap logic", level: "intermediate", category: "DeFi" },
  { question: "Debug transaction 0x... step by step and decode all variables", level: "intermediate", category: "development" },
  { question: "Create a flash loan arbitrage contract with safety checks", level: "intermediate", category: "DeFi" },
  { question: "Set up a Hardhat project and run tests for my contract", level: "intermediate", category: "development" },
  { question: "Deploy to Sepolia testnet with custom gas settings", level: "intermediate", category: "development" },
  { question: "Build a contract that records carbon credits on-chain", level: "intermediate", category: "blockchain" },
  { question: "Create a sybil-resistant voting system with ZK proofs", level: "intermediate", category: "development" },
  { question: "Integrate 1inch aggregator for optimal token swaps", level: "intermediate", category: "DeFi" },
  { question: "Compile with different Solidity versions and compare bytecode", level: "intermediate", category: "development" },
  { question: "Build an upgradeable proxy contract using UUPS pattern", level: "intermediate", category: "development" },
  { question: "Create a gas-optimized batch transfer function", level: "intermediate", category: "development" },
  { question: "Set up Foundry and write fuzz tests for my contract", level: "intermediate", category: "development" },
  { question: "Deploy a contract factory that creates clones", level: "intermediate", category: "development" },
  { question: "Build a Dutch auction contract with anti-sniping", level: "intermediate", category: "DeFi" },
  { question: "Analyze assembly code and optimize hot paths", level: "intermediate", category: "development" },

  // Expert Level - Complex Patterns & Cutting Edge
  { question: "Implement account abstraction with EIP-4337 and custom paymaster", level: "expert", category: "blockchain" },
  { question: "Build MEV-resistant DEX using commit-reveal and time locks", level: "expert", category: "DeFi" },
  { question: "Create a ZK-rollup contract with fraud proof verification", level: "expert", category: "blockchain" },
  { question: "Compare Groth16 vs PLONK for verifying ZK proofs on-chain", level: "expert", category: "ZK" },
  { question: "Deploy with EIP-4844 blob transactions for data availability", level: "expert", category: "blockchain" },
  { question: "Build cross-chain messaging with LayerZero and verify security", level: "expert", category: "blockchain" },
  { question: "Implement EIP-7702 batch execution with delegation", level: "expert", category: "blockchain" },
  { question: "Create a restaking protocol with slashing conditions", level: "expert", category: "blockchain" },
  { question: "Build a Diamond pattern multi-facet proxy with upgrades", level: "expert", category: "development" },
  { question: "Implement homomorphic encryption for private voting", level: "expert", category: "blockchain" },
  { question: "Analyze formal verification using SMT solvers", level: "expert", category: "development" },
  { question: "Create a rate limiting nullifier for anonymous credentials", level: "expert", category: "blockchain" },
  { question: "Debug complex reentrancy attack and show the call trace", level: "expert", category: "development" },
  { question: "Build proto-danksharding data availability sampling", level: "expert", category: "blockchain" },
  { question: "Optimize assembly for arithmetic operations to save 50%+ gas", level: "expert", category: "development" },
  { question: "Create AI-assisted security scanner with custom rules", level: "expert", category: "development" },
  { question: "Build transparent vs UUPS proxy and compare trade-offs", level: "expert", category: "development" },
  { question: "Implement maximal extractable value protection strategies", level: "expert", category: "DeFi" },
  { question: "Create a witness generation circuit for SNARK proof", level: "expert", category: "ZK" },
  { question: "Compare ERC standards vs raw EIP implementations", level: "expert", category: "blockchain" },
];

export const CONVERSATION_STARTERS: ConversationStarter[] = CONVERSATION_STARTERS_MCP;

/**
 * Randomly samples one question from each difficulty level
 * @param useMcpStarters Whether to use MCP-based conversation starters (experimental)
 * @returns An array of 3 conversation starters (beginner, intermediate, expert)
 */
export function sampleConversationStarters(useMcpStarters = false): ConversationStarter[] {
  const starters = useMcpStarters ? CONVERSATION_STARTERS_MCP : CONVERSATION_STARTERS_ORIGINAL;
  const beginnerQuestions = starters.filter(q => q.level === 'beginner');
  const intermediateQuestions = starters.filter(q => q.level === 'intermediate');
  const expertQuestions = starters.filter(q => q.level === 'expert');

  const randomBeginner = beginnerQuestions[Math.floor(Math.random() * beginnerQuestions.length)];
  const randomIntermediate = intermediateQuestions[Math.floor(Math.random() * intermediateQuestions.length)];
  const randomExpert = expertQuestions[Math.floor(Math.random() * expertQuestions.length)];

  return [randomBeginner, randomIntermediate, randomExpert];
}

/**
 * Gets conversation starters with seeded randomization for consistent results in same session
 * @param seed Optional seed for reproducible randomization
 * @param useMcpStarters Whether to use MCP-based conversation starters (experimental)
 * @returns An array of 3 conversation starters (beginner, intermediate, expert)
 */
export function sampleConversationStartersWithSeed(seed?: number, useMcpStarters = false): ConversationStarter[] {
  const seededRandom = (seedValue: number) => {
    const x = Math.sin(seedValue) * 10000;
    return x - Math.floor(x);
  };

  const actualSeed = seed ?? Date.now();
  const starters = useMcpStarters ? CONVERSATION_STARTERS_MCP : CONVERSATION_STARTERS_ORIGINAL;
  const beginnerQuestions = starters.filter(q => q.level === 'beginner');
  const intermediateQuestions = starters.filter(q => q.level === 'intermediate');
  const expertQuestions = starters.filter(q => q.level === 'expert');

  const randomBeginner = beginnerQuestions[Math.floor(seededRandom(actualSeed) * beginnerQuestions.length)];
  const randomIntermediate = intermediateQuestions[Math.floor(seededRandom(actualSeed + 1) * intermediateQuestions.length)];
  const randomExpert = expertQuestions[Math.floor(seededRandom(actualSeed + 2) * expertQuestions.length)];

  return [randomBeginner, randomIntermediate, randomExpert];
}

