/**
 * Modular Prompt Blocks for DApp Generation
 *
 * Architecture: 5-layer priority system
 *   Layer 0 — INVARIANTS: Build-critical rules (never overridden)
 *   Layer 1 — BLOCKCHAIN CORE: ethers.js, wallet, contract integration
 *   Layer 2 — PLATFORM: Conditional extensions (Base Mini App, Figma)
 *   Layer 3 — VISUAL SOURCE: Design input (text / image / figma)
 *   Layer 4 — USER INTENT: User prompt + dynamic content + architecture
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface PromptContext {
  contract: {
    address: string
    abi: any[]
    chainId: number | string
    name?: string
  }
  isBaseMiniApp?: boolean
  isUpdate?: boolean
  hasFigma?: boolean
  hasImage?: boolean
  isLocalVM?: boolean
}

interface ContractInfo {
  address: string
  abi: any[]
  chainId: number | string
  name?: string
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Safe hex conversion for chainId — returns '0x...' or 'N/A' for Remix VM / non-numeric IDs */
const safeChainHex = (chainId: number | string): string => {
  const n = Number(chainId)
  return Number.isNaN(n) || n === 0 ? 'N/A (Local VM)' : `0x${n.toString(16)}`
}

/** Check if chainId represents a local VM environment */
const isLocalVMChainId = (chainId: number | string): boolean => {
  const n = Number(chainId)
  return Number.isNaN(n) || n === 0 || n === 1337 || n === 31337 || n === 5777
}

// ──────────────────────────────────────────────
// Layer 0: INVARIANTS
// ──────────────────────────────────────────────

