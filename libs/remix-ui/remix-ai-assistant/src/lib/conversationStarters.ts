export interface ConversationStarter {
  question: string;
  level: 'beginner' | 'intermediate' | 'expert';
  category: string;
}

export const CONVERSATION_STARTERS: ConversationStarter[] = [
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
  { question: "What’s a Uniswap hook?", level: "intermediate", category: "DeFi" },
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

/**
 * Randomly samples one question from each difficulty level
 * @returns An array of 3 conversation starters (beginner, intermediate, expert)
 */
export function sampleConversationStarters(): ConversationStarter[] {
  const beginnerQuestions = CONVERSATION_STARTERS.filter(q => q.level === 'beginner');
  const intermediateQuestions = CONVERSATION_STARTERS.filter(q => q.level === 'intermediate');
  const expertQuestions = CONVERSATION_STARTERS.filter(q => q.level === 'expert');

  const randomBeginner = beginnerQuestions[Math.floor(Math.random() * beginnerQuestions.length)];
  const randomIntermediate = intermediateQuestions[Math.floor(Math.random() * intermediateQuestions.length)];
  const randomExpert = expertQuestions[Math.floor(Math.random() * expertQuestions.length)];

  return [randomBeginner, randomIntermediate, randomExpert];
}

/**
 * Gets conversation starters with seeded randomization for consistent results in same session
 * @param seed Optional seed for reproducible randomization
 * @returns An array of 3 conversation starters (beginner, intermediate, expert)
 */
export function sampleConversationStartersWithSeed(seed?: number): ConversationStarter[] {
  const seededRandom = (seedValue: number) => {
    const x = Math.sin(seedValue) * 10000;
    return x - Math.floor(x);
  };

  const actualSeed = seed ?? Date.now();
  const beginnerQuestions = CONVERSATION_STARTERS.filter(q => q.level === 'beginner');
  const intermediateQuestions = CONVERSATION_STARTERS.filter(q => q.level === 'intermediate');
  const expertQuestions = CONVERSATION_STARTERS.filter(q => q.level === 'expert');

  const randomBeginner = beginnerQuestions[Math.floor(seededRandom(actualSeed) * beginnerQuestions.length)];
  const randomIntermediate = intermediateQuestions[Math.floor(seededRandom(actualSeed + 1) * intermediateQuestions.length)];
  const randomExpert = expertQuestions[Math.floor(seededRandom(actualSeed + 2) * expertQuestions.length)];

  return [randomBeginner, randomIntermediate, randomExpert];
}

