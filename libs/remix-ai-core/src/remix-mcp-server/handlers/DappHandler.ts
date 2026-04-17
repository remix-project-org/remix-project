/**
 * DApp Management Tool Handlers for Remix MCP Server
 *
 * Provides tools for creating, updating, listing, and navigating QuickDapp V2 DApps
 * through the Remix AI Assistant chat interface.
 */

import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import {
  ToolCategory,
  RemixToolDefinition,
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';

/**
 * Create DApp Tool Handler
 *
 * Creates a new DApp from a deployed contract. This wraps `quick-dapp-v2.createDapp()`.
 * The AI should collect contract info (via get_deployed_contracts) BEFORE calling this tool.
 */
export class DappCreateHandler extends BaseToolHandler {
  name = 'dapp_create';
  description = 'Create a new DApp frontend from a deployed smart contract. IMPORTANT: Before calling this tool, you MUST first: 1) Use get_deployed_contracts to find which contract to use — if multiple contracts are deployed, ask the user which one. 2) Ask the user to describe the desired DApp design. 3) Ask if they have a Figma URL (optional). 4) Ask if they want a Base Mini App (optional). Only call this tool AFTER collecting all preferences from the user.';
  inputSchema = {
    type: 'object',
    properties: {
      contractName: {
        type: 'string',
        description: 'Name of the deployed contract'
      },
      address: {
        type: 'string',
        description: 'Deployed contract address (0x...)',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      abi: {
        type: 'array',
        description: 'Contract ABI',
        items: { type: 'object' }
      },
      chainId: {
        type: ['string', 'number'],
        description: 'Network chain ID where the contract is deployed'
      },
      description: {
        type: 'string',
        description: 'Description of the desired DApp design and functionality (e.g., "dark theme token transfer page")'
      },
      isBaseMiniApp: {
        type: 'boolean',
        description: 'Whether to create as a Coinbase Base Mini App (includes Farcaster Frame support)',
        default: false
      },
      figmaUrl: {
        type: 'string',
        description: 'Figma design file URL (optional, must contain ?node-id=...)'
      },
      figmaToken: {
        type: 'string',
        description: 'Figma Personal Access Token (required if figmaUrl is provided)'
      }
    },
    required: []
  };

  getPermissions(): string[] {
    return ['dapp:create'];
  }

  validate(args: any): boolean | string {
    // Phase 1: contractName not provided → will enter discovery mode in execute()
    if (!args.contractName) {
      return true;
    }

    // Phase 2: full creation — validate all required fields
    const required = this.validateRequired(args, ['contractName', 'address', 'abi', 'chainId', 'description']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      contractName: 'string',
      address: 'string',
      description: 'string',
    });
    if (types !== true) return types;

    if (!args.address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid contract address format';
    }

    if (!Array.isArray(args.abi)) {
      return 'ABI must be an array';
    }

    if (args.figmaUrl && !args.figmaToken) {
      return 'Figma token is required when using a Figma URL';
    }

    return true;
  }

  async execute(args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // ─── Phase 1: Discovery ───
      // If contractName is not provided, fetch deployed contracts and
      // return them so the AI can ask the user which one + collect preferences.
      if (!args.contractName) {
        let contracts: any[] = [];
        try {
          contracts = await plugin.call('udapp' as any, 'getDeployedContracts') || [];
        } catch (e) {
          contracts = [];
        }

        if (contracts.length === 0) {
          return this.createSuccessResult({
            status: 'needs_user_input',
            message: 'No deployed contracts found.',
            nextSteps: [
              '1. Ask the user which Solidity file to compile (or use compile_solidity on the current file)',
              '2. Deploy the compiled contract using deploy_contract',
              '3. Then call dapp_create again'
            ]
          });
        }

        const contractSummary = contracts.map((c: any, i: number) => ({
          index: i + 1,
          name: c.name || c.contractName || 'Unknown',
          address: c.address,
          chainId: c.chainId
        }));

        return this.createSuccessResult({
          status: 'needs_user_input',
          deployedContracts: contractSummary,
          message: 'Found deployed contracts. Before creating the DApp, you MUST ask the user the following:',
          requiredQuestions: [
            '1. Which contract to use? (show the list above and let the user pick)',
            '2. How should the DApp look? Ask for a design description from the user.',
            '3. Do they have a Figma URL? (optional) — if yes, also ask for a Figma Personal Access Token.',
            '4. Should it be a Base Mini App with Coinbase SDK? (optional)'
          ],
          instruction: 'Present these questions to the user ONE BY ONE. After collecting all answers, call dapp_create again with ALL fields filled in: contractName, address, abi, chainId, description, and optionally figmaUrl/figmaToken/isBaseMiniApp.'
        });
      }

      // ─── Phase 2: Actual Creation ───
      // Activate QuickDapp if not already active
      try {
        await plugin.call('manager' as any, 'activatePlugin', 'quick-dapp-v2');
      } catch (e) {
        // may already be active
      }

      // Build the payload matching quick-dapp-v2.createDapp() expectations
      console.log('[DappHandler.dapp_create] Creating DApp with chainId:', args.chainId, 'address:', args.address, 'contractName:', args.contractName);
      const payload: any = {
        contractName: args.contractName,
        address: args.address,
        abi: args.abi,
        chainId: args.chainId,
        description: args.description,
        isBaseMiniApp: args.isBaseMiniApp || false,
      };

      if (args.figmaUrl) {
        payload.figmaUrl = args.figmaUrl;
        payload.figmaToken = args.figmaToken;
      }

      // Call createDapp — this triggers the AI generation pipeline internally
      await plugin.call('quick-dapp-v2' as any, 'createDapp', payload);

      // Focus the QuickDapp tab so the user can see the preview
      try {
        await plugin.call('tabs' as any, 'focus', 'quick-dapp-v2');
      } catch (e) {
        // tab focus is best-effort
      }

      return this.createSuccessResult({
        status: 'in_progress',
        message: `DApp creation has been INITIATED for contract "${args.contractName}" (${args.address}). The AI generation is now running in the background.`,
        important: 'IMPORTANT: The DApp is still being generated asynchronously. Do NOT tell the user it is complete. Tell the user to check the QuickDapp tab and wait for the generation to finish. This may take 30-60 seconds.',
        contractName: args.contractName,
        address: args.address,
        chainId: args.chainId,
        isBaseMiniApp: args.isBaseMiniApp || false,
        hasFigma: !!args.figmaUrl,
      });
    } catch (error) {
      const msg = error.message || String(error);
      // Provide actionable guidance based on common failure modes
      if (msg.includes('not found') || msg.includes('not exist')) {
        return this.createErrorResult(
          `DApp creation failed: ${msg}\n\n` +
          `NEXT STEPS: The contract may not be compiled or deployed. ` +
          `Try: 1) compile_solidity to compile the contract, 2) deploy_contract to deploy it, then 3) retry dapp_create.`
        );
      }
      if (msg.includes('already') || msg.includes('duplicate')) {
        return this.createErrorResult(
          `DApp creation failed: ${msg}\n\n` +
          `NEXT STEPS: A DApp may already exist for this contract. Use dapp_list to check, or dapp_update to modify the existing one.`
        );
      }
      return this.createErrorResult(
        `DApp creation failed: ${msg}\n\n` +
        `NEXT STEPS: Check that the contract is compiled and deployed, then retry. If the issue persists, ask the user to check the browser console for details.`
      );
    }
  }
}

