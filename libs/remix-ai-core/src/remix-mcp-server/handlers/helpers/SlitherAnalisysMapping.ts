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
  "reentrancy-eth":            ["Attacker's Mindset > Reentrancy Attack", "Basics > External Call"],
  "reentrancy-no-eth":         ["Attacker's Mindset > Reentrancy Attack"],
  "reentrancy-benign":         ["Attacker's Mindset > Reentrancy Attack"],
  "reentrancy-events":         ["Attacker's Mindset > Reentrancy Attack"],
  "reentrancy-unlimited-gas":  ["Attacker's Mindset > Reentrancy Attack"],

  // ─── Access control ────────────────────────────────────────────────────────
  "suicidal":                  ["Basics > Access Control"],
  "unprotected-upgrade":       ["Basics > Access Control"],
  "tx-origin":                 ["Basics > Access Control"],
  "arbitrary-send-eth":        ["Basics > Access Control"],
  "arbitrary-send-erc20":      ["Basics > Access Control"],
  "arbitrary-send-erc20-permit": ["Basics > Access Control"],
  "controlled-delegatecall":   ["Basics > Access Control"],
  "missing-zero-check":        ["Basics > Access Control"],
  "shadowing-state":           ["Basics > Access Control"],
  "shadowing-local":           ["Basics > Access Control"],
  "uninitialized-state":       ["Basics > Access Control"],
  "uninitialized-local":       ["Basics > Access Control"],
  "uninitialized-storage":     ["Basics > Access Control"],
  "protected-vars":            ["Basics > Access Control"],

  // ─── Arithmetic ────────────────────────────────────────────────────────────
  "divide-before-multiply":    ["Basics > Arithmetic"],
  "tautology":                 ["Basics > Arithmetic"],
  "incorrect-equality":        ["Basics > Arithmetic"],
  "integer-overflow":          ["Basics > Arithmetic"],
  "variable-scope":            ["Basics > Arithmetic"],
  "abiencoderv2-array":        ["Basics > Arithmetic"],
  "storage-array":             ["Basics > Arithmetic"],
  "msg-value-loop":            ["Basics > Arithmetic", "Attacker's Mindset > Denial-Of-Service(DOS) Attack"],

  // ─── External calls ────────────────────────────────────────────────────────
  "unchecked-lowlevel":        ["Basics > External Call"],
  "unchecked-send":            ["Basics > External Call"],
  "unchecked-transfer":        ["Basics > External Call"],
  "low-level-calls":           ["Basics > External Call"],

  // ─── Denial of service ─────────────────────────────────────────────────────
  "calls-loop":                ["Attacker's Mindset > Denial-Of-Service(DOS) Attack", "Basics > Array / Loop"],
  "delegatecall-loop":         ["Attacker's Mindset > Denial-Of-Service(DOS) Attack"],
  "locked-ether":              ["Attacker's Mindset > Denial-Of-Service(DOS) Attack"],
  "block-other-senders":       ["Attacker's Mindset > Denial-Of-Service(DOS) Attack"],

  // ─── Miner / timestamp manipulation ───────────────────────────────────────
  "weak-prng":                 ["Attacker's Mindset > Miner Attack"],
  "timestamp":                 ["Attacker's Mindset > Miner Attack"],
  "incorrect-exp":             ["Attacker's Mindset > Miner Attack"],

  // ─── Front-running ─────────────────────────────────────────────────────────
  "race-condition":            ["Attacker's Mindset > Front-running Attack"],

  // ─── Price manipulation ────────────────────────────────────────────────────
  "price-manipulation":        ["Attacker's Mindset > Price Manipulation Attack"],

  // ─── Events ────────────────────────────────────────────────────────────────
  "events-maths":              ["Basics > Event"],
  "events-access":             ["Basics > Event", "Basics > Access Control"],
  "missing-events-arithmetic": ["Basics > Event"],
  "missing-events-access":     ["Basics > Event", "Basics > Access Control"],

  // ─── Array / loop ──────────────────────────────────────────────────────────
  "incorrect-shift":           ["Basics > Array / Loop"],
  "write-after-write":         ["Basics > Array / Loop"],

  // ─── Contract design ───────────────────────────────────────────────────────
  "incorrect-modifier":        ["Basics > Code Quality"],
  "dead-code":                 ["Basics > Code Quality"],
  "unused-return":             ["Basics > External Call"],
  "boolean-cst":               ["Basics > Code Quality"],
  "redundant-statements":      ["Basics > Code Quality"],
  "constable-states":          ["Basics > Code Quality"],
  "immutable-states":          ["Basics > Code Quality"],
  "similar-names":             ["Basics > Code Quality"],
  "too-many-digits":           ["Basics > Code Quality"],
  "cyclomatic-complexity":     ["Basics > Code Quality"],

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
export function filterChecklist(checklistJson: any[], categories: Set<string>): ChecklistItem[] {
  const results: ChecklistItem[] = [];

  for (const topLevel of checklistJson) {
    for (const subCategory of topLevel.data) {
      const path = `${topLevel.category} > ${subCategory.category}`;
      if (!categories.has(path)) continue;

      for (const item of subCategory.data) {
        results.push({
          id:           item.id,
          question:     item.question,
          description:  item.description,
          remediation:  item.remediation,
          references:   item.references,
          categoryPath: path,
        });
      }
    }
  }

  return results;
}


/**
 * Serialises the filtered checklist items into a compact string
 * suitable for injection into an LLM system prompt.
 * Keeps token usage low — omits references, trims whitespace.
 */
export function toPromptSnippet(items: ChecklistItem[]): string {
  return items.map(item =>
    `[${item.id}] ${item.question}\n` +
    `Description: ${item.description}\n` +
    `Remediation: ${item.remediation}`
  ).join("\n\n");
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
//    const promptChunk = toPromptSnippet(items);
//
// 5. Call LLM with:
//    system: `You are a smart contract auditor. Known vulnerabilities relevant to this contract:\n\n${promptChunk}`
//    user:   `<slither output>\n\n<contract source>`
