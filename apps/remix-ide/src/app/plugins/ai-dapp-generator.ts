import { Plugin } from '@remixproject/engine'
import { INITIAL_SYSTEM_PROMPT, FOLLOW_UP_SYSTEM_PROMPT, BASE_MINI_APP_SYSTEM_PROMPT,  } from './prompt'

const profile = {
  name: 'ai-dapp-generator',
  displayName: 'AI DApp Generator',
  description: 'AI-powered DApp frontend generator',
  methods: ['generateDapp', 'updateDapp', 'resetDapp', 'getContext', 'getLastGeneratedDapp'],
  events: ['dappGenerated', 'dappUpdated', 'generationProgress'],
  version: '1.0.0'
}

interface GenerateDappOptions {
  description: string
  address: string
  abi: any[]
  chainId: string | number
  contractName: string
  hasImage?: boolean
  isBaseMiniApp?: boolean
  image?: string
  slug?: string
  figmaUrl?: string
  figmaToken?: string
}

interface DappGenerationContext {
  address: string
  messages: any[]
}

interface Pages {
    [key: string]: string
}

export class AIDappGenerator extends Plugin {
  private contexts: Map<string, DappGenerationContext> = new Map()

  constructor() {
    super(profile)
  }

  /**
   * Generate a new DApp or update an existing one
   */
  async generateDapp(options: GenerateDappOptions & { slug: string }): Promise<void> {

    if (options.figmaUrl && options.figmaToken) {
      this.processFigmaGeneration(options).catch(err => {
        console.error("[DEBUG-AI] Figma process crashed:", err);
        this.call('terminal', 'log', { type: 'error', value: err.message });
      });
    } else {
      this.processGeneration(options).catch(err => {
        console.error("[DEBUG-AI] Background process crashed:", err);
        this.call('terminal', 'log', { type: 'error', value: err.message });
      });
    }

    return;
  }

  private async processFigmaGeneration(options: GenerateDappOptions & { slug: string }) {
    
    await this.call('notification', 'toast', 'Analyzing Figma Design... (This may take time)')
    this.emit('generationProgress', { status: 'started', address: options.address })

    const context = this.getOrCreateContext(options.address)

    const contractInfo = {
      address: options.address,
      abi: options.abi,
      chainId: options.chainId,
      name: options.contractName
    };

    try {
      const startTime = Date.now();

      // const FIGMA_BACKEND_URL = "http://localhost:4000/figma/generate"; 
      const FIGMA_BACKEND_URL = "https://quickdapp-figma.api.remix.live/generate";

      const htmlContent = await this.callFigmaAPI(FIGMA_BACKEND_URL, {
        figmaToken: options.figmaToken,
        figmaUrl: options.figmaUrl,
        userPrompt: options.description,
        contractInfo: contractInfo,
        isBaseMiniApp: options.isBaseMiniApp
      });

      const duration = (Date.now() - startTime) / 1000;

      const pages = parsePages(htmlContent);
      
      const pageKeys = Object.keys(pages);

      if (pageKeys.length === 0) {
        console.error('[DEBUG-AI] ❌ CRITICAL: No files parsed!');

        if (!htmlContent) console.error('[DEBUG-AI] htmlContent is EMPTY.');
        
        throw new Error("AI failed to return valid file structure from Figma design.");
      }

      if (Object.keys(pages).length === 0) {
        throw new Error("AI failed to return valid file structure from Figma design.");
      }

      context.messages.push({ 
        role: 'user', 
        content: `Generated from Figma: ${options.figmaUrl}\nInstructions: ${options.description}` 
      });
      context.messages.push({ role: 'assistant', content: htmlContent });
      this.saveContext(options.address, context);

      this.emit('dappGenerated', {
        address: options.address,
        slug: options.slug,
        content: pages,
        isUpdate: false
      });

      await this.call('notification', 'toast', 'Figma Design Imported Successfully!');

    } catch (error: any) {
      console.error('[DEBUG-AI] Figma Generation Failed:', error);
      this.call('terminal', 'log', { type: 'error', value: error.message });
      this.emit('dappGenerationError', {
        address: options.address,
        slug: options.slug,
        error: error.message
      });
    }
  }