/**
 * Update DApp Tool Handler
 *
 * Updates an existing DApp with a new prompt/description.
 * The DApp must already exist and be identified by its slug.
 */
export class DappUpdateHandler extends BaseToolHandler {
  name = 'dapp_update';
  description = 'Update an existing DApp with a new description or modification request. The DApp must already exist. Provide the slug of the target DApp and a description of what to change.';
  inputSchema = {
    type: 'object',
    properties: {
      slug: {
        type: 'string',
        description: 'The unique slug identifier of the DApp to update'
      },
      prompt: {
        type: 'string',
        description: 'Description of the update/modification to apply (e.g., "change to dark mode", "add a transfer history section")'
      }
    },
    required: ['slug', 'prompt']
  };

  getPermissions(): string[] {
    return ['dapp:update'];
  }

  validate(args: any): boolean | string {
    const required = this.validateRequired(args, ['slug', 'prompt']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      slug: 'string',
      prompt: 'string',
    });
    if (types !== true) return types;

    return true;
  }

  async execute(args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Activate QuickDapp and focus it first — the update event listener
      // lives in the QuickDapp UI, so the tab must be active to receive results
      try {
        await plugin.call('manager' as any, 'activatePlugin', 'quick-dapp-v2');
        await plugin.call('tabs' as any, 'focus', 'quick-dapp-v2');
      } catch (e) {
        // best-effort
      }

      // Get DApp status to obtain address, abi, chainId, and current files
      let dappStatus: any;
      try {
        dappStatus = await plugin.call('quick-dapp-v2' as any, 'getDappStatus', args.slug);
      } catch (e) {
        return this.createErrorResult(`Could not find DApp with slug "${args.slug}". Use dapp_list to see available DApps.`);
      }

      if (!dappStatus || !dappStatus.found) {
        return this.createErrorResult(`DApp "${args.slug}" not found. Use dapp_list to see available DApps.`);
      }

      const { address, abi, chainId, files } = dappStatus;

      // Call updateDapp — the underlying ai-dapp-generator handles the LLM call
      await plugin.call(
        'quick-dapp-v2' as any,
        'updateDapp',
        args.slug,
        address,
        args.prompt,
        files,
        null, // image — not supported from AI chat yet
        abi,
        chainId
      );

      const isDeployed = dappStatus.status === 'deployed';

      return this.createSuccessResult({
        status: 'in_progress',
        message: `DApp update has been INITIATED for "${args.slug}". The AI generation is now running in the background.`,
        important: isDeployed
          ? 'IMPORTANT: The update is still being generated asynchronously. Do NOT tell the user it is complete. Also note: this DApp was previously deployed to IPFS — after the update finishes, the user will need to re-deploy from the QuickDapp tab.'
          : 'IMPORTANT: The update is still being generated asynchronously. Do NOT tell the user it is complete. Tell the user to check the QuickDapp tab and wait for the update to finish. This may take 30-60 seconds.',
        slug: args.slug,
        wasDeployed: isDeployed,
      });
    } catch (error) {
      const msg = error.message || String(error);
      if (msg.includes('not found')) {
        return this.createErrorResult(
          `DApp update failed: ${msg}\n\n` +
          `NEXT STEPS: The DApp slug may be incorrect. Use dapp_list to find the correct slug, then retry dapp_update with the correct slug.`
        );
      }
      return this.createErrorResult(
        `DApp update failed: ${msg}\n\n` +
        `NEXT STEPS: Make sure the QuickDapp tab is open (use dapp_navigate), then retry. If the issue persists, ask the user to check the browser console.`
      );
    }
  }
}

