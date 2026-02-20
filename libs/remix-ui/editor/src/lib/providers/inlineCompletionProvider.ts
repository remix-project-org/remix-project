/* eslint-disable no-control-regex */
import { EditorUIProps, monacoTypes } from '@remix-ui/editor';
import { CompletionParams } from '@remix/remix-ai-core';
import { trackMatomoEvent, AIEvent, MatomoEvent } from '@remix-api'
// Do not import monaco runtime here to avoid bundling it. Use types and the injected instance instead.
import {
  AdaptiveRateLimiter,
  SmartContextDetector,
  CompletionCache,
} from '../inlineCompetionsLibs';

interface CompletionMetadata {
  text: string;
  item: monacoTypes.languages.InlineCompletion | null;
  task: string;
  displayed: boolean;
  accepted: boolean;
  acceptanceType: 'full' | 'partial' | null;
  sessionId: number;
  onAccepted: () => void;
}

export class RemixInLineCompletionProvider implements monacoTypes.languages.InlineCompletionsProvider {
  props: EditorUIProps
  monaco: any
  completionEnabled: boolean
  task: string = 'code_completion'
  trackMatomoEvent?: (event: AIEvent) => void

  private rateLimiter: AdaptiveRateLimiter;
  private contextDetector: SmartContextDetector;
  private cache: CompletionCache;
  private completionSessionId: number = 0;

  // Use WeakMap to track metadata for each completion independently
  // This prevents race conditions when multiple completions are in-flight
  private completionMetadata: WeakMap<monacoTypes.languages.InlineCompletions, CompletionMetadata>;

  // Also track by sessionId for text change listener (can't use WeakMap there)
  // Public so editor.tsx can iterate over active sessions
  public sessionMetadata: Map<number, CompletionMetadata>;

  constructor(props: any, monaco: any, trackMatomoEvent?: (event: AIEvent) => void) {
    this.props = props
    this.monaco = monaco
    this.trackMatomoEvent = trackMatomoEvent
    this.completionEnabled = true

    this.rateLimiter = new AdaptiveRateLimiter();
    this.contextDetector = new SmartContextDetector();
    this.cache = new CompletionCache();
    this.completionMetadata = new WeakMap();
    this.sessionMetadata = new Map();
  }

  // Called from external code (editor.tsx) when full completion is detected via text change
  // Monaco doesn't have a handleAccept callback, so we detect full Tab completions this way
  private handleExternalAcceptance(sessionId: number): void {
    const metadata = this.sessionMetadata.get(sessionId);
    if (!metadata) {
      return;
    }

    // Prevent duplicate tracking (in case handlePartialAccept was already called)
    if (metadata.accepted) {
      return;
    }

    metadata.accepted = true;
    metadata.acceptanceType = 'full'; // Full Tab completion

    console.log('[handleExternalAcceptance] Full completion accepted (Tab key)', {
      sessionId,
      task: metadata.task,
      rateLimiterStats: this.rateLimiter.getStats()
    });

    this.rateLimiter.trackCompletionAccepted();
  }

  async provideInlineCompletions(
    model: monacoTypes.editor.ITextModel,
    position: monacoTypes.Position,
    context: monacoTypes.languages.InlineCompletionContext,
    token: monacoTypes.CancellationToken
  ): Promise<monacoTypes.languages.InlineCompletions<monacoTypes.languages.InlineCompletion>> {

    // Check if completion is enabled
    const isActivate = await this.props.plugin.call('settings', 'get', 'settings/copilot/suggest/activate')
    if (!isActivate) {
      return { items: []};
    }

    const currentTime = Date.now();

    // Check rate limiting (bypass for Ollama since it runs locally)
    const assistantProvider = await this.props.plugin.call('remixAI', 'getAssistantProvider')
    if (assistantProvider !== 'ollama' && !this.rateLimiter.shouldAllowRequest(currentTime)) {
      return { items: []};
    }

    // Check context appropriateness
    if (!this.contextDetector.shouldShowCompletion(model, position, currentTime)) {
      return { items: []};
    }

    // Record request - only for completions that pass all checks
    this.rateLimiter.recordRequest(currentTime);

    // Create new session
    this.completionSessionId++;
    const sessionId = this.completionSessionId;

    try {
      const result = await this.executeCompletion(model, position, context, token, sessionId);
      this.rateLimiter.recordCompletion();
      return result;
    } catch (error) {
      this.rateLimiter.recordCompletion();
      return { items: []};
    }
  }