export const invariants = {

  /** File delimiter format used to separate generated files */
  fileFormat: (): string => `
**CRITICAL FILE FORMATTING:**
1. Use \`<<<<<<< START_TITLE filename >>>>>>> END_TITLE\` strictly as the **HEADER** to mark the start of a file.
2. **DO NOT** place \`END_TITLE\` or any closing tag at the end of the file content.
3. To start a new file, just write the next Header immediately.
`,

  /** Minimum required files and extension rules */
  minimumFiles: (): string => `
**FILE STRUCTURE RULES:**
1. **Minimum Required Files (MUST return):**
   - \`index.html\` — HTML root with import map and Tailwind CDN
   - \`src/main.jsx\` — React entry point using \`ReactDOM.createRoot\`
   - \`src/App.jsx\` — Main React component with DApp logic
2. **Recommended:** \`src/index.css\` — for custom Tailwind or global styles.
3. **Extend Freely:** If the UI is complex, split into \`src/components/*.jsx\` or \`src/pages/*.jsx\`.
   - Rule of thumb: if a component exceeds ~100 lines, extract it into its own file.
4. **EXPLICIT EXTENSIONS:** Always include file extensions in local imports.
   - BAD: \`import Navbar from './components/Navbar'\`
   - GOOD: \`import Navbar from './components/Navbar.jsx'\`
`,

  /** index.html template with import map */
  indexHtmlTemplate: (ctx: PromptContext): string => {
    const baseMiniAppImport = ctx.isBaseMiniApp
      ? `,\n              "@farcaster/miniapp-sdk": "https://esm.sh/@farcaster/miniapp-sdk@0.0.14"`
      : ''

    const baseMiniAppMeta = ctx.isBaseMiniApp
      ? `\n    <meta property="fc:frame" content="vNext" />\n    <meta name="fc:miniapp" content='{"version":"next","imageUrl":"https://github.com/remix-project-org.png","button":{"title":"Launch","action":{"type":"launch_miniapp","name":"App","url":"https://google.com"}}}' />`
      : ''

    return `
**INDEX.HTML TEMPLATE (COPY THIS STRUCTURE):**
\`\`\`html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />${baseMiniAppMeta}
    <script>
      window.__QUICK_DAPP_CONFIG__ = window.__QUICK_DAPP_CONFIG__ || {
        logo: "", title: "", details: ""
      };
    </script>
    <title>DApp</title>
    <script>
      document.title = window.__QUICK_DAPP_CONFIG__?.title || 'My DApp';
    </script>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="./src/index.css">
    <script type="importmap">
    {
      "imports": {
        "react": "https://esm.sh/react@18.2.0",
        "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
        "ethers": "https://esm.sh/ethers@6.11.1"${baseMiniAppImport}
      }
    }
    </script>
    <script>
      if (typeof window !== 'undefined' && window.ethereum && window.ethereum.isRemix) {
        window.ethereum = window.ethereum;
      }
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.jsx"></script>
  </body>
</html>
\`\`\`
`
  },

  /** Code safety and formatting rules */
  safety: (): string => `
**CODE SAFETY RULES:**
1. Avoid extremely long lines of code. Break long Tailwind class strings across multiple lines if needed.
2. When generating HTML/JSX, break attributes onto new lines if the tag becomes too long.
3. **ALWAYS import React from 'react'** in any file using JSX (especially \`src/main.jsx\` and \`src/App.jsx\`).
   - Example: \`import React from 'react';\` must be at the top, even if you use \`createRoot\`.
4. **ETHERS.JS PROVIDER RULES (CRITICAL):**
   - **MUST USE:** Always use \`new ethers.BrowserProvider(window.ethereum)\` for both reading and writing.
   - **FORBIDDEN:** NEVER use \`new ethers.JsonRpcProvider\`, \`InfuraProvider\`, or \`AlchemyProvider\`.
   - **FORBIDDEN:** NEVER generate code containing placeholders like 'YOUR_INFURA_KEY' or ask for API keys.
4. Use React with JSX syntax (not "text/babel" scripts).
5. Use ethers.js (v6) for all blockchain interactions.
`,

  /** Image placeholder URL rules */
  imageGeneration: (): string =>
    `If you want to use image placeholder, http://Static.photos Usage: Format: http://static.photos/[category]/[dimensions]/[seed] where dimensions must be one of: 200x200, 320x240, 640x360, 1024x576, or 1200x630; seed can be any number (1-999+) for consistent images or omit for random; categories include: nature, office, people, technology, minimal, abstract, aerial, blurred, bokeh, gradient, monochrome, vintage, white, black, blue, red, green, yellow, cityscape, workspace, food, travel, textures, industry, indoor, outdoor, studio, finance, medical, season, holiday, event, sport, science, legal, estate, restaurant, retail, wellness, agriculture, construction, craft, cosmetic, automotive, gaming, or education. Examples: http://static.photos/red/320x240/133, http://static.photos/640x360, http://static.photos/nature/1200x630/42.`,

  /** Token-saving instructions to reduce truncation risk */
  truncationPrevention: (): string => `
**OUTPUT OPTIMIZATION:**
1. Keep comments minimal — the code itself should be self-explanatory.
2. Extract repeated code patterns into helper functions.
3. If a component is getting very long, split it into a separate file.
4. Complete EVERY file fully before ending. Do not leave any file half-written.
5. Do NOT provide explanations or markdown outside of the file blocks — only code.
`,
}

// ──────────────────────────────────────────────
// Layer 1: BLOCKCHAIN CORE
// ──────────────────────────────────────────────