/**
 * List DApps Tool Handler
 *
 * Lists all existing DApps in the current workspace.
 */
export class DappListHandler extends BaseToolHandler {
  name = 'dapp_list';
  description = 'List all existing DApps in the current workspace. Returns their names, slugs, contract addresses, and deployment status.';
  inputSchema = {
    type: 'object',
    properties: {}
  };

  getPermissions(): string[] {
    return ['dapp:read'];
  }

  async execute(_args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      let dapps: any[];
      try {
        dapps = await plugin.call('quick-dapp-v2' as any, 'listDapps');
      } catch (e) {
        // Plugin may not be active yet
        try {
          await plugin.call('manager' as any, 'activatePlugin', 'quick-dapp-v2');
          dapps = await plugin.call('quick-dapp-v2' as any, 'listDapps');
        } catch (e2) {
          return this.createSuccessResult({
            success: true,
            dapps: [],
            count: 0,
            message: 'No DApps found. QuickDapp plugin could not be activated.'
          });
        }
      }

      return this.createSuccessResult({
        success: true,
        dapps: dapps || [],
        count: dapps?.length || 0,
        message: dapps && dapps.length > 0
          ? `Found ${dapps.length} DApp(s).`
          : 'No DApps found in the current workspace.'
      });
    } catch (error) {
      return this.createErrorResult(`Failed to list DApps: ${error.message}`);
    }
  }
}

/**
 * Open DApp Tool Handler
 *
 * Opens a specific DApp in the QuickDapp panel.
 */
export class DappOpenHandler extends BaseToolHandler {
  name = 'dapp_open';
  description = 'Open a specific DApp in the QuickDapp panel by its slug. This activates the QuickDapp tab and shows the DApp preview.';
  inputSchema = {
    type: 'object',
    properties: {
      slug: {
        type: 'string',
        description: 'The unique slug identifier of the DApp to open'
      }
    },
    required: ['slug']
  };

  getPermissions(): string[] {
    return ['dapp:read'];
  }

  validate(args: any): boolean | string {
    const required = this.validateRequired(args, ['slug']);
    if (required !== true) return required;
    return true;
  }

  async execute(args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      try {
        await plugin.call('manager' as any, 'activatePlugin', 'quick-dapp-v2');
      } catch (e) {
        // may already be active
      }

      await plugin.call('quick-dapp-v2' as any, 'openDapp', args.slug);

      try {
        await plugin.call('tabs' as any, 'focus', 'quick-dapp-v2');
        // Small delay to let the tab focus settle before returning
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (e) {
        // best-effort
      }

      return this.createSuccessResult({
        success: true,
        message: `DApp "${args.slug}" opened in QuickDapp tab.`,
        slug: args.slug,
        important: 'The QuickDapp tab is now focused and showing the DApp. Do NOT call any other tools (like file_read, file_write, etc.) that might steal focus away from the QuickDapp tab. Simply confirm to the user that the DApp is now open.',
      });
    } catch (error) {
      return this.createErrorResult(`Failed to open DApp: ${error.message}`);
    }
  }
}