  private async executeCompletion(
    model: monacoTypes.editor.ITextModel,
    position: monacoTypes.Position,
    context: monacoTypes.languages.InlineCompletionContext,
    token: monacoTypes.CancellationToken,
    sessionId: number
  ): Promise<monacoTypes.languages.InlineCompletions<monacoTypes.languages.InlineCompletion>> {
    const getTextAtLine = (lineNumber: number) => {
      const lineRange = model.getFullModelRange().setStartPosition(lineNumber, 1).setEndPosition(lineNumber + 1, 1);
      return model.getValueInRange(lineRange);
    }

    // Get viewport-aware context (what user actually sees on screen)
    const getViewportContext = (model: monacoTypes.editor.ITextModel, position: monacoTypes.Position, editor?: monacoTypes.editor.ICodeEditor) => {
      let visibleRange = null;

      // Try to get the visible range from the editor if available
      if (editor && editor.getVisibleRanges) {
        const visibleRanges = editor.getVisibleRanges();
        if (visibleRanges && visibleRanges.length > 0) {
          visibleRange = visibleRanges[0];
        }
      }

      // Fallback: approximate visible range (about 30 lines above/below cursor)
      if (!visibleRange) {
        const approximateViewportSize = 30;
        const startLine = Math.max(1, position.lineNumber - approximateViewportSize);
        const endLine = Math.min(model.getLineCount(), position.lineNumber + approximateViewportSize);

        visibleRange = {
          startLineNumber: startLine,
          startColumn: 1,
          endLineNumber: endLine,
          endColumn: model.getLineMaxColumn(endLine)
        };
      }

      const contextBefore = model.getValueInRange({
        startLineNumber: Math.max(visibleRange.startLineNumber, 1),
        startColumn: visibleRange.startLineNumber === position.lineNumber ? 1 : 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const contextAfter = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: position.column,
        endLineNumber: Math.min(visibleRange.endLineNumber, model.getLineCount()),
        endColumn: visibleRange.endLineNumber === model.getLineCount()
          ? getTextAtLine(model.getLineCount()).length + 1
          : model.getLineMaxColumn(visibleRange.endLineNumber),
      });

      return { contextBefore, contextAfter };
    };

    // Try to get the editor instance for accurate viewport detection
    let editor = null;
    try {
      // Access the editor through Monaco's editor instances
      const editorInstances = this.monaco.editor.getEditors();
      if (editorInstances && editorInstances.length > 0) {
        // splitted editors not handled now
        editor = editorInstances.find(e => e.getModel() === model) || editorInstances[0];
      }
    } catch (e) {
      console.debug('Could not access editor instance for viewport detection:', e);
    }

    const { contextBefore, contextAfter } = getViewportContext(model, position, editor);
    const word = contextBefore;
    const word_after = contextAfter;

    // Create cache key and check cache
    const cacheKey = this.cache.createCacheKey(word, word_after, position, this.task);

    const result = await this.cache.handleRequest(cacheKey, async () => {
      return await this.performCompletion(word, word_after, position);
    });

    // Create metadata for this completion
    if (result && result.items && result.items.length > 0) {
      const firstItem = result.items[0];
      const insertText = typeof firstItem.insertText === 'string'
        ? firstItem.insertText
        : firstItem.insertText?.snippet || '';

      const metadata: CompletionMetadata = {
        text: insertText,
        item: firstItem,
        task: this.task,
        displayed: false,
        accepted: false,
        acceptanceType: null,
        sessionId,
        onAccepted: () => {
          this.handleExternalAcceptance(sessionId);
        }
      };

      this.completionMetadata.set(result, metadata);
      this.sessionMetadata.set(sessionId, metadata);
    }

    return result;
  }

  private async performCompletion(
    word: string,
    word_after: string,
    position: monacoTypes.Position
  ): Promise<monacoTypes.languages.InlineCompletions<monacoTypes.languages.InlineCompletion>> {
    // Check if we should trigger completion based on context

    // Code generation (triple slash comment)
    try {
      const split = word.split('\n')
      if (split.length >= 2) {
        const ask = split[split.length - 2].trimStart()
        if (split[split.length - 1].trim() === '' && ask.startsWith('///')) {
          return await this.handleCodeGeneration(word, word_after, position, ask);
        }
      }
    } catch (e) {
      console.warn(e)
      return { items: []}
    }

    // Code insertion (newline)
    if (word.replace(/ +$/, '').endsWith('\n')) {
      return await this.handleCodeInsertion(word, word_after, position);
    }

    // Regular code completion
    return await this.handleCodeCompletion(word, word_after, position);
  }

  private async handleCodeGeneration(
    word: string,
    word_after: string,
    position: monacoTypes.Position,
    ask: string
  ): Promise<monacoTypes.languages.InlineCompletions<monacoTypes.languages.InlineCompletion>> {
    console.log('[handleCodeGeneration] Started', { ask: ask.replace('///', '') });

    this.props.plugin.call('terminal', 'log', {
      type: 'aitypewriterwarning',
      value: 'RemixAI - generating code for following comment: ' + ask.replace('///', '')
    })

    const data = await this.props.plugin.call('remixAI', 'code_insertion', word, word_after)
    this.trackMatomoEvent?.({ category: 'ai', action: 'completion', name: 'code_generation', isClick: false })
    this.task = 'code_generation'

    const parsedData = data.trimStart()
    const item: monacoTypes.languages.InlineCompletion = {
      insertText: parsedData,
      range: new this.monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
    }

    return {
      items: [item],
      enableForwardStability: true
    }
  }