export const blockchain = {

  /** Smart contract integration mandate */
  contract: (info: ContractInfo): string => {
    const functionNames = info.abi
      .filter((item: any) => item.type === 'function')
      .map((item: any) => `- ${item.name} (${item.stateMutability})`)
      .join('\n')

    return `
**🚨 MANDATORY SMART CONTRACT INTEGRATION 🚨**

You MUST integrate the provided Smart Contract into the UI.
A DApp with only UI and no logic is a FAILURE.

**Contract Details:**
- **Address:** \`${info.address}\`
- **Chain ID:** ${info.chainId} (Decimal), ${safeChainHex(info.chainId)} (Hex)
- **ABI Functions to Implement:**
${functionNames}

**Integration Rules:**
1. **Read Functions (view/pure):** Display data from these functions on the screen automatically.
2. **Write Functions (payable/nonpayable):** Create Forms/Buttons to trigger them.
3. **Feedback:** Show loading states and success/error toasts for transactions.
4. **Full ABI:** ${JSON.stringify(info.abi)}
`
  },

  /** Wallet connection and network switching patterns */
  wallet: (isLocalVM: boolean = false): string => {
    if (isLocalVM) {
      return `
**WALLET CONNECTION RULES:**
1. **Connect Wallet** button must be visible when disconnected.
2. Check \`window.ethereum\` existence before any wallet operations.
3. Show "Wrong Network" warning if chain ID mismatches.
4. Use loading spinners for async actions.
5. Handle "User rejected request" errors gracefully.

**Network Switch Pattern (mandatory):**
\`\`\`javascript
const switchNetwork = async (targetChainHex) => {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetChainHex }],
    });
  } catch (switchError) {
    if (switchError.code === 4902) {
      // Chain not added — prompt to add it
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [...] });
    } else {
      throw switchError;
    }
  }
};
\`\`\`
`
    }

    // Real network: full wallet selection rules with disconnect/switch/localStorage
    return `
**WALLET CONNECTION RULES:**
1. **Connect Wallet** button must be visible in the header/navbar when disconnected.
2. **Disconnect Wallet** button must be visible in the header/navbar when connected (next to the account address).
3. **Switch Network** button must appear **only when** the connected wallet's chain ID differs from the DApp's target chain ID. Hide it when on the correct network.
4. Check \`window.ethereum\` existence before any wallet operations.
5. Show "Wrong Network" warning with a **Switch Network** button if chain ID mismatches.
6. Use loading spinners for async actions.
7. Handle "User rejected request" errors gracefully.
8. Show truncated wallet address (e.g. \`0x1234...5678\`) when connected.

**🚨 CHAIN ID COMPARISON (CRITICAL — prevents wrong-network false positive):**
- ethers.js v6 returns \`network.chainId\` as a **BigInt** (e.g. \`11155111n\`).
- **NEVER compare hex strings directly** (e.g. \`"0xaa36a7" !== "aa36a7"\` — prefix mismatch!).
- **ALWAYS compare as decimal numbers:**
\`\`\`javascript
const TARGET_CHAIN_ID = 11155111; // Sepolia — use DECIMAL number
// After connecting:
const network = await provider.getNetwork();
const currentChainId = Number(network.chainId);
setChainId(currentChainId);
// Wrong network check:
const isWrongNetwork = account && chainId !== null && chainId !== TARGET_CHAIN_ID;
\`\`\`
- For \`wallet_switchEthereumChain\`, convert to hex: \`'0x' + TARGET_CHAIN_ID.toString(16)\`

**Disconnect Pattern (mandatory — MUST implement this):**
\`\`\`javascript
const disconnectWallet = () => {
  setAccount(null);
  setProvider(null);
  setSigner(null);
  // Clear saved wallet preference for wallet selection
  try { localStorage.removeItem('__qdapp_wallet_rdns'); } catch(e) {}
};
\`\`\`
The Disconnect button should be placed in the navbar/header, visible when connected.
When disconnected, the DApp should return to the initial "Connect Wallet" state.

**Network Switch Pattern (mandatory — MUST be a visible button):**
\`\`\`javascript
const switchNetwork = async (targetChainHex) => {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: targetChainHex }],
    });
  } catch (switchError) {
    if (switchError.code === 4902) {
      // Chain not added — prompt to add it
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [...] });
    } else {
      throw switchError;
    }
  }
};
\`\`\`
Show a **"Switch to [Network Name]"** button when the user is on the wrong chain.
`
  },

  /** Ethers.js v6 specific rules */
  ethersRules: (): string => `
**ETHERS.JS v6 RULES (CRITICAL):**
- **Read-Only:** For 'view'/'pure' functions, use \`new ethers.Contract(addr, abi, provider)\`.
- **Write (Transaction):** For 'nonpayable'/'payable' functions, YOU MUST USE A SIGNER:
  \`\`\`javascript
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const contractWithSigner = new ethers.Contract(address, abi, signer);
  const tx = await contractWithSigner.functionName(args);
  await tx.wait();
  \`\`\`
- **NEVER** try to send a transaction with a Provider-only contract instance.
- Use \`import { ethers } from "ethers";\` — always ES import, never \`window.ethers\`.
`,

  /** Network context — handles Remix VM local environment */
  networkContext: (chainId: number | string, isLocalVM: boolean): string => {
    // Auto-detect: if chainId is non-numeric, it's definitely local VM
    const effectiveIsLocal = isLocalVM || isLocalVMChainId(chainId)

    if (!effectiveIsLocal) {
      return `**Target Network:** Chain ID ${chainId} (${safeChainHex(chainId)})`
    }

    return `
**⚠️ LOCAL DEVELOPMENT MODE (Remix VM)**
This DApp targets a **Remix VM (local)** environment.
The Remix IDE preview automatically provides \`window.ethereum\` connected to the VM — treat it like a normal Ethereum provider.

**CRITICAL RULES FOR REMIX VM:**
1. **Use \`window.ethereum\` normally** — just do \`new ethers.BrowserProvider(window.ethereum)\` and get a signer.
2. **DO NOT call \`wallet_switchEthereumChain\` or \`wallet_addEthereumChain\`.** Not needed.
3. **DO NOT show "Wrong Network" warnings or chain ID checks.** The provider is already on the correct network.
4. **DO NOT show "Install MetaMask" messages.** The provider is always available.
5. Put the contract address as a constant at the top with a local dev comment:
   \`\`\`javascript
   // ⚠️ LOCAL DEV MODE — Remix VM
   // To use on a real network: deploy your contract there and update this address.
   const CONTRACT_ADDRESS = "${typeof chainId === 'string' ? chainId : '0x...'}";
   \`\`\`
6. For the connect/init logic, simply do:
   \`\`\`javascript
   const provider = new ethers.BrowserProvider(window.ethereum);
   const accounts = await provider.send("eth_requestAccounts", []);
   const signer = await provider.getSigner();
   const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
   \`\`\`
7. **Validate uint256 inputs** — before sending a contract call, ensure any \`uint256\` parameter is a **non-negative integer**:
   \`\`\`javascript
   if (!value || isNaN(value) || Number(value) < 0 || !Number.isInteger(Number(value))) {
     // show error: "Please enter a valid non-negative integer"
     return;
   }
   \`\`\`
`
  },
}

