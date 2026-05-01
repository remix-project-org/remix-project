/**
 * X402 Dynamic Endpoint Tool Handlers for Remix MCP Server
 * Dynamically creates MCP tools based on x402 endpoint configurations
 * Uses official @x402/fetch library for proper x402 protocol compliance
 */

import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import {
  ToolCategory,
  RemixToolDefinition
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';
import { X402EndpointConfig, X402WalletConfig } from '../types/mcpConfig';
import { privateKeyToAccount } from 'viem/accounts';
import { x402Client, x402HTTPClient } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { UptoEvmScheme } from "@x402/evm/upto/client";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { createKeyPairSignerFromBytes } from "@solana/kit";
import { base58 } from "@scure/base";

/**
 * X402 Dynamic Endpoint Tool Handler
 * Creates a tool handler for each configured x402 endpoint
 */
export class X402EndpointHandler extends BaseToolHandler {
  name: string;
  description: string;
  inputSchema: any;
  private endpointConfig: X402EndpointConfig;
  private walletConfig?: X402WalletConfig;

  constructor(config: X402EndpointConfig, walletConfig?: X402WalletConfig) {
    super();
    this.endpointConfig = config;
    this.walletConfig = walletConfig;
    this.name = `x402_${config.id}`;
    this.description = config.description;
    this.inputSchema = this.generateInputSchema(config);
  }

  private generateInputSchema(config: X402EndpointConfig): any {
    const properties: any = {};
    const required: string[] = [];

    if (config.parameters) {
      for (const [paramName, paramConfig] of Object.entries(config.parameters)) {
        properties[paramName] = {
          type: paramConfig.type,
          description: paramConfig.description
        };

        if (paramConfig.default !== undefined) {
          properties[paramName].default = paramConfig.default;
        }

        if (paramConfig.enum) {
          properties[paramName].enum = paramConfig.enum;
        }

        if (paramConfig.pattern && paramConfig.type === 'string') {
          properties[paramName].pattern = paramConfig.pattern;
        }

        if (paramConfig.required) {
          required.push(paramName);
        }
      }
    }

    return {
      type: 'object',
      properties,
      required
    };
  }

  getPermissions(): string[] {
    return this.endpointConfig.permissions || ['x402:call'];
  }

  validate(args: any): boolean | string {
    if (!this.endpointConfig.parameters) {
      return true;
    }

    const required = Object.entries(this.endpointConfig.parameters)
      .filter(([_, config]) => config.required)
      .map(([name, _]) => name);

    const requiredValidation = this.validateRequired(args, required);
    if (requiredValidation !== true) return requiredValidation;

    const typeMap: Record<string, string> = {};
    for (const [paramName, paramConfig] of Object.entries(this.endpointConfig.parameters)) {
      typeMap[paramName] = paramConfig.type;
    }

    const typesValidation = this.validateTypes(args, typeMap);
    if (typesValidation !== true) return typesValidation;

    for (const [paramName, paramConfig] of Object.entries(this.endpointConfig.parameters)) {
      const value = args[paramName];

      if (value !== undefined && paramConfig.enum && !paramConfig.enum.includes(value)) {
        return `Parameter '${paramName}' must be one of: ${paramConfig.enum.join(', ')}`;
      }

      if (value !== undefined && paramConfig.pattern && typeof value === 'string') {
        const regex = new RegExp(paramConfig.pattern);
        if (!regex.test(value)) {
          return `Parameter '${paramName}' does not match required pattern: ${paramConfig.pattern}`;
        }
      }
    }

    return true;
  }

  async execute(args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const requestData = {
        endpoint: this.endpointConfig.endpoint,
        title: this.endpointConfig.title,
        parameters: args,
        timestamp: new Date().toISOString()
      };

      return await this.executeWithX402Client(requestData, plugin);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.createErrorResult(`X402 endpoint execution failed: ${errorMessage}`);
    }
  }

  /**
   * Execute using official @x402/fetch client
   */
  private async executeWithX402Client(requestData: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Initialize x402 client with wallet configuration
      const fetchWithPayment = await this.initializeX402Client();

      plugin.call('notification', 'toast', `Making x402 request to ${this.endpointConfig.title}...`);

      // Make request with automatic payment handling
      const response = await fetchWithPayment(this.endpointConfig.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Remix-IDE-MCP/1.0',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        return this.createErrorResult(
          `X402 endpoint call failed: ${response.status} ${response.statusText}. ${errorText}`
        );
      }

      const result = await response.json();

      // Extract payment information using x402HTTPClient
      const x402HttpClient = new x402HTTPClient(new x402Client());
      const paymentResponse = x402HttpClient.getPaymentSettleResponse((name: string) =>
        response.headers.get(name)
      );

      if (paymentResponse) {
        plugin.call('notification', 'toast', 
          `✅ Payment completed for ${this.endpointConfig.title}`
        );
      }

      return this.createSuccessResult({
        success: true,
        endpoint: this.endpointConfig.endpoint,
        title: this.endpointConfig.title,
        result: result,
        timestamp: new Date().toISOString(),
        paymentResponse: paymentResponse
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Handle payment-specific errors
      if (errorMessage.includes('insufficient funds') || errorMessage.includes('payment failed')) {
        plugin.call('notification', 'toast', `❌ Payment failed: ${errorMessage}`);
        return this.createErrorResult(`Payment failed: ${errorMessage}`);
      }

      return this.createErrorResult(`X402 client execution failed: ${errorMessage}`);
    }
  }


  /**
   * Initialize x402 client with wallet configuration
   */
  private async initializeX402Client(): Promise<(url: string, init?: RequestInit) => Promise<Response>> {
    const { wrapFetchWithPayment } = await import("@x402/fetch");
    const { ExactEvmScheme, UptoEvmScheme } = await import("@x402/evm/exact/client");
    const { ExactSvmScheme } = await import("@x402/svm/exact/client");

    const client = new x402Client();

    // Setup EVM schemes if configured
    if (this.walletConfig?.evmPrivateKey) {
      const evmSigner = privateKeyToAccount(this.walletConfig.evmPrivateKey as `0x${string}`);
      const rpcOptions = this.walletConfig.evmRpcUrl ? { rpcUrl: this.walletConfig.evmRpcUrl } : undefined;
      
      client.register("eip155:*", new ExactEvmScheme(evmSigner, rpcOptions));
      client.register("eip155:*", new UptoEvmScheme(evmSigner, rpcOptions));
    }

    // Setup SVM schemes if configured
    if (this.walletConfig?.svmPrivateKey) {
      const { createKeyPairSignerFromBytes } = await import("@solana/kit");
      const { base58 } = await import("@scure/base");
      
      const svmSigner = await createKeyPairSignerFromBytes(base58.decode(this.walletConfig.svmPrivateKey));
      client.register("solana:*", new ExactSvmScheme(svmSigner));
    }

    return wrapFetchWithPayment(fetch, client);
  }



}

