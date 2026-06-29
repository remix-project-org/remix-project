/**
 * Slither detector → Cyfrin audit-checklist category mapping
 *
 * Source:
 *   Slither detectors: https://github.com/crytic/slither/wiki/Detector-Documentation
 *   Cyfrin checklist:  https://raw.githubusercontent.com/Cyfrin/audit-checklist/main/checklist.json
 *
 * Each Slither detector maps to one or more checklist category paths.
 * Category paths use the format: "TopLevel > SubCategory"
 * matching the nested structure of checklist.json.
 *
 * Usage:
 *   const categories = getChecklistCategories(slitherFindings);
 *   const filtered   = filterChecklist(checklistJson, categories);
 */

const SLITHER_TO_CHECKLIST = {

  // ─── Reentrancy ────────────────────────────────────────────────────────────
  "reentrancy-eth":            ["Attacker's Mindset > Reentrancy Attack", "External Call"],
  "reentrancy-no-eth":         ["Attacker's Mindset > Reentrancy Attack"],
  "reentrancy-benign":         ["Attacker's Mindset > Reentrancy Attack"],
  "reentrancy-events":         ["Attacker's Mindset > Reentrancy Attack"],
  "reentrancy-unlimited-gas":  ["Attacker's Mindset > Reentrancy Attack"],
  "reentrancy-balance":        ["Attacker's Mindset > Reentrancy Attack"],

  // ─── Access control ────────────────────────────────────────────────────────
  "suicidal":                  ["Basics > Access Control"],
  "unprotected-upgrade":       ["Basics > Access Control", "Basics > Proxy/Upgradable"],
  "tx-origin":                 ["Basics > Access Control"],
  "arbitrary-send-eth":        ["Basics > Access Control", "Basics > Payment"],
  "arbitrary-send-erc20":      ["Basics > Access Control", "Token > Fungible : ERC20"],
  "arbitrary-send-erc20-permit": ["Basics > Access Control", "Token > Fungible : ERC20"],
  "controlled-delegatecall":   ["Basics > Access Control", "Low Level"],
  "controlled-array-length":   ["Basics > Access Control", "Basics > Array / Loop"],
  "missing-zero-check":        ["Basics > Access Control"],
  "shadowing-state":           ["Basics > Access Control", "Heuristics"],
  "shadowing-local":           ["Heuristics"],
  "shadowing-abstract":        ["Basics > Inheritance", "Heuristics"],
  "shadowing-builtin":         ["Heuristics"],
  "uninitialized-state":       ["Basics > Access Control", "Basics > Initialization"],
  "uninitialized-local":       ["Basics > Initialization"],
  "uninitialized-storage":     ["Basics > Access Control", "Basics > Initialization"],
  "uninitialized-fptr-cst":    ["Basics > Initialization", "Basics > Function"],
  "protected-vars":            ["Basics > Access Control"],

  // ─── Math / Arithmetic ─────────────────────────────────────────────────────
  "divide-before-multiply":    ["Basics > Math"],
  "tautology":                 ["Basics > Math", "Heuristics"],
  "tautological-compare":      ["Basics > Math", "Heuristics"],
  "incorrect-equality":        ["Basics > Math"],
  "integer-overflow":          ["Basics > Math"],
  "variable-scope":            ["Basics > Function", "Heuristics"],
  "abiencoderv2-array":        ["Basics > Type", "Basics > Version Issues"],
  "storage-array":             ["Basics > Type", "Basics > Version Issues"],
  "msg-value-loop":            ["Basics > Payment", "Attacker's Mindset > Denial-Of-Service(DOS) Attack", "Basics > Array / Loop"],
  "array-by-reference":        ["Basics > Array / Loop", "Basics > Type"],
  "encode-packed-collision":   ["Hash / Merkle Tree", "Basics > Type"],

  // ─── External calls ────────────────────────────────────────────────────────
  "unchecked-lowlevel":        ["External Call", "Low Level"],
  "unchecked-send":            ["External Call", "Basics > Payment"],
  "unchecked-transfer":        ["External Call", "Token > Fungible : ERC20"],
  "low-level-calls":           ["External Call", "Low Level"],
  "unused-return":             ["External Call", "Heuristics"],

  // ─── Denial of service ─────────────────────────────────────────────────────
  "calls-loop":                ["Attacker's Mindset > Denial-Of-Service(DOS) Attack", "Basics > Array / Loop", "External Call"],
  "delegatecall-loop":         ["Attacker's Mindset > Denial-Of-Service(DOS) Attack", "Low Level"],
  "locked-ether":              ["Attacker's Mindset > Denial-Of-Service(DOS) Attack", "Basics > Payment"],
  "return-bomb":               ["Attacker's Mindset > Denial-Of-Service(DOS) Attack", "External Call"],
  "costly-loop":               ["Attacker's Mindset > Denial-Of-Service(DOS) Attack", "Basics > Array / Loop"],

  // ─── Miner / timestamp manipulation ───────────────────────────────────────
  "weak-prng":                 ["Attacker's Mindset > Miner Attack"],
  "timestamp":                 ["Attacker's Mindset > Miner Attack"],
  "incorrect-exp":             ["Basics > Math", "Heuristics"],

  // ─── Front-running ─────────────────────────────────────────────────────────
  "race-condition":            ["Attacker's Mindset > Front-running Attack"],

  // ─── Price manipulation ────────────────────────────────────────────────────
  "price-manipulation":        ["Attacker's Mindset > Price Manipulation Attack", "Defi > Oracle"],

  // ─── Events ────────────────────────────────────────────────────────────────
  "events-maths":              ["Basics > Event"],
  "events-access":             ["Basics > Event", "Basics > Access Control"],
  "missing-events-arithmetic": ["Basics > Event"],
  "missing-events-access":     ["Basics > Event", "Basics > Access Control"],
  "erc20-indexed":             ["Basics > Event", "Token > Fungible : ERC20"],
  "unindexed-event-address":   ["Basics > Event"],

  // ─── Array / loop ──────────────────────────────────────────────────────────
  "incorrect-shift":           ["Basics > Array / Loop", "Low Level"],
  "write-after-write":         ["Basics > Array / Loop", "Heuristics"],
  "cache-array-length":        ["Basics > Array / Loop", "Heuristics"],

  // ─── Function / Contract design ───────────────────────────────────────────
  "incorrect-modifier":        ["Basics > Function"],
  "dead-code":                 ["Heuristics"],
  "boolean-cst":               ["Heuristics"],
  "redundant-statements":      ["Heuristics"],
  "constable-states":          ["Heuristics"],
  "immutable-states":          ["Heuristics"],
  "external-function":         ["Basics > Function", "Heuristics"],
  "var-read-using-this":       ["Heuristics"],
  "similar-names":             ["Heuristics"],
  "too-many-digits":           ["Heuristics"],
  "cyclomatic-complexity":     ["Heuristics"],
  "multiple-constructors":     ["Basics > Function", "Basics > Version Issues"],
  "name-reused":               ["Heuristics"],
  "void-cst":                  ["Basics > Function"],
  "reused-constructor":        ["Basics > Inheritance"],
  "boolean-equal":             ["Heuristics"],
  "incorrect-unary":           ["Heuristics"],
  "assembly":                  ["Low Level"],
  "assert-state-change":       ["Basics > Function"],
  "deprecated-standards":      ["Basics > Version Issues"],
  "function-init-state":       ["Basics > Function", "Basics > Initialization"],
  "incorrect-using-for":       ["Basics > Function"],
  "missing-inheritance":       ["Basics > Inheritance"],
  "naming-convention":         ["Heuristics"],
  "pragma":                    ["Basics > Version Issues"],
  "solc-version":              ["Basics > Version Issues"],
  "unimplemented-functions":   ["Basics > Function", "Basics > Inheritance"],
  "unused-state":              ["Heuristics"],

  // ─── Interface / Standards ─────────────────────────────────────────────────
  "erc20-interface":           ["Token > Fungible : ERC20"],
  "erc721-interface":          ["Token > Non-fungible : ERC721/1155"],
  "domain-separator-collision": ["Token > Fungible : ERC20", "Signature"],
  "enum-conversion":           ["Basics > Type", "Basics > Version Issues"],

  // ─── Assembly / Low-level ──────────────────────────────────────────────────
  "return-leave":              ["Low Level"],
  "incorrect-return":          ["Low Level"],
  "constant-function-asm":     ["Low Level", "Basics > Function", "Basics > Version Issues"],
  "constant-function-state":   ["Basics > Function", "Basics > Version Issues"],

  // ─── Data structures ───────────────────────────────────────────────────────
  "mapping-deletion":          ["Basics > Map"],
  "public-mappings-nested":    ["Basics > Map", "Basics > Version Issues"],

  // ─── Security / Encoding ───────────────────────────────────────────────────
  "rtlo":                      ["Heuristics"],

  // ─── Oracle / External Data ────────────────────────────────────────────────
  "pyth-deprecated-functions":    ["Defi > Oracle", "Integrations > Chainlink"],
  "pyth-unchecked-confidence":    ["Defi > Oracle"],
  "pyth-unchecked-publishtime":   ["Defi > Oracle"],
  "chronicle-unchecked-price":    ["Defi > Oracle"],
  "chainlink-feed-registry":      ["Defi > Oracle", "Integrations > Chainlink"],

  // ─── Platform-specific ─────────────────────────────────────────────────────
  "optimism-deprecation":         ["Basics > Version Issues", "Multi-chain/Cross-chain"],
  "out-of-order-retryable":       ["Multi-chain/Cross-chain"],
  "gelato-unprotected-randomness": ["Basics > Access Control"],

};