// ──────────────────────────────────────────────
// Layer 2: PLATFORM
// ──────────────────────────────────────────────

export const platform = {

  /** Base Mini App (Farcaster) requirements */
  baseMiniApp: (): string => `
**BASE MINI APP REQUIREMENTS (MANDATORY):**
1. **Farcaster SDK:** Import \`sdk\` from \`@farcaster/miniapp-sdk\`.
2. **Initialization:** Call \`sdk.actions.ready()\` inside a \`useEffect\` in \`src/App.jsx\`:
   \`\`\`javascript
   import { sdk } from '@farcaster/miniapp-sdk';
   useEffect(() => { sdk.actions.ready(); }, []);
   \`\`\`
3. **Meta Tags:** The \`fc:frame\` and \`fc:miniapp\` meta tags MUST be in \`index.html\` (already included in the template above).
4. **Base Network:** Default to Base Mainnet (8453) or Base Sepolia (84532) based on contract chain ID.
`,

  /** Figma-to-React transformation rules */
  figmaTransform: (): string => `
**FIGMA DESIGN TRANSFORMATION RULES:**
1. **Containerization:** Use \`max-w-7xl mx-auto px-4\` instead of fixed widths (e.g., 1440px).
2. **Mobile First:** Use \`flex-wrap\` and \`grid-cols-1 md:grid-cols-3\` so elements stack on mobile.
3. **No Absolute:** Avoid \`position: absolute\` unless strictly necessary.
4. **Interactive:** Make buttons and inputs responsive (hover states, cursor pointers).
5. **Componentize:** If the design has distinct sections (Navbar, Sidebar, Feed), create separate component files.
6. **Adapt, don't just copy:** Fixed Figma dimensions must become fluid/responsive in code.
`,
}