  private async callFigmaAPI(url: string, payload: any): Promise<string> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Figma Backend Error: ${errText}`)
      }

      const json = await response.json();
      return json.content;

    } catch (error) {
      console.error('[AI-DAPP] Figma API Call Failed:', error);
      throw error;
    }
  }

  private async processGeneration(options: GenerateDappOptions & { slug: string }) {
    
    try {
      const hasImage = !!options.image;

      await this.call('notification', 'toast', 'Generating... (Logs in console)')
      this.emit('generationProgress', { status: 'started', address: options.address })

      const context = this.getOrCreateContext(options.address)
      const message = this.createInitialMessage(options)
      const messagesToSend = [{ role: 'user', content: message }]

      let selectedSystemPrompt = INITIAL_SYSTEM_PROMPT
      if (options.isBaseMiniApp) {
        selectedSystemPrompt = BASE_MINI_APP_SYSTEM_PROMPT
      }

      const startTime = Date.now();

      const htmlContent = await this.callLLMAPI(messagesToSend, selectedSystemPrompt, hasImage);

      const duration = (Date.now() - startTime) / 1000;

      const pages = parsePages(htmlContent);
      const pageKeys = Object.keys(pages);

      if (pageKeys.length === 0) {
        console.error('[DEBUG-AI] ❌ CRITICAL: parsePages returned empty object!');
        
        throw new Error("AI generated empty content. Please try again.");
      }

      context.messages = [
        { role: 'user', content: message },
        { role: 'assistant', content: htmlContent }
      ]
      this.saveContext(options.address, context)

      this.emit('dappGenerated', {
        address: options.address,
        slug: options.slug,
        content: pages,
        isUpdate: false
      });

      await this.call('notification', 'toast', 'Generation Complete!');

    } catch (error: any) {
      console.error('[DEBUG-AI] Generation Failed:', error);
      this.call('terminal', 'log', { type: 'error', value: error.message });

      this.emit('dappGenerationError', {
        address: options.address,
        slug: options.slug,
        error: error.message
      });
    }
  }

  /**
   * Update an existing DApp with new description
   */
  async updateDapp(address: string, description: string | any[], currentFiles: any, hasImage: boolean, slug: string): Promise<void> {

    this.processUpdate(address, description, currentFiles, hasImage, slug).catch(err => {
      console.error("[DEBUG-AI] ❌ Background update crashed:", err);
      this.call('terminal', 'log', { type: 'error', value: err.message });
    });

    return;
  }

  private async processUpdate(address: string, description: string | any[], currentFiles: any, hasImage: boolean, slug: string) {
    const context = this.getOrCreateContext(address);

    if (context.messages.length === 0) {
      await this.call('terminal', 'log', { type: 'error', value: 'No context found for this dapp.' });
      return;
    }

    const message = this.createUpdateMessage(description, currentFiles);
    context.messages.push({ role: 'user', content: message });

    try {
      const htmlContent = await this.callLLMAPI(context.messages, FOLLOW_UP_SYSTEM_PROMPT, hasImage);

      const pages = parsePages(htmlContent);

      if (Object.keys(pages).length === 0) {
        throw new Error("AI failed to return valid file structure.");
      }

      context.messages.push({ role: 'assistant', content: htmlContent });
      this.saveContext(address, context);

      this.emit('dappGenerated', {
        address,
        slug,
        content: pages,
        isUpdate: true
      });

    } catch (error: any) {
      context.messages.pop();
      console.error('[DEBUG-AI] Update failed:', error);
      this.call('terminal', 'log', { type: 'error', value: `Update failed: ${error.message}` });
      
      this.emit('dappGenerationError', {
        address,
        slug,
        error: error.message || "Unknown error during generation"
      });
    }
  }

  /**
   * Reset the conversation history for a specific address
   */
  async resetDapp(address: string): Promise<void> {
    this.contexts.delete(address)
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('ai-dapp-' + address)
    }
  }

  /**
   * Get the conversation history for debugging
   */
  async getContext(address: string): Promise<DappGenerationContext> {
    return this.getOrCreateContext(address)
  }

  private getOrCreateContext(address: string): DappGenerationContext {
    if (this.contexts.has(address)) {
      return this.contexts.get(address)!
    }

    // Try to load from localStorage
    let messages: any[] = []
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('ai-dapp-' + address)
      if (stored) {
        try {
          messages = JSON.parse(stored)
        } catch (e) {
          console.warn('Failed to parse stored messages for', address)
        }
      }
    }

    const context: DappGenerationContext = { address, messages }
    this.contexts.set(address, context)
    return context
  }

  async getLastGeneratedDapp(address: string): Promise<Pages | null> {
    const context = await this.getContext(address)
    let currentPages: Pages = {}
    if (context) {
      for (const message of context.messages) {
        if (message.role === 'assistant') {
          const newPages = parsePages(message.content)
          if (Object.keys(newPages).length > 0) {
            currentPages = newPages
          }
        }
      }
    }
    return currentPages
  }

  private saveContext(address: string, context: DappGenerationContext): void {
    this.contexts.set(address, context)
    if (typeof localStorage !== 'undefined') {
      try {
        const messagesToSave = context.messages.map(msg => {
          const newMsg = { ...msg };

          if (Array.isArray(newMsg.content)) {
            newMsg.content = newMsg.content.map((part: any) => {
              if (part.type === 'image_url' && part.image_url?.url?.startsWith('data:')) {
                return {
                  type: 'image_url',
                  image_url: { url: '[IMAGE_DATA_REMOVED_TO_SAVE_SPACE]' }
                };
              }
              return part;
            });
          }
          return newMsg;
        });

        localStorage.setItem('ai-dapp-' + address, JSON.stringify(messagesToSave))
      } catch (e) {
        console.warn('[AIDappGenerator] Failed to save context to localStorage (Quota Exceeded). History might be lost on reload.');
      }
    }
  }

  private createInitialMessage(options: GenerateDappOptions): string | any[] {
    const providerCode = this.getProviderCode()

    const userDescription = Array.isArray(options.description)
      ? options.description.map(p => p.type === 'text' ? p.text : '').join('\n')
      : options.description;

    const functionNames = options.abi
      .filter((item: any) => item.type === 'function')
      .map((item: any) => `- ${item.name} (${item.stateMutability})`)
      .join('\n');

    const contractMandate = `
      **🚨 MANDATORY SMART CONTRACT INTEGRATION 🚨**
      