  private async handleCodeInsertion(
    word: string,
    word_after: string,
    position: monacoTypes.Position
  ): Promise<monacoTypes.languages.InlineCompletions<monacoTypes.languages.InlineCompletion>> {
    try {
      CompletionParams.stop = ['\n\n', '```']
      const output = await this.props.plugin.call('remixAI', 'code_insertion', word, word_after, CompletionParams)
      this.trackMatomoEvent?.({ category: 'ai', action: 'completion', name: 'code_insertion', isClick: false })
      const generatedText = output

      this.task = 'code_insertion'
      const item: monacoTypes.languages.InlineCompletion = {
        insertText: generatedText,
        range: new this.monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
      };

      return {
        items: [item],
        enableForwardStability: true,
      }
    } catch (err) {
      return { items: []}
    }
  }

  private async handleCodeCompletion(
    word: string,
    word_after: string,
    position: monacoTypes.Position
  ): Promise<monacoTypes.languages.InlineCompletions<monacoTypes.languages.InlineCompletion>> {
    try {
      CompletionParams.stop = ['\n', '```']
      this.task = 'code_completion'
      const output = await this.props.plugin.call('remixAI', 'code_insertion', word, word_after, CompletionParams)
      this.trackMatomoEvent?.({ category: 'ai', action: 'completion', name: 'code_completion', isClick: false })
      const generatedText = output
      let clean = generatedText

      if (generatedText.indexOf('@custom:dev-run-script./') !== -1) {
        clean = generatedText.replace('@custom:dev-run-script', '@custom:dev-run-script ')
      }
      clean = clean.replace(word, '')
      clean = this.process_completion(clean, word_after)
      const item: monacoTypes.languages.InlineCompletion = {
        insertText: clean,
        range: new this.monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
      };
      return {
        items: [item],
        enableForwardStability: true,
      }
    } catch (err) {
      const item: monacoTypes.languages.InlineCompletion = { insertText: " " }
      return {
        items: [item],
        enableForwardStability: true,
      }
    }
  }

  process_completion(data: any, word_after: any) {
    const clean = data
    // if clean starts with a comment, remove it
    if (clean.startsWith('//') || clean.startsWith('/*') || clean.startsWith('*') || clean.startsWith('*/')) {
      return ""
    }
    return clean
  }

  handleItemDidShow?(
    completions: monacoTypes.languages.InlineCompletions<monacoTypes.languages.InlineCompletion>,
    item: monacoTypes.languages.InlineCompletion,
    updatedInsertText: string
  ): void {
    const metadata = this.completionMetadata.get(completions);
    if (!metadata) {
      return;
    }

    metadata.displayed = true;

    console.log('[handleItemDidShow] Completion shown to user', {
      sessionId: metadata.sessionId,
      task: metadata.task,
      textLength: updatedInsertText.length
    });

    this.rateLimiter.trackCompletionShown()
    this.trackMatomoEvent?.({ category: 'ai', action: 'completion', name: 'code_completion_did_show', isClick: true })
  }

  // This is called when user accepts part of the completion (Ctrl+RightArrow)
  handlePartialAccept?(
    completions: monacoTypes.languages.InlineCompletions<monacoTypes.languages.InlineCompletion>,
    item: monacoTypes.languages.InlineCompletion,
    acceptedCharacters: number
  ): void {
    const metadata = this.completionMetadata.get(completions);
    if (!metadata) {
      console.log('[handlePartialAccept] No metadata found for completion');
      return;
    }

    // Prevent duplicate tracking
    if (metadata.accepted) {
      console.log('[handlePartialAccept] DUPLICATE acceptance detected - ignoring', {
        sessionId: metadata.sessionId,
        previousAcceptanceType: metadata.acceptanceType
      });
      return;
    }

    metadata.accepted = true;
    metadata.acceptanceType = 'partial';

    console.log('[handlePartialAccept] Partial completion accepted', {
      sessionId: metadata.sessionId,
      task: metadata.task,
      acceptedCharacters,
      rateLimiterStats: this.rateLimiter.getStats()
    });

    this.rateLimiter.trackCompletionAccepted()
    this.trackMatomoEvent?.({ category: 'ai', action: 'completion', name: metadata.task + '_partial_accept', isClick: true })
  }

  freeInlineCompletions(
    completions: monacoTypes.languages.InlineCompletions<monacoTypes.languages.InlineCompletion>
  ): void {
    const metadata = this.completionMetadata.get(completions);
    if (!metadata) {
      return;
    }

    setTimeout(() => {
      if (metadata.displayed && !metadata.accepted) {
        this.rateLimiter.trackCompletionRejected()
      } else if (metadata.accepted) {
        // this is already handled by the editor callback onAccepted
      } else {
      }

      this.sessionMetadata.delete(metadata.sessionId);
    }, 10); // Small delay to let text change events process
  }

  getStats() {
    return {
      rateLimiter: this.rateLimiter.getStats(),
      contextDetector: this.contextDetector.getStats(),
      cache: this.cache.getStats(),
    };
  }

  groupId?: string;
  yieldsToGroupIds?: string[];
  toString?(): string {
    throw new Error('Method not implemented.');
  }
}
