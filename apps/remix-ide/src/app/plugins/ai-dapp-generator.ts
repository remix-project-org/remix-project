import { Plugin } from '@remixproject/engine'
import { INITIAL_SYSTEM_PROMPT, FOLLOW_UP_SYSTEM_PROMPT, BASE_MINI_APP_SYSTEM_PROMPT, UPDATE_PAGE_START, UPDATE_PAGE_END, SEARCH_START, DIVIDER, REPLACE_END, NEW_PAGE_END, NEW_PAGE_START } from './prompt'

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
    console.log('[DEBUG-AI] generateDapp called via RPC.');
    
    this.processGeneration(options).catch(err => {
      console.error("[DEBUG-AI] ❌ Background process crashed:", err);
      this.call('terminal', 'log', { type: 'error', value: err.message });
    });

    console.log('[DEBUG-AI] Returning immediate success to prevent timeout.');
    return;
  }

  private async processGeneration(options: GenerateDappOptions & { slug: string }) {
    console.log(`[DEBUG-AI] Starting processGeneration for slug: ${options.slug}`);
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

    console.log('[DEBUG-AI] Calling LLM API...');
    const startTime = Date.now();
    
    const htmlContent = await this.callLLMAPI(messagesToSend, selectedSystemPrompt, hasImage);
    
    const duration = (Date.now() - startTime) / 1000;
    console.log(`[DEBUG-AI] LLM responded in ${duration}s.`);
    console.log('[DEBUG-AI] Raw content length:', htmlContent?.length);
    
    const pages = parsePages(htmlContent);
    const pageKeys = Object.keys(pages);
    console.log('[DEBUG-AI] Parsed Pages Keys:', pageKeys);

    if (pageKeys.length === 0) {
      console.error('[DEBUG-AI] ❌ CRITICAL: parsePages returned empty object!');
      console.log('[DEBUG-AI] Raw Content Start:', htmlContent.substring(0, 500));
    }

    context.messages = [
      { role: 'user', content: message },
      { role: 'assistant', content: htmlContent }
    ]
    this.saveContext(options.address, context)

    console.log('[DEBUG-AI] Emitting dappGenerated event...');
    
    this.emit('dappGenerated', {
      address: options.address,
      slug: options.slug, 
      content: pages, 
      isUpdate: false
    });
    
    console.log('[DEBUG-AI] Event emitted.');
    await this.call('notification', 'toast', 'Generation Complete!');
  }

  /**
   * Update an existing DApp with new description
   */
  async updateDapp(address: string, description: string | any[], currentFiles: any, hasImage: boolean, slug: string): Promise<void> {
    console.log('[DEBUG-AI] updateDapp called for slug:', slug);

    this.processUpdate(address, description, currentFiles, hasImage, slug).catch(err => {
      console.error("[DEBUG-AI] ❌ Background update crashed:", err);
      this.call('terminal', 'log', { type: 'error', value: err.message });
    });

    return;
  }

  private async processUpdate(address: string, description: string | any[], currentFiles: any, hasImage: boolean, slug: string) {
    console.log('[DEBUG-AI] processing update...');
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

      console.log('[DEBUG-AI] Update event emitted.');

    } catch (error: any) {
      context.messages.pop();
      console.error('[DEBUG-AI] Update failed:', error);
      this.call('terminal', 'log', { type: 'error', value: `Update failed: ${error.message}` });
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
          - \`provider.getSigner()\` is ASYNC. You MUST use \`await provider.getSigner()\`.
          - When writing data, ALWAYS wait for the transaction: 
            \`const tx = await contract.method(); await tx.wait();\`
          - Use \`ethers.BrowserProvider(window.ethereum)\`.

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

      ${architectureInstructions}
      ${technicalConstraints}
      <<< USER REQUEST END <<<

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
      console.log('[AIDappGenerator] Vision Mode: Creating Initial Message with Image');
      
      const visionPrompt = `
      # VISION-DRIVEN DAPP GENERATION
      
      The user has provided an **IMAGE** as the **TARGET DESIGN** (Single Source of Truth).
      
      **YOUR MISSION:**
      1. **VISUAL:** Ignore standard templates. Build the UI (HTML/Tailwind) to match the attached image **PIXEL-PERFECTLY**.
      2. **LOGIC:** Implement the features requested in the text below using the Technical Constraints.
      
      **STRATEGY:**
      - **Look at the image first.** Identify the layout, colors, buttons, and typography.
      - Write the \`index.html\` and \`src/App.jsx\` to replicate that visual structure.
      - Then, wire up the blockchain logic (ethers.js) into that structure.

      ---
      **USER TEXT REQUEST:**
      "${userDescription}"

      ${architectureInstructions}
      ${technicalConstraints}
      
      **TECHNICAL CONSTRAINTS (MANDATORY):**
      - Address: ${options.address}
      - Chain ID: ${options.chainId}
      - ABI: ${JSON.stringify(options.abi)}
      - **MUST** include the provider injection script in <head>.
      - **MUST** output index.html, src/main.jsx, src/App.jsx.
      
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
      console.log('[AIDappGenerator] Processing Image Mode: ZERO-SHOT REWRITE');
      
      return description.map(part => {
        if (part.type === 'text') {
          const visionInstruction = `
          # 🚨 UI RECONSTRUCTION TASK 🚨
          
          The user has provided an **IMAGE**. This is the **TARGET UI**.
          
          **YOUR TASK:**
          1. **IGNORE** the styles in the reference code below.
          2. **RECREATE** the \`App.jsx\` and \`index.html\` to match the visual style of the attached image **PIXEL-PERFECTLY**.
          3. Use **Tailwind CSS** to match the colors, spacing, and layout of the image.
          4. **RETAIN** the blockchain logic (ethers.js integration, ABI, Address) from the reference code.

          **CRITICAL:**
          - Do NOT assume the reference code has the correct design. It does NOT.
          - The Image is the ONLY source of truth for design.

          ---
          **USER REQUEST:**
          "${part.text}"
          
          ---
          **REFERENCE LOGIC (Use ONLY for ABI/Address/ChainID):**
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
    // const BACKEND_URL = "https://quickdapp-ai.api.remix.live/generate"
    const BACKEND_URL = "http://localhost:4000/dapp-generator/generate"

    console.log('[AIDappGenerator] calling LLM API with body:', JSON.stringify({
        messages,
        systemPrompt: systemPrompt.substring(0, 100) + "...",
        hasImage
    }, null, 2));

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