      You MUST integrate the provided Smart Contract into the UI.
      A DApp with only UI and no logic is a FAILURE.

      **Contract Details:**
      - **Address:** \`${options.address}\`
      - **Chain ID:** ${options.chainId}
      - **ABI Functions to Implement:**
      ${functionNames}

      **Integration Rules:**
      1. **Connect Wallet:** Must include a button to connect MetaMask/Wallet.
      2. **Read Functions:** Display data from 'view'/'pure' functions on the screen.
      3. **Write Functions:** Create Forms/Buttons to trigger 'payable'/'nonpayable' functions.
      4. **Feedback:** Show loading states and success/error toasts for transactions.
    `;

    const dynamicContentRules = `
      **🚨 DYNAMIC CONTENT RULES (CRITICAL) 🚨**
      The DApp creates a shell that passes configuration via \`window.__QUICK_DAPP_CONFIG__\`.
      
      1. **NO HARDCODED TEXT/LOGOS:**
         - Even if the user asks for "Binance Style", **DO NOT** write "Binance" as the main title.
         - **DO NOT** hardcode an <img> tag with a random URL unless it's a background or icon.
      
      2. **USE CONFIG VARIABLES:**
         - In \`App.jsx\`, read config: \`const config = window.__QUICK_DAPP_CONFIG__ || {};\`
         - **Title:** Use \`{config.title}\` for the main header (Navbar/Hero).
         - **Logo:** Use \`{config.logo}\`. Render it ONLY if it exists: \`{config.logo && <img src={config.logo} ... />}\`.
         - **Description:** Use \`{config.details}\` for the sub-header or about section.
         
      3. **FALLBACK:**
         - Only if \`config.title\` is missing, fall back to "My DApp".
         - BUT ALWAYS prioritize the \`config\` object variables.
    `;

