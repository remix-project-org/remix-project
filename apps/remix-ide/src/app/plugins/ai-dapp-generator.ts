import { Plugin } from '@remixproject/engine'
import { buildSystemPrompt, buildUserMessage, blockchain, PromptContext, BuildUserMessageOptions } from './prompt-blocks'
import { trackMatomoEvent } from '@remix-api'

const profile = {
  name: 'ai-dapp-generator',
  displayName: 'AI DApp Generator',
  description: 'AI-powered DApp frontend generator',
  methods: ['generateDapp', 'updateDapp', 'resetDapp', 'getContext', 'getLastGeneratedDapp', 'consumePendingResult', 'getAllPendingSlugs'],
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
  // Buffer for generation results — survives plugin reactivation cycles
  private pendingResults: Map<string, { address: string, content: Pages, isUpdate: boolean }> = new Map()

  constructor() {
    super(profile)
  }

  async onActivation() {
    // no-op
  }

  onDeactivation() {
    // no-op (pendingResults intentionally preserved)
  }

  /**
   * Consume a pending result for a given slug.
   * Called by quick-dapp-v2 UI on initApp to recover missed events.
   */
  async consumePendingResult(slug: string): Promise<{ address: string, content: Pages, isUpdate: boolean } | null> {
    const result = this.pendingResults.get(slug)
    if (result) {
      this.pendingResults.delete(slug)
      return result
    }
    return null
  }

  /**
   * Get all slugs that have pending results (for discovery).
   */
  async getAllPendingSlugs(): Promise<string[]> {
    return Array.from(this.pendingResults.keys())
  }

  /**
   * Generate a new DApp or update an existing one
   */
  async generateDapp(options: GenerateDappOptions & { slug: string }): Promise<void> {
    if (options.figmaUrl && options.figmaToken) {
      this.processFigmaGeneration(options).catch(err => {
        console.error('[AI-DAPP] Figma process crashed:', err);
        try {
          this.call('terminal', 'log', { type: 'error', value: err.message });
          this.emit('dappGenerationError', { address: options.address, slug: options.slug, error: err.message });
        } catch (_) {}
      });
    } else {
      trackMatomoEvent(this, { category: 'quick-dapp-v2', action: 'generate', name: 'start', isClick: true });
      this.processGeneration(options).catch(err => {
        console.error('[AI-DAPP] processGeneration crashed:', err);
        try {
          this.call('terminal', 'log', { type: 'error', value: err.message });
          this.emit('dappGenerationError', { address: options.address, slug: options.slug, error: err.message });
        } catch (_) {}
      });
    }

    return;
  }

  private async processFigmaGeneration(options: GenerateDappOptions & { slug: string }) {

    trackMatomoEvent(this, { category: 'quick-dapp-v2', action: 'generate_figma', name: 'start', isClick: true });
    await this.call('notification', 'toast', 'Analyzing Figma Design... (This may take time)')
    this.emit('generationProgress', { status: 'preparing', address: options.address, slug: options.slug })

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
      // const FIGMA_BACKEND_URL = "http://localhost:4000/figma/generate";
      const FIGMA_BACKEND_URL = "https://quickdapp-figma.api.remix.live/generate";

      this.emit('generationProgress', { status: 'calling_llm', address: options.address, slug: options.slug })
      const { content: htmlContent, meta: figmaMeta } = await this.callFigmaAPI(FIGMA_BACKEND_URL, {
        figmaToken: options.figmaToken,
        figmaUrl: options.figmaUrl,
        userPrompt: options.description,
        contractInfo: contractInfo,
        isBaseMiniApp: options.isBaseMiniApp,
        systemPrompt,
      });

      const duration = (Date.now() - startTime) / 1000;

      const pages = parsePages(htmlContent);
      this.emit('generationProgress', { status: 'parsing', address: options.address, slug: options.slug, fileCount: Object.keys(pages).length })

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

      this.pendingResults.set(options.slug, { address: options.address, content: pages, isUpdate: false })
      try {
        this.emit('dappGenerated', {
          address: options.address,
          slug: options.slug,
          content: pages,
          isUpdate: false
        });
      } catch (_) {}

      trackMatomoEvent(this, { category: 'quick-dapp-v2', action: 'generate_figma', name: 'success', isClick: false });

      if (figmaMeta?.usage) {
        const usage = figmaMeta.usage;
        let userId: string | undefined;
        if (typeof window !== 'undefined' && window.localStorage) {
          try {
            const user = JSON.parse(window.localStorage.getItem('remix_user') || '');
            userId = user.sub || user.id;
          } catch (_) {}
        }
        if (!userId && typeof window !== 'undefined' && window.sessionStorage) {
          userId = window.sessionStorage.getItem('remix_random_session_id') || undefined;
        }

        const eventLog = [
          `provider:fireworks-figma`,
          `prompt_tokens:${usage.prompt_tokens || 0}`,
          `completion_tokens:${usage.completion_tokens || 0}`,
          `total_tokens:${usage.total_tokens || 0}`,
          `usage_source:${usage.source || 'unknown'}`,
          `userId:${userId}`
        ].filter(Boolean).join('|');

        trackMatomoEvent(this, {
          category: 'quick-dapp-v2',
          action: 'ai_usage',
          name: `token_usage|${eventLog}`,
          isClick: false
        });
      }

      try {
        await this.call('notification', 'toast', 'Figma Design Imported Successfully!');
      } catch (_) {}

    } catch (error: any) {
      trackMatomoEvent(this, { category: 'quick-dapp-v2', action: 'error', name: 'figma_failed', isClick: false });
      console.error('[AI-DAPP] Figma Generation Failed:', error);
      try { this.call('terminal', 'log', { type: 'error', value: error.message }); } catch (_) {}
      try {
        this.emit('dappGenerationError', {
          address: options.address,
          slug: options.slug,
          error: error.message
        });
      } catch (_) {}
    }
  }

  private async callFigmaAPI(url: string, payload: any): Promise<{ content: string; meta?: any }> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Figma Backend Error: ${errText}`)
      }

      // Detect response type: SSE stream or legacy JSON
      const contentType = response.headers.get('content-type') || '';
      let json: any = null;

      if (contentType.includes('text/event-stream')) {
        // Parse SSE stream from backend
        if (!response.body) throw new Error('Response body is null');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        let reading = true;

        while (reading) {
          const { done, value } = await reader.read();
          if (done) { reading = false; break; }
          sseBuffer += decoder.decode(value, { stream: true });

          const events = sseBuffer.split('\n\n');
          sseBuffer = events.pop() || '';

          for (const event of events) {
            if (!event.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(event.slice(6));
              if (data.type === 'file_start') {
                console.log(`[AI-DAPP] 📄 Figma generating: ${data.filename}`);
                this.emit('generationProgress', {
                  status: 'generating_file',
                  filename: data.filename
                });
              } else if (data.type === 'done') {
                json = data;
              } else if (data.type === 'error') {
                throw new Error(data.error || 'Figma backend stream error');
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      } else {
        // Legacy JSON response (production backend without SSE)
        json = await response.json();
        console.log('[AI-DAPP] Using legacy Figma JSON response (no SSE)');
      }

      if (!json) throw new Error('No response received from Figma backend');
      return { content: json.content, meta: json.meta };

    } catch (error) {
      console.error('[AI-DAPP] Figma API Call Failed:', error);
      throw error;
    }
  }

  private async processGeneration(options: GenerateDappOptions & { slug: string }) {
    try {
      const hasImage = !!options.image;

      this.call('notification', 'toast', 'Generating... (Logs in console)').catch(() => {})
      this.emit('generationProgress', { status: 'preparing', address: options.address, slug: options.slug })

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

      this.emit('generationProgress', { status: 'calling_llm', address: options.address, slug: options.slug })
      const htmlContent = await this.callLLMAPI(messagesToSend, systemPrompt, hasImage);

      const duration = (Date.now() - startTime) / 1000;

      let pages = parsePages(htmlContent);

      this.emit('generationProgress', { status: 'parsing', address: options.address, slug: options.slug, fileCount: Object.keys(pages).length })

      if (Object.keys(pages).length === 0) {
        console.error('[AI-DAPP] parsePages returned empty object. Response length:', htmlContent?.length);
        throw new Error("AI generated empty content. Please try again.");
      }

      this.emit('generationProgress', { status: 'validating', address: options.address, slug: options.slug })
      pages = await this.validateAndRetryMissingFiles(
        pages, htmlContent, messagesToSend, systemPrompt, hasImage
      );

      context.messages = [
        { role: 'user', content: userMessage },
        { role: 'assistant', content: htmlContent }
      ]
      this.saveContext(options.address, context)

      // Store result BEFORE emit — ensures recovery even if event is lost
      this.pendingResults.set(options.slug, { address: options.address, content: pages, isUpdate: false })
      try {
        this.emit('dappGenerated', {
          address: options.address,
          slug: options.slug,
          content: pages,
          isUpdate: false
        });
      } catch (_) {}

      trackMatomoEvent(this, { category: 'quick-dapp-v2', action: 'generate', name: 'success', isClick: false });
      try {
        await this.call('notification', 'toast', 'Generation Complete!');
      } catch (_) {}

    } catch (error: any) {
      trackMatomoEvent(this, { category: 'quick-dapp-v2', action: 'error', name: 'generate_failed', isClick: false });
      console.error('[AI-DAPP] Generation Failed:', error);
      try { this.call('terminal', 'log', { type: 'error', value: error.message }); } catch (_) {}
      try {
        this.emit('dappGenerationError', {
          address: options.address,
          slug: options.slug,
          error: error.message
        });
      } catch (_) {}
    }
  }

  /**
   * Update an existing DApp with new description
   */
  async updateDapp(address: string, description: string | any[], currentFiles: any, hasImage: boolean, slug: string, abi?: any[], chainId?: string | number): Promise<void> {

    this.processUpdate(address, description, currentFiles, hasImage, slug, abi || [], chainId || 1).catch(err => {
      console.error("[DEBUG-AI] ❌ Background update crashed:", err);
      this.call('terminal', 'log', { type: 'error', value: err.message });
    });

    return;
  }

  private async processUpdate(address: string, description: string | any[], currentFiles: any, hasImage: boolean, slug: string, abi: any[] = [], chainId: string | number = 1) {
    const ctx: PromptContext = {
      contract: { address, abi, chainId },
      isUpdate: true,
      hasImage,
    }
    const systemPrompt = buildSystemPrompt(ctx)

    this.emit('generationProgress', { status: 'preparing', address, slug })

    const msgOptions: BuildUserMessageOptions = {
      description,
      currentFiles,
    }
    const userMessage = buildUserMessage(ctx, msgOptions)

    // Send only the current request — no history needed since currentFiles
    // already contains the full project state for every update.
    const messages = [{ role: 'user', content: userMessage }];

    try {
      this.emit('generationProgress', { status: 'calling_llm', address, slug })
      const htmlContent = await this.callLLMAPI(messages, systemPrompt, hasImage, true);

      const patchedPages = parsePages(htmlContent);
      this.emit('generationProgress', { status: 'parsing', address, slug, fileCount: Object.keys(patchedPages).length })

      if (Object.keys(patchedPages).length === 0) {
        throw new Error("AI failed to return valid file structure.");
      }

      // Normalize all paths: strip leading '/' to match parsePages output
      const normalizeKey = (k: string) => k.startsWith('/') ? k.substring(1) : k;

      const normalizedCurrent: Record<string, string> = {};
      for (const [file, content] of Object.entries(currentFiles)) {
        normalizedCurrent[normalizeKey(file)] = content as string;
      }

      // Merge: current (normalized) + patched (already normalized by parsePages)
      const mergedPages: Record<string, string> = { ...normalizedCurrent };
      for (const [file, content] of Object.entries(patchedPages)) {
        mergedPages[normalizeKey(file)] = content;
      }

      // Detect missing imports: files referenced via import but not in mergedPages
      const missingImports = findMissingImports(mergedPages);
      if (missingImports.length > 0) {
        this.emit('generationProgress', { status: 'validating', address, slug, missingFiles: missingImports })
        try {
          const retryMessages = [
            ...messages,
            { role: 'assistant', content: htmlContent },
            {
              role: 'user',
              content: `The following files are imported in the code but were not included in your response:\n${missingImports.map(f => `- ${f}`).join('\n')}\n\nPlease generate ONLY these missing files using the START_TITLE format. Do not regenerate files that were already provided.`
            }
          ];
          const additionalContent = await this.callLLMAPI(retryMessages, systemPrompt, false, true);
          const additionalPages = parsePages(additionalContent);
          for (const [file, content] of Object.entries(additionalPages)) {
            mergedPages[normalizeKey(file)] = content;
          }
        } catch (retryErr: any) {
          console.warn('[AI-DAPP] Retry for missing imports failed:', retryErr.message);
        }
      }

      this.pendingResults.set(slug, { address, content: mergedPages, isUpdate: true })
      try {
        this.emit('dappGenerated', {
          address,
          slug,
          content: mergedPages,
          isUpdate: true
        });
      } catch (_) {}

    } catch (error: any) {
      console.error('[AI-DAPP] Update failed:', error);
      try { this.call('terminal', 'log', { type: 'error', value: `Update failed: ${error.message}` }); } catch (_) {}
      try {
        this.emit('dappGenerationError', {
          address,
          slug,
          error: error.message || "Unknown error during generation"
        });
      } catch (_) {}
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

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Accept": "application/json",
      "Content-Type": "application/json"
    }
    if (typeof localStorage !== 'undefined') {
      const token = localStorage.getItem('remix_access_token')
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    }
    return headers
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

  private async callLLMAPI(messages: any[], systemPrompt: string, hasImage: boolean = false, isUpdate: boolean = false): Promise<string> {
    const BACKEND_URL = "https://quickdapp-ai.api.remix.live/generate"
    // const BACKEND_URL = "http://localhost:4000/dapp-generator/generate"

    try {
      console.log('[AI-DAPP] Calling LLM API', { isUpdate, hasImage, messageCount: messages.length + systemPrompt.length });

      const response = await fetch(BACKEND_URL, {
        method: "POST",
        headers: this.getAuthHeaders(),
        body: JSON.stringify({
          messages,
          systemPrompt,
          hasImage,
          isUpdate
        }),
      });

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Backend Error: ${errText}`)
      }

      // Detect response type: SSE stream or legacy JSON
      const contentType = response.headers.get('content-type') || '';
      let json: any = null;

      if (contentType.includes('text/event-stream')) {
        // Parse SSE stream from backend
        if (!response.body) throw new Error('Response body is null');
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';
        let reading = true;

        while (reading) {
          const { done, value } = await reader.read();
          if (done) { reading = false; break; }
          sseBuffer += decoder.decode(value, { stream: true });

          // SSE events are separated by \n\n
          const events = sseBuffer.split('\n\n');
          sseBuffer = events.pop() || ''; // keep incomplete event

          for (const event of events) {
            if (!event.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(event.slice(6));
              if (data.type === 'file_start') {
                console.log(`[AI-DAPP] 📄 Generating: ${data.filename}`);
                this.emit('generationProgress', {
                  status: 'generating_file',
                  filename: data.filename
                });
              } else if (data.type === 'done') {
                json = data;
              } else if (data.type === 'error') {
                throw new Error(data.error || 'Backend stream error');
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue; // skip malformed JSON
              throw e;
            }
          }
        }
      } else {
        // Legacy JSON response (production backend without SSE)
        json = await response.json();
        console.log('[AI-DAPP] Using legacy JSON response (no SSE)');
      }

      if (!json) throw new Error('No response received from backend');

      const usage = json.meta?.usage;
      const promptTokens = usage?.prompt_tokens ?? Math.ceil(systemPrompt.length / 4);
      const completionTokens = usage?.completion_tokens ?? Math.ceil((json?.content?.length || 0) / 4);
      const totalTokens = usage?.total_tokens ?? (promptTokens + completionTokens);
      const usageSource = usage?.source || 'estimated';

      console.log('[AI-DAPP] ┌─ TOKEN USAGE ─────────────────');
      console.log('[AI-DAPP] │ Backend meta:', JSON.stringify(json.meta, null, 2));
      console.log(`[AI-DAPP] │ Source: ${usageSource}`);
      console.log(`[AI-DAPP] │ Prompt tokens: ${promptTokens}`);
      console.log(`[AI-DAPP] │ Completion tokens: ${completionTokens}`);
      console.log(`[AI-DAPP] │ Total tokens: ${totalTokens}`);
      console.log('[AI-DAPP] └──────────────────────────────');

      let userId: string | undefined;
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const userStr = window.localStorage?.getItem('remix_user');
        if (userStr) {
          try {
            const user = JSON.parse(userStr);
            userId = user.sub || user.id;
          } catch (e) {
          }
        }

        // If no user ID, create or retrieve a random session ID
        if (!userId) {
          let sessionId = window.sessionStorage.getItem('remix_random_session_id');
          if (!sessionId) {
            sessionId = `random_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
            window.sessionStorage.setItem('remix_random_session_id', sessionId);
          }
          userId = sessionId;
        }
      }

      const eventLog = [
        `provider:fireworks-custom-llm`,
        `prompt_tokens:${promptTokens}`,
        `completion_tokens:${completionTokens}`,
        `total_tokens:${totalTokens}`,
        `model:${json.meta?.model || 'unknown'}`,
        `usage_source:${usageSource}`,
        `userId:${userId}`
      ].filter(Boolean).join('|')

      trackMatomoEvent(this, {
        category: 'quick-dapp-v2',
        action: 'ai_usage',
        name: `token_usage|${eventLog}`,
        isClick: false
      });
      return json.content;

    } catch (error: any) {
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

/**
 * Scan all JS/JSX/TS/TSX files for relative imports and find ones that
 * point to files not present in the file set.
 */
const findMissingImports = (pages: Record<string, string>): string[] => {
  const allFiles = new Set(Object.keys(pages).map(f =>
    f.startsWith('/') ? f : '/' + f
  ));
  const missing: string[] = [];

  for (const [filename, content] of Object.entries(pages)) {
    if (!filename.match(/\.(js|jsx|ts|tsx)$/)) continue;

    // Match: import ... from './path' or require('./path')
    const importRegex = /(?:import\s+[\s\S]*?\s+from\s+['"]|require\s*\(\s*['"])(\.\.?\/[^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      const fileDir = '/' + filename.replace(/\\/g, '/').replace(/[^/]+$/, '');
      const resolved = resolveRelativePath(fileDir, importPath);

      // Try with common extensions
      const candidates = [resolved, resolved + '.jsx', resolved + '.js', resolved + '.tsx', resolved + '.ts'];
      if (!candidates.some(c => allFiles.has(c))) {
        missing.push(resolved);
      }
    }
  }
  return [...new Set(missing)];
}

/** Resolve a relative path against a directory */
const resolveRelativePath = (base: string, relative: string): string => {
  const parts = base.split('/').filter(Boolean);
  for (const part of relative.split('/')) {
    if (part === '..') parts.pop();
    else if (part !== '.') parts.push(part);
  }
  return '/' + parts.join('/');
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
