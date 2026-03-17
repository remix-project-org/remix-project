import { IMCPToolCall, IMCPToolResult } from "../../types/mcp";

export interface IToolCallRecord {
  name: string;
  arguments: Record<string, any>;
  result: IMCPToolResult;
  executionTime: number;
}

export interface ICodeExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  executionTime: number;
  toolsCalled: string[];
  toolCallRecords: IToolCallRecord[];
  returnValue?: any;
}

export interface IExecutionContext {
  executeToolCall: (name: string, args: Record<string, any>) => Promise<IMCPToolResult>;
  console: {
    log: (...args: any[]) => void;
    error: (...args: any[]) => void;
    warn: (...args: any[]) => void;
  };
}

export class CodeExecutor {
  private executionTimeout: number = 30000; // 30 seconds default
  private toolsCalled: string[] = [];
  private toolCallRecords: IToolCallRecord[] = [];
  private consoleOutput: string[] = [];
  private pendingToolCalls: Promise<any>[] = []; // Track pending tool calls

  constructor(
    private executeToolCallback: (toolCall: IMCPToolCall) => Promise<IMCPToolResult>,
    timeout?: number
  ) {
    if (timeout) {
      this.executionTimeout = timeout;
    }
  }

  async execute(code: string): Promise<ICodeExecutionResult> {
    const startTime = Date.now();
    this.toolsCalled = [];
    this.toolCallRecords = [];
    this.consoleOutput = [];
    this.pendingToolCalls = [];

    try {
      this.validateCode(code);
      console.log('[MCP Code mode] - Executing code \n', code)
      const context = this.createExecutionContext();
      const result = await this.executeWithTimeout(code, context);

      // CRITICAL: race condition - Wait for all pending tool calls to complete before returning
      if (this.pendingToolCalls.length > 0) {
        await Promise.all(this.pendingToolCalls);
      }

      const executionTime = Date.now() - startTime;
      let payload: any;

      if (this.toolCallRecords.length > 0) {
        const errorRecords = this.toolCallRecords.filter(record => record.result?.isError);

        if (errorRecords.length > 0) {
          payload = errorRecords.map(record => ({
            tool: record.name,
            error: record.result.content
              .map((c: any) => c.text || JSON.stringify(c))
              .join('\n')
          }));
        } else if (this.toolCallRecords.length === 1) {
          // const record = this.toolCallRecords[0];
          // payload = record.result.content
          //   .map((c: any) => c.text || JSON.stringify(c))
          //   .join('\n');
          payload = result

        } else {
          // payload = this.toolCallRecords.map(record => ({
          //   tool: record.name,
          //   result: record.result.content
          //     .map((c: any) => c.text || JSON.stringify(c))
          //     .join('\n')
          // }));
          payload = result
        }
      } else {
        // No tools called
        payload = result;
      }

      return {
        success: true,
        output: this.consoleOutput.join('\n'),
        executionTime,
        toolsCalled: [...this.toolsCalled],
        toolCallRecords: [...this.toolCallRecords],
        returnValue: payload
      };

    } catch (error) {
      if (this.pendingToolCalls.length > 0) {
        await Promise.all(this.pendingToolCalls);
      }
      const executionTime = Date.now() - startTime;
      const errorMessage = error.message || String(error);

      return {
        success: false,
        output: this.consoleOutput.join('\n'),
        error: errorMessage,
        executionTime,
        toolsCalled: [...this.toolsCalled],
        toolCallRecords: [...this.toolCallRecords],
        returnValue: `Error: ${errorMessage}`
      };
    }
  }