    const architectureInstructions = `
      **ARCHITECTURE INSTRUCTIONS :**

      1. **Analyze the Request:** - Split complex UIs into \`src/pages/Home.jsx\`, \`src/pages/Dashboard.jsx\`, etc.
      
      2. **Routing (ZERO DEPENDENCY MODE):**
         - **STOP! Do NOT use \`react-router-dom\`.** It causes version conflicts.
         - **Implement a simple Hash Router manually** in \`src/App.jsx\`.
         - Use \`useState\` and \`window.location.hash\` to switch pages.
         - Example Pattern for App.jsx:
           \`\`\`javascript
           const [route, setRoute] = useState(window.location.hash || '#/');
           useEffect(() => {
             const onHashChange = () => setRoute(window.location.hash || '#/');
             window.addEventListener('hashchange', onHashChange);
             return () => window.removeEventListener('hashchange', onHashChange);
           }, []);
           
           // Navigation Function
           const navigate = (path) => window.location.hash = path;
           
           // Render
           return (
             <div>
               <Navbar navigate={navigate} />
               {route === '#/' && <Home />}
               {route === '#/dashboard' && <Dashboard />}
             </div>
           );
           \`\`\`

      3. **File Structure Target:**
         - \`index.html\` (Simple Import Map)
         - \`src/main.jsx\`
         - \`src/App.jsx\` (Manual Router Logic)
         - \`src/index.css\` (Tailwind)
         - \`src/pages/*.jsx\`
    `;

    const technicalConstraints = `
      **TECHNICAL CONSTRAINTS (STRICTLY FOLLOW THESE):**
      
      1. **DEPENDENCY MANAGEMENT (SIMPLE IMPORT MAP):**
         - Use this SIMPLIFIED Import Map in \`index.html\` <head>.
         - **Do NOT** include react-router-dom.
           \`\`\`html
           <script type="importmap">
           {
             "imports": {
               "react": "https://esm.sh/react@18.2.0",
               "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
               "ethers": "https://esm.sh/ethers@6.11.1"
             }
           }
           </script>
           \`\`\`
         - In JSX files, use: \`import React, { useState, useEffect } from "react";\`

      2. **STYLING (Tailwind CSS ONLY):**
          - Do NOT use custom CSS classes like "card", "btn", "navbar". 
          - USE ONLY Tailwind utility classes directly in JSX (e.g., \`className="bg-white p-4 rounded shadow"\`).
          - Ensure the UI looks exactly like the image provided.

      3. **Ethers.js v6 RULES (CRITICAL):**
          - **Read-Only:** For 'view'/'pure' functions, use \`new ethers.Contract(addr, abi, provider)\`.
          - **Write (Transaction):** For 'nonpayable'/'payable' functions, YOU MUST USE A SIGNER.
            \`\`\`javascript
            // Inside the button click handler:
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner(); // <--- CRITICAL
            const contractWithSigner = new ethers.Contract(address, abi, signer); 
            const tx = await contractWithSigner.functionName(args);
            await tx.wait();
            \`\`\`
          - **NEVER** try to send a transaction with a Provider-only contract instance. It will throw "UNSUPPORTED_OPERATION".

      4. **Files & Structure:**
          - At a minimum, the following files must be returned. \`index.html\`, \`src/main.jsx\`, \`src/App.jsx\`, \`src/index.css\`.
          - Inject provider script in \`index.html\` <head>.
          - Use \`window.__QUICK_DAPP_CONFIG__\` for titles/logos.

      5. **Functionality:**
          - Connect Wallet button must be visible.
          - Handle "User rejected request" errors gracefully.

      6. **Output Format:**
         - Return ALL files using \`<<<<<<< START_TITLE filename >>>>>>> END_TITLE\` format.
         - **Do NOT** omit any file. output full content.
         - **Minimal Comments:** To save token space, avoid verbose comments.
    `;