// ──────────────────────────────────────────────
// Layer 3: VISUAL SOURCE
// ──────────────────────────────────────────────

export const visualSource = {

  /** Text-only: AI has design freedom */
  textOnly: (description: string): string => `
You are generating a new DApp.

**CRITICAL INSTRUCTION — USER PRIORITY:**
The user has provided specific design or functional requirements below.
You MUST prioritize the user's request (theme, language, features) over
any default templates or examples provided in the system prompt.

>>> USER REQUEST START >>>
"${description}"
<<< USER REQUEST END <<<

If the user asked for a specific language (e.g. Korean), use it for all UI text.
If the user asked for a specific theme (e.g. Dark), implement it using Tailwind classes.
`,

  /** Vision: Image is the Single Source of Truth for design */
  vision: (description: string, contractInfo: ContractInfo): string => {
    const functionNames = contractInfo.abi
      .filter((item: any) => item.type === 'function')
      .map((item: any) => `- ${item.name} (${item.stateMutability})`)
      .join('\n')

    return `
# VISION-DRIVEN DAPP GENERATION: PIXEL-PERFECT CLONE MODE

The user provided an **IMAGE**. This image is the **SINGLE SOURCE OF TRUTH** for the visual style.

**VISUAL INSTRUCTIONS (PRIORITY #1 — THE "LOOK"):**
1. **IGNORE DEFAULT TEMPLATES.** If the image looks unique, your code must look unique.
2. **EXACT COLORS:** Extract HEX CODES from the image. Use Tailwind arbitrary values (e.g., \`bg-[#1a2b3c]\`, \`text-[#f0f0f0]\`).
3. **LAYOUT & SPACING:** Observe exact padding, border-radius, shadows. Replicate the "density" of the UI.
4. **FONTS & VIBE:** Match font weight (Bold/Light) and style (Modern/Retro) exactly.
5. **REPLICATE, DON'T JUST MAP:** Make buttons *look* exactly like image buttons, not just placed in the same spots.

**MERGING VISUALS WITH LOGIC:**
- **LOGIC (Layer 0-1 rules) CANNOT BE BROKEN.** Implement all contract/wallet logic.
- **VISUALS follow the image.** Analyze the vibe: dark & futuristic? Playful? Minimalist?
- If the image has no wallet button, place one in the Navbar or a natural spot.

**CONTRACT TO INTEGRATE:**
- Address: \`${contractInfo.address}\`
- Chain ID: ${contractInfo.chainId}
- ABI Functions:
${functionNames}

**USER INSTRUCTIONS:**
"${description}"

**REMINDER:** The Image is for *CSS/Layout*. The System Prompt is for *Code Structure/Logic*. DO NOT FAIL THE LOGIC.
`
  },

  /** Figma JSON data as design source */
  figmaData: (figmaJson: string, description: string): string => `
# FIGMA DESIGN DATA
${figmaJson.substring(0, 150000)}

# USER INSTRUCTIONS
${description || "Implement the design exactly as shown in the JSON."}
`,
}

// ──────────────────────────────────────────────
// Layer 4: USER INTENT
// ──────────────────────────────────────────────