/**
 * X402 Endpoint Manager
 * Manages the lifecycle of x402 endpoint handlers
 */
export class X402EndpointManager {
  private handlers: Map<string, X402EndpointHandler> = new Map();
  private walletConfig?: X402WalletConfig;

  /**
   * Set wallet configuration for all x402 endpoints
   */
  setWalletConfig(walletConfig: X402WalletConfig): void {
    this.walletConfig = walletConfig;
  }

  /**
   * Create tool definitions from x402 endpoint configurations
   */
  createX402Tools(endpoints: X402EndpointConfig[], walletConfig?: X402WalletConfig): RemixToolDefinition[] {
    const tools: RemixToolDefinition[] = [];
    this.handlers.clear();

    // Update wallet config if provided
    if (walletConfig) {
      this.walletConfig = walletConfig;
    }

    for (const endpoint of endpoints) {
      if (endpoint.enabled !== false) {
        const handler = new X402EndpointHandler(endpoint, this.walletConfig);
        this.handlers.set(endpoint.id, handler);

        const description = endpoint.requiresPayment 
          ? `X402 Payment Required: ${endpoint.description}` 
          : `X402: ${endpoint.description}`;

        tools.push({
          name: `x402_${endpoint.id}`,
          description: description,
          inputSchema: handler.inputSchema,
          category: ToolCategory.X402,
          permissions: handler.getPermissions(),
          handler: handler
        });
      }
    }

    return tools;
  }

  /**
   * Get a specific handler by endpoint ID
   */
  getHandler(endpointId: string): X402EndpointHandler | undefined {
    return this.handlers.get(endpointId);
  }

  /**
   * Get all active handlers
   */
  getAllHandlers(): X402EndpointHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Remove a handler by endpoint ID
   */
  removeHandler(endpointId: string): boolean {
    return this.handlers.delete(endpointId);
  }

  /**
   * Clear all handlers
   */
  clearHandlers(): void {
    this.handlers.clear();
  }
}