  private validateCode(code: string): void {
    // Check for dangerous patterns
    const dangerousPatterns = [
      /\bprocess\./,
      /\b__dirname\b/,
      /\b__filename\b/,
      /\beval\s*\(/,
      /\bFunction\s*\(/,
      /\bglobal\./,
      /\bwindow\./,
      /\bdocument\./,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        throw new Error(`Code contains prohibited pattern: ${pattern.source}`);
      }
    }

    // Basic syntax validation
    if (!code.trim()) {
      throw new Error('Code cannot be empty');
    }
  }

  private createExecutionContext(): IExecutionContext {
    const self = this;

    return {
      executeToolCall: async (name: string, args: Record<string, any>) => {
        const toolStartTime = Date.now();
        self.toolsCalled.push(name);

        const toolPromise = (async () => {
          try {
            const result = await self.executeToolCallback({ name, arguments: args });
            const toolExecutionTime = Date.now() - toolStartTime;

            // refine result for double-escaped JSON and parse it once
            try {
              if (result?.content) {
                for (const contentItem of result.content) {
                  if (contentItem?.text && typeof contentItem.text === 'string') {
                    const text = contentItem.text.trim();
                    if (text.startsWith('"') && text.endsWith('"') && text.includes('\\"')) {
                      try {
                        contentItem.text = JSON.parse(text);
                      } catch (e) { // silently
                      }
                    }
                  }
                }
              }
            } catch (e) {
              console.warn(`[MCP Code mode] - Failed to parse tool output content for tool "${name}":`, e)
            }

            self.toolCallRecords.push({
              name,
              arguments: args,
              result,
              executionTime: toolExecutionTime
            });

            // Return result even if isError=true - let callMCPTool handle it
            return result;
          } catch (error) {
            // Tool execution threw an exception - record the error
            const toolExecutionTime = Date.now() - toolStartTime;
            const errorResult: IMCPToolResult = {
              content: [{
                type: 'text',
                text: `Tool execution exception: ${error.message || String(error)}`
              }],
              isError: true
            };

            self.toolCallRecords.push({
              name,
              arguments: args,
              result: errorResult,
              executionTime: toolExecutionTime
            });

            // Return error result instead of throwing - let callMCPTool check isError
            return errorResult;
          }
        })();

        self.pendingToolCalls.push(toolPromise);
        return toolPromise;
      },
      console: {
        log: (...args: any[]) => {
          self.consoleOutput.push(args.map(a => String(a)).join(' '));
        },
        error: (...args: any[]) => {
          self.consoleOutput.push('[ERROR] ' + args.map(a => String(a)).join(' '));
        },
        warn: (...args: any[]) => {
          self.consoleOutput.push('[WARN] ' + args.map(a => String(a)).join(' '));
        }
      }
    };
  }

  private async executeWithTimeout(code: string, context: IExecutionContext): Promise<any> {
    return new Promise((resolve, reject) => {
      // Set timeout
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Code execution timeout after ${this.executionTimeout}ms`));
      }, this.executionTimeout);

      const helperFunctions = `
        async function callMCPTool(name, args) {
          try {
            const result = await executeToolCall(name, args || {});

            // Stop any further execution if the tool call returned an error
            if (result && result.isError === true) {
              const errorMessage = result.content
                ? result.content.map(c => c.text || JSON.stringify(c)).join('\\n')
                : 'Tool call failed';
              throw new Error(\`MCP Tool '\${name}' failed: \${errorMessage}\`);
            }

            return result;
          } catch (error) {
            throw error;
          }
        }
      `;

      const wrappedCode = `
        ${helperFunctions}

        return (async () => {
          ${code}
        })();
      `;

      try {
        const AsyncFunction = async function () {}.constructor as any;
        const executor = new AsyncFunction(
          'executeToolCall',
          'console',
          wrappedCode
        );

        executor(
          context.executeToolCall,
          context.console
        ).then((result: any) => {
          clearTimeout(timeoutHandle);
          resolve(result);
        }).catch((error: any) => {
          clearTimeout(timeoutHandle);
          reject(error);
        });

      } catch (error) {
        clearTimeout(timeoutHandle);
        reject(error);
      }
    });
  }

  setExecutionTimeout(timeout: number): void {
    this.executionTimeout = timeout;
  }
}