    const basePrompt = `
      You are generating a new DApp.
      
      **CRITICAL INSTRUCTION - USER PRIORITY:**
      The user has provided specific design or functional requirements below.
      You MUST prioritize the user's request (theme, language, features) over
      any default templates or examples provided in the system prompt.
      
      >>> USER REQUEST START >>>
      "${userDescription}"
      <<< USER REQUEST END <<<

      ${contractMandate}
      ${dynamicContentRules}
      ${architectureInstructions}
      ${technicalConstraints}

      If the user asked for a specific language (e.g. Korean), use it for all UI text.
      If the user asked for a specific theme (e.g. Dark), implement it using Tailwind classes.

      ---------------------------------------------------------
      **TECHNICAL CONSTRAINTS (DO NOT BREAK THESE):**
      
      **1. File Structure:** Follow the \`window.__QUICK_DAPP_CONFIG__\` pattern.
      
      **2. Contract Details:**
      - Address: ${options.address}
      - Chain ID: ${options.chainId} (Decimal), 0x${Number(options.chainId).toString(16)} (Hex)
      - ABI: ${JSON.stringify(options.abi)}

      **3. Code Patterns (React + Ethers v6):**
      - Use \`useState\` and \`useEffect\`.
      - Implement \`connectWallet\` and \`switchNetwork\` (Error 4902 handling).
      - Check \`window.ethereum\` existence.
      - Use \`ethers.BrowserProvider\`.

      **4. UI/UX Requirements:**
      - Show "Connect Wallet" button when disconnected.
      - Show "Wrong Network" warning if chain ID mismatches.
      - Use loading spinners for async actions.

      **5. Provider Injection:**
      Ensure this script is in \`<head>\` of \`index.html\`:
      ${providerCode}

      Remember: Return ALL project files in the 'START_TITLE' format.
    `
    if (options.image) {

      const visionPrompt = `
      # VISION-DRIVEN DAPP GENERATION: PIXEL-PERFECT CLONE MODE
      
      The user provided an **IMAGE**. Your goal is to **CLONE** this interface into React code.

      **VISUAL INSTRUCTIONS (PRIORITY #1 - THE "LOOK"):**

      1. **IGNORE DEFAULT TEMPLATES:** Do not use generic styles. If the image looks unique, your code must look unique.
      2. **EXACT COLORS:** Do not strictly rely on default Tailwind colors (like \`bg-blue-500\`). **Extract the HEX CODES** from the image and use Tailwind arbitrary values (e.g., \`bg-[#1a2b3c]\`, \`text-[#f0f0f0]\`).
      3. **LAYOUT & SPACING:** Observe the exact padding, border-radius, and shadows. Replicate the "density" of the UI.
      4. **FONTS & VIBE:** Match the font weight (Bold/Light) and style (Modern/Retro) exactly.

      **TASK: MERGE VISUALS WITH LOGIC (STRICT COMPLIANCE)**

      You are provided with an **IMAGE**. This image is the SINGLE SOURCE OF TRUTH for the target **Visual Style, Mood, and Layout**.
      You are also provided with **MANDATORY LOGIC REQUIREMENTS**.

      **PRIORITY RULES:**
      1. **LOGIC & STRUCTURE (HIGHEST PRIORITY - DO NOT BREAK):**
         - Implement React + Ethers.js structure defined in "TECHNICAL CONSTRAINTS".
         - Use \`window.__QUICK_DAPP_CONFIG__\` for Title/Logo/Details.
         - Integrate the Smart Contract (ABI, Address).
         - Use \`.jsx\` extensions.

      2. **VISUALS & MOOD (CRITICAL DESIGN GOAL):**
         - **ANALYZE THE VIBE:** Look at the image's atmosphere. Is it dark & futuristic? Playful & colorful? Minimalist & clean?
         - **COLOR PALETTE:** Extract the primary colors, background colors, and accent colors from the image and apply them using Tailwind CSS (e.g., arbitrary values like \`bg-[#1a1b1e]\` if needed to match precisely).
         - **TYPOGRAPHY & COMPOSITION:** Observe font weights, spacing, and rounded corners in the image and replicate them.
         - **REPLICATE, DON'T JUST MAP:** Do not just place buttons in the same spots. Make them *look* exactly like the buttons in the image.

      **CONTRACT TO INTEGRATE:**
      - **Address:** \`${options.address}\`
      - **Chain ID:** ${options.chainId}
      - **ABI Functions:**
      ${functionNames}

      **USER INSTRUCTIONS:**
      "${userDescription}"

      ${architectureInstructions}
      ${technicalConstraints}
      
      **REMINDER:** The Image is for *CSS/Layout*. The System Prompt is for *Code Structure/Logic*. DO NOT FAIL THE LOGIC.
      
      **PROVIDER SCRIPT TO INJECT:**
      ${providerCode}
      `;

      return [
        {
          type: 'image_url',
          image_url: { url: options.image }
        },
        {
          type: 'text',
          text: visionPrompt
        }
      ];
    }