export const userIntent = {

  /** Dynamic content rules — __QUICK_DAPP_CONFIG__ */
  dynamicContent: (): string => `
**🚨 DYNAMIC CONTENT RULES (CRITICAL) 🚨**
The DApp shell passes configuration via \`window.__QUICK_DAPP_CONFIG__\`.

1. **NO HARDCODED TEXT/LOGOS:**
   - Even if the user asks for "Binance Style", **DO NOT** write "Binance" as a title.
   - **DO NOT** hardcode \`<img>\` tags with random URLs unless they are backgrounds/icons.

2. **USE CONFIG VARIABLES in App.jsx:**
   \`\`\`javascript
   const config = window.__QUICK_DAPP_CONFIG__ || {};
   \`\`\`
   - **Title:** \`{config.title}\` in Navbar/Hero header.
   - **Logo:** \`{config.logo && <img src={config.logo} ... />}\` — render only if exists.
   - **Description:** \`{config.details}\` in sub-header or about section.

3. **FALLBACK:** If \`config.title\` is missing, fall back to "My DApp".

4. **Design Requirement:** Place logo/title/details intelligently in the UI layout (e.g., Navbar + Hero), do not dump them at the top.
`,

  /** Architecture: routing, component structure */
  architecture: (): string => `
**ARCHITECTURE INSTRUCTIONS:**

1. **Routing (ZERO DEPENDENCY MODE):**
   - **DO NOT use \`react-router-dom\`.** It causes version conflicts.
   - **Implement a simple Hash Router** in \`src/App.jsx\`:
     \`\`\`javascript
     const [route, setRoute] = useState(window.location.hash || '#/');
     useEffect(() => {
       const onHashChange = () => setRoute(window.location.hash || '#/');
       window.addEventListener('hashchange', onHashChange);
       return () => window.removeEventListener('hashchange', onHashChange);
     }, []);
     const navigate = (path) => window.location.hash = path;
     \`\`\`

2. **STYLING:** Use Tailwind utility classes directly in JSX.
   - Do NOT create custom CSS classes like "card", "btn", "navbar".
   - Use Tailwind classes: \`className="bg-white p-4 rounded shadow"\`.
`,
}

// ──────────────────────────────────────────────
// Update-specific blocks
// ──────────────────────────────────────────────

export const updateRules = {

  /** Text-only update: user request + current files */
  textUpdate: (description: string | any[], currentFiles: string): string => {
    const descText = Array.isArray(description)
      ? description.map((p: any) => p.text || '').join('\n')
      : description

    return `
IMPORTANT: The user has provided a modification request.
Prioritize the user's request over the existing file contents below.

**User's request:**
${descText}

---
**Current Project Code:**
${currentFiles}

**RULES:**
1. Return ALL project files (index.html, src/App.jsx, etc.) using START_TITLE format.
2. Do NOT provide explanations — only code blocks.
3. You are allowed to create NEW files if the request requires new features.
4. If \`App.jsx\` is getting too large, refactor parts into \`src/components/\`.
`
  },

  /** Vision update: preserve logic, restyle visuals */
  visionUpdate: (description: string, currentFiles: string): string => `
# UI RECONSTRUCTION TASK 🚨

The user has provided an **IMAGE** as a visual reference.

**YOUR GOAL:**
Refactor the **visuals (CSS/Layout)** of the current code to match the image,
BUT **preserve the existing blockchain logic**.

**STRICT RULES:**
1. **PRESERVE LOGIC:** Do NOT remove existing \`ethers.js\`, \`useEffect\`, \`useState\`, or ABI calls.
2. **APPLY DESIGN:** Change the HTML structure and Tailwind classes to match the image.
3. **CONFIG:** Keep using \`window.__QUICK_DAPP_CONFIG__\` variables.
4. **FILES:** Return ALL necessary files using START_TITLE format.

**YOUR MISSION:**
1. **DISCARD** the current CSS/Layout styles.
2. **REBUILD** the visual layer (\`return (...)\` in JSX) to match the **IMAGE** exactly.
3. **USE ARBITRARY VALUES:** Use exact hex codes from the image (e.g. \`bg-[#123]\`).
4. **KEEP LOGIC:** Preserve existing variables, states, \`useEffect\`, and \`ethers.js\` logic. Just wrap them in the new design.

**USER REQUEST:**
"${description}"

---
**REFERENCE LOGIC (PRESERVE THIS LOGIC):**
${currentFiles}
`,

  /** Logic preservation emphasis for all updates */
  preserveLogic: (): string => `
**🚨 LOGIC PRESERVATION (MANDATORY FOR UPDATES) 🚨**
When updating an existing DApp:
- **NEVER** remove existing ethers.js contract integrations
- **NEVER** remove existing useState, useEffect, or state management logic
- **NEVER** remove existing ABI calls or wallet connection code
- **NEVER** remove the \`window.__QUICK_DAPP_CONFIG__\` integration
- You MAY restructure the JSX layout, change CSS classes, and add new features.
`,

  /** Refactoring allowance for updates */
  refactoringRules: (): string => `
**REFACTORING RULES:**
- You are allowed to create NEW files if the user's request requires new features.
- If \`App.jsx\` is getting too large, refactor parts into \`src/components/\`.
- You may reorganize file structure as long as all imports are updated.
`,
}

