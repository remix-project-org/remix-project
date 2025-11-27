import { Plugin } from '@remixproject/engine'
import { INITIAL_SYSTEM_PROMPT, FOLLOW_UP_SYSTEM_PROMPT, UPDATE_PAGE_START, UPDATE_PAGE_END, SEARCH_START, DIVIDER, REPLACE_END, NEW_PAGE_END, NEW_PAGE_START } from './prompt'

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
      await this.call('notification', 'toast', 'Generating the DApp, please wait... it can take up to 2 minutes depending on the contract complexity.')
      this.emit('generationProgress', { status: 'started', address: options.address })

      const context = this.getOrCreateContext(options.address)

      const message = this.createInitialMessage(options)
      const messagesToSend = [
        { role: 'user', content: message }
      ]

      const htmlContent = await this.callLLMAPI(messagesToSend, INITIAL_SYSTEM_PROMPT)

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
  async updateDapp(address: string, description: string, currentFiles: Pages): Promise<Pages> {
    const context = this.getOrCreateContext(address)

    if (context.messages.length === 0) {
      throw new Error('No existing DApp found for this address. Please generate one first.')
    }

    const message = this.createUpdateMessage(description, currentFiles)
    context.messages.push({ role: 'user', content: message })

    try {
      const htmlContent = await this.callLLMAPI(context.messages, FOLLOW_UP_SYSTEM_PROMPT)

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

  private createInitialMessage(options: GenerateDappOptions): string {
    const providerCode = this.getProviderCode()

    return `
      You MUST generate a new DApp based on the following requirements.
      
      **MOST IMPORTANT RULE:** You MUST follow the file structure and code templates
      defined in the system prompt. Specifically, you MUST use the
      \`window.__QUICK_DAPP_CONFIG__\` object in \`index.html\` and \`src/App.jsx\`
      to handle the DApp's title, details, and logo.
      
      **Contract Details:**
      - Address: ${options.address}
      - Chain ID: ${options.chainId} (Decimal), 0x${Number(options.chainId).toString(16)} (Hex)
      - ABI: ${JSON.stringify(options.abi)}

      **UI/UX REQUIREMENTS (RainbowKit Style):**
      1. **No Default Alerts:** Do NOT use \`window.alert\`. Use modern UI elements (e.g., error text below buttons).
      2. **Connection State:** - Before connection: Show a centered "Connect Wallet" button.
         - After connection: Show the **Connected Address** (e.g., 0x12...34) and a **"Disconnect"** button clearly.
      3. **Network Check:** If on the wrong network, show a "Wrong Network" warning and a **"Switch Network"** button.
      4. **Feedback:** Show loading spinners or "Loading..." text during async actions.

      **CODE PATTERN REQUIREMENTS (React + Ethers v6):**
      
      In \`src/App.jsx\`, you MUST implement the following robust patterns.
      
      **1. Constants & State:**
      Define the target chain ID in Hex format for MetaMask.
      \`\`\`javascript
      const TARGET_CHAIN_HEX = "0x${Number(options.chainId).toString(16)}";
      const TARGET_CHAIN_DECIMAL = ${options.chainId};
      
      const [walletState, setWalletState] = useState({
        isConnected: false,
        chainId: null,
        address: '',
        isConnecting: false,
        error: ''
      });
      \`\`\`

      **2. Robust Network Switching (CRITICAL):**
      You MUST handle the case where the network is not added to the user's wallet (Error 4902).
      \`\`\`javascript
      const switchNetwork = async () => {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: TARGET_CHAIN_HEX }],
          });
          // Success: The page will likely reload or the chainChanged event will fire
          return true;
        } catch (error) {
          // Error Code 4902 means the chain has not been added to MetaMask.
          if (error.code === 4902) {
             try {
               await window.ethereum.request({
                 method: 'wallet_addEthereumChain',
                 params: [{
                   chainId: TARGET_CHAIN_HEX,
                   // You can add generic placeholders for rpcUrls if not known, 
                   // or rely on the user to add it manually if this fails.
                 }]
               });
               return true;
             } catch (addError) {
               console.error("Failed to add chain:", addError);
               setWalletState(prev => ({ ...prev, error: "Failed to add network to wallet." }));
               return false;
             }
          }
          console.error("Failed to switch network:", error);
          setWalletState(prev => ({ ...prev, error: "Failed to switch network: " + error.message }));
          return false;
        }
      };
      \`\`\`

      **3. Disconnect Logic:**
      Always reset state completely.
      \`\`\`javascript
      const disconnectWallet = () => {
        setWalletState({
          isConnected: false,
          chainId: null,
          address: '',
          isConnecting: false,
          error: ''
        });
        setContract(null);
      };
      \`\`\`

      **4. Connection Logic:**
      Check the network immediately after connecting.
      \`\`\`javascript
      const connectWallet = async () => {
        if (!window.ethereum) {
          setWalletState(prev => ({ ...prev, error: "MetaMask not found" }));
          return;
        }
        setWalletState(prev => ({ ...prev, isConnecting: true, error: '' }));
        
        try {
          const provider = new ethers.BrowserProvider(window.ethereum);
          const accounts = await provider.send("eth_requestAccounts", []);
          const network = await provider.getNetwork();
          const currentChainId = Number(network.chainId); // Convert bigint to number
          
          const isCorrectChain = currentChainId === TARGET_CHAIN_DECIMAL;
          
          setWalletState({
            isConnected: true,
            chainId: currentChainId,
            address: accounts[0],
            isConnecting: false,
            error: isCorrectChain ? '' : 'Wrong Network. Please switch.'
          });
          
          // Optional: Auto-switch if wrong network
          if (!isCorrectChain) {
             await switchNetwork(); 
          }

        } catch (err) {
          setWalletState(prev => ({ ...prev, isConnecting: false, error: err.message }));
        }
      };
      \`\`\`

      **5. UI Rendering Logic:**
      \`\`\`jsx
      <nav>
        {walletState.isConnected ? (
          <div className="flex items-center gap-4">
            <span className="badge">
               {walletState.chainId === TARGET_CHAIN_DECIMAL ? "Connected" : "Wrong Network"}
            </span>
            <span className="address">{walletState.address.slice(0,6)}...</span>
            <button onClick={disconnectWallet} className="btn-disconnect">
              Disconnect
            </button>
          </div>
        ) : (
          <button onClick={connectWallet}>Connect Wallet</button>
        )}
      </nav>
      {/* Show explicit switch button if connected but wrong network */}
      {walletState.isConnected && walletState.chainId !== TARGET_CHAIN_DECIMAL && (
        <div className="alert-warning">
           <p>You are on the wrong network.</p>
           <button onClick={switchNetwork}>Switch to Correct Network</button>
        </div>
      )}
      \`\`\`

      **User's Design Request:**
      Please build the DApp based on this description:
      "${options.description}"
      
      **Provider Code:**
      Also, ensure the following provider injection script is in the \`<head>\`
      of \`index.html\`:
      ${providerCode}

      Remember: Return ALL project files in the 'START_TITLE' format as
      instructed in the system prompt.
    `
  }

  private createUpdateMessage(description: string, currentFiles: Pages): string {
    const filesString = JSON.stringify(currentFiles, null, 2);
    return `
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

  private async callLLMAPI(messages: any[], systemPrompt: string): Promise<string> {
    const BACKEND_URL = "https://quickdapp-ai.api.remix.live/generate";
    // const BACKEND_URL = "http://localhost:4000/dapp-generator/generate";

    try {
      const response = await fetch(BACKEND_URL, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages,
          systemPrompt
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Backend Error: ${errText}`);
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
