import { Plugin } from '@remixproject/engine'
import { buildSystemPrompt, buildUserMessage, blockchain, PromptContext, BuildUserMessageOptions } from './prompt-blocks'

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

    const ctx: PromptContext = {
      contract: contractInfo,
      isBaseMiniApp: options.isBaseMiniApp,
      hasFigma: true,
      isLocalVM: this.detectLocalVM(options.chainId),
    }
    const systemPrompt = buildSystemPrompt(ctx)

    try {
      const startTime = Date.now();

      // const FIGMA_BACKEND_URL = "http://localhost:4000/figma/generate";
      const FIGMA_BACKEND_URL = "https://quickdapp-figma.api.remix.live/generate";

      const htmlContent = await this.callFigmaAPI(FIGMA_BACKEND_URL, {
        figmaToken: options.figmaToken,
        figmaUrl: options.figmaUrl,
        userPrompt: options.description,
        contractInfo: contractInfo,
        isBaseMiniApp: options.isBaseMiniApp,
        systemPrompt,
      });

      const duration = (Date.now() - startTime) / 1000;

      const pages = parsePages(htmlContent);

      if (Object.keys(pages).length === 0) {
        console.error('[DEBUG-AI] ❌ CRITICAL: No files parsed from Figma generation');
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

      const ctx: PromptContext = {
        contract: { address: options.address, abi: options.abi, chainId: options.chainId },
        isBaseMiniApp: options.isBaseMiniApp,
        hasImage,
        isLocalVM: this.detectLocalVM(options.chainId),
      }

      const systemPrompt = buildSystemPrompt(ctx)

      const msgOptions: BuildUserMessageOptions = {
        description: options.description,
        image: options.image,
      }
      const userMessage = buildUserMessage(ctx, msgOptions)
      const messagesToSend = [{ role: 'user', content: userMessage }]

      const startTime = Date.now();

      const htmlContent = await this.callLLMAPI(messagesToSend, systemPrompt, hasImage);

      const duration = (Date.now() - startTime) / 1000;

      let pages = parsePages(htmlContent);

      if (Object.keys(pages).length === 0) {
        console.error('[DEBUG-AI] ❌ CRITICAL: parsePages returned empty object!');
        console.error('[DEBUG-AI] Raw response length:', htmlContent?.length);
        console.error('[DEBUG-AI] First 500 chars:', htmlContent?.substring(0, 500));
        console.error('[DEBUG-AI] Contains START_TITLE?', htmlContent?.includes('START_TITLE'));
        console.error('[DEBUG-AI] Contains <<<:', htmlContent?.includes('<<<'));
        const debugMatches = htmlContent?.match(/<{3,}\s*START_TITLE\s+(.*?)\s+>{3,}/g);
        console.error('[DEBUG-AI] Marker matches found:', debugMatches?.length || 0, debugMatches);
        throw new Error("AI generated empty content. Please try again.");
      }

      pages = await this.validateAndRetryMissingFiles(
        pages, htmlContent, messagesToSend, systemPrompt, hasImage
      );

      context.messages = [
        { role: 'user', content: userMessage },
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

    const ctx: PromptContext = {
      contract: { address, abi: [], chainId: 1 },
      isUpdate: true,
      hasImage,
    }
    const systemPrompt = buildSystemPrompt(ctx)

    const msgOptions: BuildUserMessageOptions = {
      description,
      currentFiles,
    }
    const userMessage = buildUserMessage(ctx, msgOptions)
    context.messages.push({ role: 'user', content: userMessage });

    try {
      const htmlContent = await this.callLLMAPI(context.messages, systemPrompt, hasImage);

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

  private detectLocalVM(chainId: number | string): boolean {
    const id = Number(chainId)
    return Number.isNaN(id) || id === 0 || id === 1337 || id === 31337 || id === 5777
  }

  private async validateAndRetryMissingFiles(
    pages: Record<string, string>,
    htmlContent: string,
    originalMessages: any[],
    systemPrompt: string,
    hasImage: boolean
  ): Promise<Record<string, string>> {
    const REQUIRED_FILES = ['index.html', 'src/main.jsx', 'src/App.jsx']
    const missing = REQUIRED_FILES.filter(f => !pages[f])

    if (missing.length === 0) return pages

    console.warn(`[AI-DAPP] Missing required files: ${missing.join(', ')}. Requesting retry...`)

    try {
      const retryMessages = [
        ...originalMessages,
        { role: 'assistant', content: htmlContent },
        {
          role: 'user',
          content: `The following required files were missing from your response: ${missing.join(', ')}. Please generate ONLY these missing files using the START_TITLE format. Do not regenerate files that were already provided.`
        }
      ]

      const additionalContent = await this.callLLMAPI(retryMessages, systemPrompt, false)
      const additionalPages = parsePages(additionalContent)
      Object.assign(pages, additionalPages)
    } catch (retryErr) {
      console.warn('[AI-DAPP] Retry for missing files failed:', retryErr)
    }

    return pages
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
  const markerRegex = /<{3,}\s*START_TITLE\s+(.*?)\s+>{3,}(?:\s*END_TITLE)?/g

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