// ──────────────────────────────────────────────
// System Prompt Builder
// ──────────────────────────────────────────────

export const buildSystemPrompt = (ctx: PromptContext): string => {
  const parts: string[] = [
    // Role
    `You are an expert Front-End Developer specializing in React, Vite, and ethers.js.\nYour task is to generate a multi-file DApp project structure.`,
    // Layer 0
    invariants.fileFormat(),
    invariants.minimumFiles(),
    invariants.indexHtmlTemplate(ctx),
    invariants.safety(),
    invariants.imageGeneration(),
    invariants.truncationPrevention(),
    // Layer 1
    blockchain.ethersRules(),
    blockchain.wallet(!!ctx.isLocalVM),
    blockchain.networkContext(ctx.contract.chainId, !!ctx.isLocalVM),
    // Layer 2
    ctx.isBaseMiniApp ? platform.baseMiniApp() : '',
    ctx.hasFigma ? platform.figmaTransform() : '',
    // Layer 4 (system-level parts)
    userIntent.dynamicContent(),
    userIntent.architecture(),
    // Update rules
    ctx.isUpdate ? updateRules.preserveLogic() : '',
    ctx.isUpdate ? updateRules.refactoringRules() : '',
  ]

  return parts.filter(Boolean).join('\n\n')
}

// ──────────────────────────────────────────────
// User Message Builder
// ──────────────────────────────────────────────

export interface BuildUserMessageOptions {
  description: string | any[]
  image?: string
  figmaJson?: string
  currentFiles?: Record<string, string>
}

export const buildUserMessage = (
  ctx: PromptContext,
  options: BuildUserMessageOptions,
): string | any[] => {
  const descText = Array.isArray(options.description)
    ? options.description.map((p: any) => (p.type === 'text' ? p.text : '')).join('\n')
    : options.description

  // ── Update flow ──
  if (ctx.isUpdate && options.currentFiles) {
    const filteredFiles: Record<string, string> = {}
    for (const [fileName, content] of Object.entries(options.currentFiles)) {
      if (fileName === 'index.html' || fileName.startsWith('src/') || fileName.startsWith('/src/') || fileName === '/index.html') {
        filteredFiles[fileName] = content
      }
    }
    const filesString = JSON.stringify(filteredFiles, null, 2)

    if (ctx.hasImage && Array.isArray(options.description)) {
      // Vision update: return multipart array
      return options.description.map((part: any) => {
        if (part.type === 'text') {
          return {
            type: 'text',
            text: updateRules.visionUpdate(part.text, filesString),
          }
        }
        return part // image_url part passes through
      })
    }

    return updateRules.textUpdate(options.description, filesString)
  }

  // Create flow
  if (ctx.hasFigma && options.figmaJson) {
    return visualSource.figmaData(options.figmaJson, descText)
  }

  if (ctx.hasImage && options.image) {
    const visionText = visualSource.vision(descText, ctx.contract)
    return [
      { type: 'image_url', image_url: { url: options.image } },
      { type: 'text', text: visionText },
    ]
  }

  // Text-only create
  return [
    visualSource.textOnly(descText),
    blockchain.contract(ctx.contract),
  ].join('\n\n')
}
