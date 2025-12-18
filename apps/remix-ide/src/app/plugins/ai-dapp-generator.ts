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
  async generateDapp(options: GenerateDappOptions): Promise<Pages> {
    try {
      console.log('[AIDappGenerator] Generating Dapp. Options:', JSON.stringify(options, null, 2));

      await this.call('notification', 'toast', 'Generating the DApp, please wait... it can take up to 2 minutes depending on the contract complexity.')
      this.emit('generationProgress', { status: 'started', address: options.address })

      const context = this.getOrCreateContext(options.address)

      const message = this.createInitialMessage(options)
      const messagesToSend = [
        { role: 'user', content: message }
      ]

      let selectedSystemPrompt = INITIAL_SYSTEM_PROMPT
      if (options.isBaseMiniApp) {
        console.log('[AIDappGenerator] Switching to BASE_MINI_APP_SYSTEM_PROMPT')
        selectedSystemPrompt = BASE_MINI_APP_SYSTEM_PROMPT
      } else {
        console.log('[AIDappGenerator] Using standard INITIAL_SYSTEM_PROMPT')
      }

      const htmlContent = await this.callLLMAPI(messagesToSend, selectedSystemPrompt, options.hasImage)

      const pages = parsePages(htmlContent)
      context.messages = [
        { role: 'user', content: message },
        { role: 'assistant', content: htmlContent }
      ]
      this.saveContext(options.address, context)

      this.emit('dappGenerated', {
        address: options.address,
        content: null,
        isUpdate: false
      })

      await this.call('notification', 'toast', 'The DApp has been generated successfully!')

      return pages

    } catch (error) {
      await this.call('terminal', 'log', { type: 'error', value: error.message })
      throw error
    }
  }

  /**
   * Update an existing DApp with new description
   */
  async updateDapp(address: string, description: string, currentFiles: Pages, hasImage: boolean = false): Promise<Pages> {
    const context = this.getOrCreateContext(address)

    if (context.messages.length === 0) {
      throw new Error('No existing DApp found for this address. Please generate one first.')
    }

    const message = this.createUpdateMessage(description, currentFiles)
    context.messages.push({ role: 'user', content: message })

    try {
      const htmlContent = await this.callLLMAPI(context.messages, FOLLOW_UP_SYSTEM_PROMPT, hasImage)

      const pages = parsePages(htmlContent)

      if (Object.keys(pages).length === 0) {
        throw new Error("AI failed to return valid file structure. Check logs.");
      }

      context.messages.push({ role: 'assistant', content: htmlContent })
      this.saveContext(address, context)

      this.emit('dappUpdated', { address, content: pages })
      return pages

    } catch (error) {
      // Remove the failed message from context
      context.messages.pop()
      throw error
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
      localStorage.setItem('ai-dapp-' + address, JSON.stringify(context.messages))
    }
  }

  private createInitialMessage(options: GenerateDappOptions): string | any[] {
    const providerCode = this.getProviderCode()

    const userDescription = Array.isArray(options.description) 
      ? options.description.map(p => p.type === 'text' ? p.text : '').join('\n') 
      : options.description;

    const basePrompt = `
      You are generating a new DApp.
      
      **CRITICAL INSTRUCTION - USER PRIORITY:**
      The user has provided specific design or functional requirements below.
      You MUST prioritize the user's request (theme, language, features) over
      any default templates or examples provided in the system prompt.
      
      >>> USER REQUEST START >>>
      "${userDescription}"
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

    if (Array.isArray(options.description)) {
       return options.description.map(part => {
         if (part.type === 'text') {
           return {
             type: 'text',
             text: basePrompt
           }
         }
         return part
       });
    }
    
    return basePrompt;
  }

  private createUpdateMessage(description: string, currentFiles: Pages): string | any[] {
    const filesString = JSON.stringify(currentFiles, null, 2)
    const contextInstruction = `
      IMPORTANT: The user has provided context in this message (like new Title or Details).
      You MUST prioritize the information in this message over the
      file contents I am providing below.
      User's request and context:
      ${description}

      ---
      
      Here is the full code of my current project (which might be outdated):
      ${filesString}

      Please apply the update. Remember to return ALL project files 
      in the 'START_TITLE' format and follow the
      window.__QUICK_DAPP_CONFIG__ template.
    `

    if (Array.isArray(description)) {
      return description.map(part => {
        if (part.type === 'text') {
          return { 
            type: 'text', 
            text: `User's request:\n${part.text}\n\n${contextInstruction}`
          };
        }
        return part;
      })
    }

    return `
      ${contextInstruction}
    `
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

  cleaned = cleaned.replace(/^```[\w-]*\n?/gm, '')
  cleaned = cleaned.replace(/```$/gm, '')

  const strayTags = ['javascript', 'typescript', 'html', 'css', 'jsx', 'tsx', 'json']
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
  const pages = {}
  const markerRegex = /<<<<<<< START_TITLE (.*?) >>>>>>> END_TITLE/g

  if (!content.match(markerRegex)) {
    return pages
  }

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