/**
 * Get DApp Status Tool Handler
 *
 * Gets detailed status of a specific DApp including its config, files, and deployment status.
 */
export class DappGetStatusHandler extends BaseToolHandler {
  name = 'dapp_get_status';
  description = 'Get the status and details of a specific DApp by its slug. Returns contract info, deployment status, and current configuration.';
  inputSchema = {
    type: 'object',
    properties: {
      slug: {
        type: 'string',
        description: 'The unique slug identifier of the DApp'
      }
    },
    required: ['slug']
  };

  getPermissions(): string[] {
    return ['dapp:read'];
  }

  validate(args: any): boolean | string {
    const required = this.validateRequired(args, ['slug']);
    if (required !== true) return required;
    return true;
  }

  async execute(args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      let status: any;
      try {
        status = await plugin.call('quick-dapp-v2' as any, 'getDappStatus', args.slug);
      } catch (e) {
        try {
          await plugin.call('manager' as any, 'activatePlugin', 'quick-dapp-v2');
          status = await plugin.call('quick-dapp-v2' as any, 'getDappStatus', args.slug);
        } catch (e2) {
          return this.createErrorResult(`DApp "${args.slug}" not found.`);
        }
      }

      if (!status || !status.found) {
        return this.createErrorResult(`DApp "${args.slug}" not found. Use dapp_list to see available DApps.`);
      }

      return this.createSuccessResult({
        success: true,
        ...status,
      });
    } catch (error) {
      return this.createErrorResult(`Failed to get DApp status: ${error.message}`);
    }
  }
}

/**
 * Navigate to QuickDapp Tab Tool Handler
 *
 * Simply focuses the QuickDapp tab. Useful when the AI wants to direct the user there.
 */
export class DappNavigateHandler extends BaseToolHandler {
  name = 'dapp_navigate';
  description = 'Navigate to the QuickDapp tab. Use this to direct the user to the QuickDapp panel for actions like IPFS deployment or ENS registration that must be performed manually.';
  inputSchema = {
    type: 'object',
    properties: {}
  };

  getPermissions(): string[] {
    return ['dapp:read'];
  }

  async execute(_args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      try {
        await plugin.call('manager' as any, 'activatePlugin', 'quick-dapp-v2');
      } catch (e) {
        // may already be active
      }

      await plugin.call('tabs' as any, 'focus', 'quick-dapp-v2');

      return this.createSuccessResult({
        success: true,
        message: 'Navigated to QuickDapp tab.',
      });
    } catch (error) {
      return this.createErrorResult(`Failed to navigate to QuickDapp tab: ${error.message}`);
    }
  }
}

/**
 * Create DApp tool definitions for registration
 */
export function createDappTools(): RemixToolDefinition[] {
  return [
    {
      name: 'dapp_create',
      description: 'Create a new DApp frontend from a deployed smart contract',
      inputSchema: new DappCreateHandler().inputSchema,
      category: ToolCategory.DAPP,
      permissions: ['dapp:create'],
      handler: new DappCreateHandler()
    },
    {
      name: 'dapp_update',
      description: 'Update an existing DApp with a modification request',
      inputSchema: new DappUpdateHandler().inputSchema,
      category: ToolCategory.DAPP,
      permissions: ['dapp:update'],
      handler: new DappUpdateHandler()
    },
    {
      name: 'dapp_list',
      description: 'List all existing DApps in the current workspace',
      inputSchema: new DappListHandler().inputSchema,
      category: ToolCategory.DAPP,
      permissions: ['dapp:read'],
      handler: new DappListHandler()
    },
    {
      name: 'dapp_open',
      description: 'Open a specific DApp in the QuickDapp panel',
      inputSchema: new DappOpenHandler().inputSchema,
      category: ToolCategory.DAPP,
      permissions: ['dapp:read'],
      handler: new DappOpenHandler()
    },
    {
      name: 'dapp_get_status',
      description: 'Get the status and details of a specific DApp',
      inputSchema: new DappGetStatusHandler().inputSchema,
      category: ToolCategory.DAPP,
      permissions: ['dapp:read'],
      handler: new DappGetStatusHandler()
    },
    {
      name: 'dapp_navigate',
      description: 'Navigate to the QuickDapp tab for manual actions like IPFS deployment or ENS registration',
      inputSchema: new DappNavigateHandler().inputSchema,
      category: ToolCategory.DAPP,
      permissions: ['dapp:read'],
      handler: new DappNavigateHandler()
    },
  ];
}