export interface SlitherFinding {
  check: string;
  impact: string;
  confidence: string;
}

/**
 * Given a list of Slither findings, returns the unique set of checklist category paths
 * that should be loaded from checklist.json.
 */
export function getChecklistCategories(findings: SlitherFinding[]): Set<string> {
  const categories = new Set<string>();
  for (const finding of findings) {
    const mapped = SLITHER_TO_CHECKLIST[finding.check as keyof typeof SLITHER_TO_CHECKLIST];
    if (mapped) {
      mapped.forEach((c: string) => categories.add(c));
    }
  }
  return categories;
}

export interface Category {
  category: string;
  data: Category[] | ChecklistItem[];
  description: string;
}

export interface ChecklistItem {
  id: string;
  question: string;
  description: string;
  remediation: string;
  references: any[];
  categoryPath: string;
}

/**
 * Filters the full checklist.json down to only the entries relevant
 * to the triggered categories.
 */
export function filterChecklist(checklistJson: any[], categories: Set<string>): Category[] {
  const results: Category[] = [];

  for (const topLevel of checklistJson) {
    if (categories.has(topLevel.category)) {
      results.push(topLevel);
    }
    for (const subCategory of topLevel.data) {
      const path = `${topLevel.category} > ${subCategory.category}`;
      if (!categories.has(path)) continue;
      results.push(subCategory)
    }
  }
  return results;
}

// ─── Example usage ────────────────────────────────────────────────────────────
//
// 1. Run Slither with JSON output:
//    slither contract.sol --json slither-output.json
//
// 2. Parse findings:
//    const slitherOutput = JSON.parse(fs.readFileSync("slither-output.json"));
//    const findings = slitherOutput.results.detectors;
//
// 3. Fetch checklist:
//    const res = await fetch("https://raw.githubusercontent.com/Cyfrin/audit-checklist/main/checklist.json");
//    const checklistJson = await res.json();
//
// 4. Filter and build prompt context:
//    const categories  = getChecklistCategories(findings);
//    const items       = filterChecklist(checklistJson, categories);