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

    try {
      this.validateCode(code);
      console.log('[MCP Code mode] - Executing code \n', code)
      const context = this.createExecutionContext();
      const result = await this.executeWithTimeout(code, context);
      const executionTime = Date.now() - startTime;

      return {
        success: true,
        output: this.consoleOutput.join('\n'),
        executionTime,
        toolsCalled: this.toolsCalled,
        toolCallRecords: this.toolCallRecords,
        returnValue: result
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        success: false,
        output: this.consoleOutput.join('\n'),
        error: error.message || String(error),
        executionTime,
        toolsCalled: this.toolsCalled,
        toolCallRecords: this.toolCallRecords
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

        const result = await self.executeToolCallback({ name, arguments: args });
        const toolExecutionTime = Date.now() - toolStartTime;

        // Record full tool call details
        self.toolCallRecords.push({
          name,
          arguments: args,
          result,
          executionTime: toolExecutionTime
        });

        return result;
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
          return await executeToolCall(name, args || {});
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