    return basePrompt;
  }

  private createUpdateMessage(description: string | any[], currentFiles: Pages): string | any[] {

    const filteredFiles: Pages = {};
    for (const [fileName, content] of Object.entries(currentFiles)) {
      if (fileName === 'index.html' || fileName.startsWith('src/')) {
        filteredFiles[fileName] = content;
      }
    }

    const filesString = JSON.stringify(filteredFiles, null, 2);

    const textOnlyInstruction = `
      IMPORTANT: The user has provided context in this message.
      Prioritize the user's request over the file contents below.
      
      User's request:
      ${Array.isArray(description) ? description.map(p => p.text).join('\n') : description}

      ---
      Current Project Code (Partial View):
      ${filesString}

      Please apply the update. 
      **CRITICAL REQUIREMENT:** 1. Return ALL project files (index.html, src/App.jsx, etc).
      2. You MUST use the format: <<<<<<< START_TITLE filename >>>>>>> END_TITLE
      3. Do NOT provide explanations, only the code blocks.
    `

    if (Array.isArray(description)) {

      return description.map(part => {
        if (part.type === 'text') {
          const visionInstruction = `
          # UI RECONSTRUCTION TASK 🚨
          
          The user has provided an **IMAGE** as a visual reference.
          
          **YOUR GOAL:**
          Refactor the **visuals (CSS/Layout)** of the current code to match the attached image, BUT **preserve the existing blockchain logic**.

          **STRICT RULES:**
          1. **PRESERVE LOGIC:** Do NOT remove the existing \`ethers.js\` integration, \`useEffect\`, \`useState\`, or ABI calls found in the Reference Code.
          2. **APPLY DESIGN:** Change the HTML structure and Tailwind classes to match the image.
          3. **CONFIG:** Keep using \`window.__QUICK_DAPP_CONFIG__\` variable.
          4. **FILES:** Return ALL necessary files (index.html, src/App.jsx, etc).

          ---
          **YOUR MISSION:**
          1. **DISCARD** the current CSS/Layout styles of the reference code.
          2. **REBUILD** the visual layer (\`return (...)\` in JSX) to match the **IMAGE** exactly.
          3. **USE ARBITRARY VALUES:** Use exact hex codes from the image (e.g. \`bg-[#123]\`) instead of generic Tailwind classes.
          4. **KEEP LOGIC:** You MUST preserve the existing variables, states, \`useEffect\`, and \`ethers.js\` logic from the reference code. Just wrap them in the new design.
          
          **USER REQUEST:**
          "${part.text}"
          
          ---
          **REFERENCE LOGIC (PRESERVE THIS LOGIC):**
          ${filesString}
          `;

          return {
            type: 'text',
            text: visionInstruction
          };
        }
        return part;
      })
    }

    return textOnlyInstruction;
  }

  private getProviderCode(): string {
    // This is the provider code that was missing from the original implementation
    return `
<script>
  // Remix IDE provider injection
  if (typeof window !== 'undefined' && window.ethereum && window.ethereum.isRemix) {
    window.ethereum = window.ethereum;
  }
</script>`
  }

  private async callLLMAPI(messages: any[], systemPrompt: string, hasImage: boolean = false): Promise<string> {
    const BACKEND_URL = "https://quickdapp-ai.api.remix.live/generate"
    // const BACKEND_URL = "http://localhost:4000/dapp-generator/generate"

    try {
      const response = await fetch(BACKEND_URL, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages,
          systemPrompt,
          hasImage
        })
      });

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Backend Error: ${errText}`)
      }

      const json = await response.json();

      return json.content;

    } catch (error) {
      console.error('[AI-DAPP] API Call Failed:', error);
      throw error;
    }
  }
}

const cleanFileContent = (content: string, filename: string): string => {
  let cleaned = content.trim()

  const codeBlockRegex = /```[\w-]*\n([\s\S]*?)\n?```/;
  const match = cleaned.match(codeBlockRegex);

  if (match && match[1]) {
    cleaned = match[1].trim();
  } else {
    cleaned = cleaned.replace(/^```[\w-]*\n?/gm, '')
    cleaned = cleaned.replace(/```$/gm, '')
  }

  const strayTags = ['javascript', 'typescript', 'html', 'css', 'jsx', 'tsx', 'json', 'bash']
  for (const tag of strayTags) {
    if (cleaned.toLowerCase().startsWith(tag)) {
      const regex = new RegExp(`^${tag}\\s*\\n?`, 'i')
      cleaned = cleaned.replace(regex, '')
    }
  }

  if (filename.endsWith('.html')) {
    cleaned = cleaned.replace(/(<script[^>]*>)\s*javascript\s*/gi, '$1\n')
  }

  return cleaned.trim()
}

// Helper function to ensure HTML has complete structure
const ensureCompleteHtml = (html: string): string => {
  let completeHtml = html;

  // Add missing head closing tag
  if (completeHtml.includes("<head>") && !completeHtml.includes("</head>")) {
    completeHtml += "\n</head>";
  }

  // Add missing body closing tag
  if (completeHtml.includes("<body") && !completeHtml.includes("</body>")) {
    completeHtml += "\n</body>";
  }

  // Add missing html closing tag
  if (!completeHtml.includes("</html>")) {
    completeHtml += "\n</html>";
  }

  return completeHtml;
};

const parsePages = (content: string) => {
  const pages: Record<string, string> = {}
  const markerRegex = /<{3,}\s*START_TITLE\s+(.*?)\s+>{3,}\s*END_TITLE/g

  const parts = content.split(markerRegex)

  for (let i = 1; i < parts.length; i += 2) {
    const filename = parts[i].trim()
    const rawFileContent = parts[i + 1]

    if (filename && rawFileContent) {
      let cleanContent = cleanFileContent(rawFileContent, filename)

      if (filename.endsWith('.html')) {
        cleanContent = ensureCompleteHtml(cleanContent)
      }

      if (cleanContent) {
        pages[filename] = cleanContent;
      }
    }
  }

  return pages
}
