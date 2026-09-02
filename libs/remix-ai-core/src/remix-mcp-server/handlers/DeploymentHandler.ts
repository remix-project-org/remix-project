/* eslint-disable no-async-promise-executor */
/**
 * Deployment and Contract Interaction Tool Handlers for Remix MCP Server
 */

import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import {
  ToolCategory,
  RemixToolDefinition,
  DeployContractArgs,
  CallContractArgs,
  SendTransactionArgs,
  SimulateTransactionArgs,
  DeploymentResult,
  AccountInfo,
  ContractInteractionResult,
  RunScriptArgs,
  RunScriptResult,
  AddInstanceArgs,
  AddInstanceResult
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';
import { getContractData } from '@remix-project/core-plugin'
import { remixAILogger } from '../../helpers/logger'
import type { TxResult } from '@remix-project/remix-lib';
import { BrowserProvider, formatEther } from "ethers"
import { toNumber } from 'ethers'
import { execution } from '@remix-project/remix-lib';
import { CompilerAbstract } from '@remix-project/remix-solidity';
const { txFormat, txHelper: { makeFullTypeDefinition } } = execution;

/**
 * Deploy Contract Tool Handler
 */
export class DeployContractHandler extends BaseToolHandler {
  name = 'deploy_contract';
  description = 'Deploy a compiled contract to the selected environment. Compile the file first — deployment reads the latest compilation result.';
  inputSchema = {
    type: 'object',
    properties: {
      contractName: {
        type: 'string',
        description: 'Name of the contract to deploy (the contract name, not the file name), as it appears in the compilation result'
      },
      constructorArgs: {
        type: 'array',
        description: 'Constructor arguments in declaration order. Empty when the constructor takes none.',
        items: {},
        default: []
      },
      gasLimit: {
        type: 'number',
        description: 'Gas limit for the deployment transaction. Omit to use the value set in Deploy & Run.',
        minimum: 21000
      },
      gasPrice: {
        type: 'string',
        description: 'in wei'
      },
      value: {
        type: 'string',
        description: 'ETH value to send',
        default: '0'
      },
      account: {
        type: 'string',
        description: 'Sender address to deploy from. Omit to use the account currently selected in Deploy & Run.'
      },
    },
    required: ['contractName']
  };

  getPermissions(): string[] {
    return ['deploy:contract'];
  }

  validate(args: DeployContractArgs): boolean | string {
    const required = this.validateRequired(args, ['contractName']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      contractName: 'string',
      gasLimit: 'number',
      gasPrice: 'string',
      value: 'string',
      account: 'string'
    });
    if (types !== true) return types;

    if (args.gasLimit && args.gasLimit < 21000) {
      return 'Gas limit must be at least 21000';
    }

    return true;
  }

  async execute(args: DeployContractArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Get compilation result to find contract
      const compilerArtefact = await plugin.call('compilerArtefacts', 'getCompilerAbstractByContractName', args.contractName) as CompilerAbstract;
      if (!compilerArtefact) {
        return this.createErrorResult(
          `No compilation result for '${args.contractName}'. Compile the file that defines it first (compile_solidity), then deploy. ` +
          'Note that contractName is the contract name, not the file name.'
        );
      }
      // getContractData dereferences the lookup result unguarded, so a name
      // that is not in this artefact used to surface as a TypeError.
      let data: ReturnType<typeof getContractData>
      try {
        data = getContractData(args.contractName, compilerArtefact)
      } catch {
        data = null
      }
      if (!data) {
        return this.createErrorResult(`'${args.contractName}' was not found in the latest compilation. Compile it first, then deploy.`);
      }

      // Honour the requested sender — it was accepted in the schema and then
      // ignored, so deployments silently went out from the selected account.
      if (args.account) {
        try {
          await plugin.call('udapp' as any, 'setAccount', args.account)
        } catch (e) {
          return this.createErrorResult(`Could not select account '${args.account}': ${(e as any)?.message || e}`)
        }
      }

      await plugin.call('sidePanel', 'showContent', 'udapp' )
      plugin.emit('setValueRequest', args.value || '0', 'wei')
      if (args.value && args.value !== '0') {
        plugin.call('notification', 'toast', `Value of ${formatEther(args.value)} ETH will be sent with the deployment`)
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait a moment for the toast to be seen
      }

      let txReturn
      try {
        txReturn = await plugin.call('blockchain', 'deployContractAndLibraries',
          data,
          args.constructorArgs ? args.constructorArgs : [],
          null,
          // blockchain reads `compilerContracts?.data?.contracts`, so this must
          // be the CompilerAbstract itself (same value the Deploy & Run panel
          // passes). Handing it the already-drilled `.getData().contracts` left
          // library linking with no compilation data, so every contract that
          // links a library failed with 'Cannot find compilation data of library'.
          compilerArtefact
        )
      } catch (e) {
        return this.createErrorResult(`Deployment error: ${e.message || e}`)
      }

      const receipt = txReturn?.txResult?.receipt
      if (!receipt) {
        return this.createErrorResult('Deployment returned no transaction receipt — the transaction may not have been sent.')
      }
      const result: DeploymentResult = {
        transactionHash: receipt.hash,
        gasUsed: toNumber(receipt.gasUsed),
        effectiveGasPrice: args.gasPrice || '20000000000',
        blockNumber: toNumber(receipt.blockNumber),
        logs: receipt.logs,
        contractAddress: receipt.contractAddress || txReturn.address,
        success: receipt.status === 1 ? true : false
      }
      // Registering the instance in the UI must not turn a successful
      // deployment into a failed tool call (it also used to float an
      // unhandled rejection when the panel was not active).
      try {
        await plugin.call('udappDeployedContracts', 'addInstance', result.contractAddress, data.abi, args.contractName, data)
      } catch (e) {
        remixAILogger.warn('[DeployContractHandler] addInstance failed after a successful deployment', e)
      }

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`Deployment failed: ${error.message}`);
    }
  }
}

/** Parse an ABI that arrived as a JSON string; returns null when it is not a usable array. */
function coerceAbi(abi: any): any[] | null {
  if (Array.isArray(abi)) return abi;
  if (typeof abi === 'string' && abi.trim()) {
    try {
      const parsed = JSON.parse(abi);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * The ABI for a contract the IDE already knows about.
 */
async function resolveContractAbi(
  plugin: Plugin,
  args: { abi?: any; address?: string; contractName?: string }
): Promise<{ abi?: any[]; error?: string }> {
  const supplied = coerceAbi(args.abi);
  if (supplied) return { abi: supplied };
  if (args.abi !== undefined && args.abi !== null) {
    return { error: 'ABI must be an array (or a JSON string holding one)' };
  }

  // A deployed instance at this address — the most specific match there is.
  if (args.address) {
    try {
      const deployed = await plugin.call('udappDeployedContracts', 'getDeployedContracts') as any[];
      const instance = (deployed ?? []).find(
        (c: any) => typeof c?.address === 'string' && c.address.toLowerCase() === args.address.toLowerCase()
      );
      const abi = coerceAbi(instance?.abi ?? instance?.contractData?.abi);
      if (abi) return { abi };
    } catch (e) {
      remixAILogger.debug('[resolveContractAbi] deployed-contract lookup failed', e);
    }
  }

  // Otherwise the latest compilation of that contract.
  if (args.contractName) {
    try {
      const artefact = await plugin.call(
        'compilerArtefacts', 'getCompilerAbstractByContractName', args.contractName
      ) as CompilerAbstract;
      if (artefact) {
        const data = getContractData(args.contractName, artefact);
        const abi = coerceAbi((data as any)?.abi);
        if (abi) return { abi };
      }
    } catch (e) {
      remixAILogger.debug('[resolveContractAbi] compilation lookup failed', e);
    }
  }

  return {
    error:
      `Could not resolve the ABI for '${args.contractName ?? args.address}'. ` +
      'Compile the contract (solidity_compile) or attach it at its address (add_instance) first, ' +
      'or pass the abi argument explicitly.'
  };
}

/**
 * Call Contract Method Tool Handler
 */
export class CallContractHandler extends BaseToolHandler {
  name = 'call_contract';
  description = 'Call a method on a deployed contract. Sends a transaction unless the method is view/pure.';
  inputSchema = {
    type: 'object',
    properties: {
      contractName: {
        type: 'string',
        description: 'Contract name, as compiled.',
      },
      address: {
        type: 'string',
        description: 'Deployed address (0x...).',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      abi: {
        type: 'array',
        description: 'Optional. Leave it out — the ABI is resolved from the deployed instance at this address, or from the last compilation of contractName.',
        items: {
          type: 'object'
        }
      },
      methodName: {
        type: 'string',
        description: 'Function to call.'
      },
      args: {
        type: 'array',
        description: 'Arguments in declaration order.',
        items: {
          type: 'string'
        },
        default: []
      },
      gasLimit: {
        type: 'number',
        description: 'Gas limit. Omit to use the Deploy & Run value.',
        minimum: 21000
      },
      gasPrice: {
        type: 'string',
        description: 'in wei'
      },
      value: {
        type: 'string',
        description: 'ETH value to send',
        default: '0'
      },
      account: {
        type: 'string',
        description: 'Account to call from'
      }
    },
    // `abi` is deliberately not required — see resolveContractAbi.
    required: ['address', 'methodName', 'contractName']
  };

  getPermissions(): string[] {
    return ['contract:interact'];
  }

  validate(args: CallContractArgs): boolean | string {
    const required = this.validateRequired(args, ['address', 'methodName', 'contractName']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      address: 'string',
      methodName: 'string',
      gasLimit: 'number',
      gasPrice: 'string',
      value: 'string',
      account: 'string'
    });
    if (types !== true) return types;

    if (!args.address.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid contract address format';
    }

    // An omitted ABI is resolved in execute(); only a malformed one is rejected here.
    if (args.abi !== undefined && args.abi !== null && !coerceAbi(args.abi)) {
      return 'ABI must be an array (or a JSON string holding one)'
    }

    return true;
  }

  async execute(args: CallContractArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const resolved = await resolveContractAbi(plugin, args)
      if (!resolved.abi) {
        return this.createErrorResult(resolved.error);
      }
      const abi = resolved.abi

      const funcABI = abi.find((item: any) => item.name === args.methodName && item.type === 'function')
      if (!funcABI) {
        // Reading .stateMutability off this used to throw a bare TypeError.
        const callable = abi
          .filter((item: any) => item.type === 'function')
          .map((item: any) => item.name)
        return this.createErrorResult(
          `'${args.methodName}' is not a function on ${args.contractName}. ` +
          (callable.length ? `Available methods: ${callable.join(', ')}` : 'This ABI declares no callable functions.')
        );
      }
      const isView = funcABI.stateMutability === 'view' || funcABI.stateMutability === 'pure';
      let txReturn
      try {
        await plugin.call('sidePanel', 'showContent', 'udapp' )
        plugin.emit('setValueRequest', args.value || '0', 'wei')
        if (args.value && args.value !== '0') {
          plugin.call('notification', 'toast', `Value of ${formatEther(args.value)} ETH will be sent with the deployment`)
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait a moment for the toast to be seen
        }
        const params = funcABI.type !== 'fallback' ? (args.args? args.args.join(',') : ''): ''
        txReturn = await plugin.call('blockchain', 'runOrCallContractMethod',
          args.contractName,
          abi,
          funcABI,
          undefined,
          args.args ? args.args : [],
          args.address,
          params,
          isView)

      } catch (e) {
        return this.createErrorResult(`Deployment error: ${e.message}`);
      }

      // TODO: Execute contract call via Remix Run Tab API
      const receipt = (txReturn.txResult.receipt)
      const result: ContractInteractionResult = {
        result: isView ? txFormat.decodeResponse(txReturn.txResult.result, funcABI) : txReturn.returnValue,
        transactionHash: isView ? txReturn.txResult.transactionHash : receipt.hash,
        gasUsed: isView ? 0 : receipt.gasUsed,
        logs: isView ? undefined : receipt.logs,
        success: isView ? true : receipt.status === 1 ? true : false
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`Contract call failed: ${error.message}`);
    }
  }
}

/**
 * Run Script
 */
export class RunScriptHandler extends BaseToolHandler {
  name = 'run_script';
  description = 'Run a workspace JS/TS script in the Remix script runner.';
  inputSchema = {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Workspace-relative path, e.g. scripts/deploy.ts. No leading slash.'
      }
    },
    required: ['filePath']
  };

  getPermissions(): string[] {
    return ['transaction:send'];
  }

  validate(args: RunScriptArgs): boolean | string {
    const required = this.validateRequired(args, ['file']);
    if (required !== true) return required;

    return true;
  }

  async execute(args: RunScriptArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const content = await plugin.call('fileManager', 'readFile', args.filePath)
      await plugin.call('scriptRunnerBridge', 'execute', content, args.filePath)

      const result: RunScriptResult = {}

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`Run script failed: ${error.message}`);
    }
  }
}

/**
 * Send Transaction Tool Handler
 */
export class SendTransactionHandler extends BaseToolHandler {
  name = 'send_transaction';
  description = 'Send a raw transaction. Omit `to` and pass `data` to deploy bytecode.';
  inputSchema = {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Recipient address (0x...). Omit for contract creation.',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      value: {
        type: 'string',
        description: 'ETH value to send in wei',
        default: '0'
      },
      data: {
        type: 'string',
        description: 'Transaction data (hex)',
        pattern: '^0x[a-fA-F0-9]*$'
      },
      gasLimit: {
        type: 'number',
        description: 'Gas limit. Omit for the default.',
        minimum: 21000
      },
      gasPrice: {
        type: 'string',
        description: 'in wei'
      },
      from: {
        type: 'string',
        description: 'Sender address. Omit to use the selected account.'
      }
    },
    // `to` is NOT required: a contract-creation transaction has no recipient,
    // and requiring it rejected every deployment at the tool boundary with
    // `expected string, received undefined at to`.
    required: []
  };

  getPermissions(): string[] {
    return ['transaction:send'];
  }

  validate(args: SendTransactionArgs): boolean | string {
    const types = this.validateTypes(args, {
      to: 'string',
      value: 'string',
      data: 'string',
      gasLimit: 'number',
      gasPrice: 'string',
      from: 'string'
    });
    if (types !== true) return types;

    if (args.to !== undefined && !args.to.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid recipient address format';
    }

    if (args.data && !args.data.match(/^0x[a-fA-F0-9]*$/)) {
      return 'Invalid data format (must be hex)';
    }

    if (!args.to && !args.data) {
      return 'Pass `to` for a normal transaction, or `data` to deploy bytecode';
    }

    return true;
  }

  async execute(args: SendTransactionArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      if (!args.to && !args.data) {
        return this.createErrorResult('Pass `to` for a normal transaction, or `data` to deploy bytecode');
      }
      const ethersProvider: BrowserProvider = await plugin.call('blockchain', 'web3')
      const signer = await ethersProvider.getSigner();
      // The schema says `from` is optional, but this used to reject the call
      // when it was absent instead of using the selected account.
      const sendAccount = args.from || await signer.getAddress()

      const tx = await signer.sendTransaction({
        from: sendAccount,
        // Omitted entirely for a creation — ethers reads `to: undefined` as one.
        ...(args.to ? { to: args.to } : {}),
        value: args.value || '0',
        data: args.data,
        gasLimit: args.gasLimit,
        gasPrice: args.gasPrice
      });

      // Wait for the transaction to be mined
      const receipt = await tx.wait()
      const result = {
        success: true,
        transactionHash: receipt.hash,
        from: sendAccount,
        to: args.to,
        contractAddress: receipt.contractAddress ?? undefined,
        value: args.value || '0',
        gasUsed: toNumber(receipt.gasUsed),
        blockNumber: receipt.blockNumber
      };

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`Transaction failed: ${error.message}`);
    }
  }
}

/**
 * Get Deployed Contracts Tool Handler
 */
export class GetDeployedContractsHandler extends BaseToolHandler {
  name = 'get_deployed_contracts';
  description = 'Contracts currently in the Deploy & Run instance list, with their ABIs.';
  inputSchema = {
    type: 'object',
    properties: {}
  };

  getPermissions(): string[] {
    return ['deploy:read'];
  }

  async execute(args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const deployedContracts = await plugin.call('udappDeployedContracts', 'getDeployedContracts')
      const contracts = deployedContracts.map((contract: any) => {
        const { contractData, ...deployedContract } = contract;
        return {
          ...deployedContract,
          abi: contract.abi || contractData?.abi
        };
      });
      return this.createSuccessResult({
        success: true,
        contracts,
        count: contracts.length
      });

    } catch (error) {
      return this.createErrorResult(`Failed to get deployed contracts: ${error.message}`);
    }
  }
}

/**
 * Set Execution Environment Tool Handler
 */
export class SetExecutionEnvironmentHandler extends BaseToolHandler {
  name = 'set_execution_environment';
  description = 'Switch the Deploy & Run environment (VM, injected wallet, RPC provider).';
  inputSchema = {
    type: 'object',
    properties: {
      environment: {
        type: 'string',
        enum: ['vm-osaka', 'vm-prague', 'vm-cancun', 'vm-shanghai', 'vm-paris', 'vm-london', 'vm-berlin', 'vm-mainnet-fork', 'vm-sepolia-fork', 'vm-custom-fork', 'walletconnect', 'basic-http-provider', 'hardhat-provider', 'ganache-provider', 'foundry-provider', 'injected-Rabby Wallet', 'injected-MetaMask', 'injected-metamask-optimism', 'injected-metamask-arbitrum', 'injected-metamask-sepolia', 'injected-metamask-ephemery', 'injected-metamask-gnosis', 'injected-metamask-chiado', 'injected-metamask-linea'],
        description: 'Environment id. get_current_environment reports the active one.',
        default: 'vm-osaka'
      },
      networkUrl: {
        type: 'string',
        description: 'RPC URL, for the external-provider environments only.'
      }
    },
    required: ['environment']
  };

  getPermissions(): string[] {
    return ['environment:config'];
  }

  validate(args: { environment: string; networkUrl?: string }): boolean | string {
    // we validate in the execute method to have access to the list of available providers.
    return true;
  }

  async execute(args: { environment: string }, plugin: Plugin): Promise<IMCPToolResult> {
    await plugin.call('sidePanel', 'showContent', 'udapp' )

    try {
      const providers = await plugin.call('blockchain', 'getAllProviders')
      const names = Object.keys(providers ?? {})
      const normalize = (v: string) => v.toLowerCase().replace(/[\s_-]+/g, '')
      const provider = names.find((p) => p === args.environment)
        ?? names.find((p) => normalize(p) === normalize(args.environment ?? ''))
      if (!provider) {
        return this.createErrorResult(
          `Could not find provider for environment '${args.environment}'. Available environments: ${names.join(', ')}`
        );
      }
      await plugin.call('udappEnv', 'changeExecutionContext', { context: provider })
      return this.createSuccessResult({
        success: true,
        message: `Execution environment set to: ${provider}`,
        environment: provider,
      });

    } catch (error) {
      return this.createErrorResult(`Failed to set execution environment: ${error.message}`);
    }
  }
}

/**
 * Get Account Balance Tool Handler
 */
export class GetAccountBalanceHandler extends BaseToolHandler {
  name = 'get_account_balance';
  description = 'Balance of an account in the current environment.';
  inputSchema = {
    type: 'object',
    properties: {
      account: {
        type: 'string',
        description: 'Address to query (0x...).',
        pattern: '^0x[a-fA-F0-9]{40}$'
      }
    },
    required: ['account']
  };

  getPermissions(): string[] {
    return ['account:read'];
  }

  validate(args: { account: string }): boolean | string {
    const required = this.validateRequired(args, ['account']);
    if (required !== true) return required;

    if (!args.account.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid account address format';
    }

    return true;
  }

  async execute(args: { account: string }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const web3 = await plugin.call('blockchain', 'web3')
      const balance = await web3.getBalance(args.account)
      return this.createSuccessResult({
        success: true,
        account: args.account,
        balance: formatEther(balance),
        unit: 'ETH'
      })
    } catch (error) {
      return this.createErrorResult(`Failed to get account balance: ${error.message}`);
    }
  }
}

/**
 * Get User Accounts Tool Handler
 */
export class GetUserAccountsHandler extends BaseToolHandler {
  name = 'get_user_accounts';
  description = 'Accounts available in the current environment.';
  inputSchema = {
    type: 'object',
    properties: {
      includeBalances: {
        type: 'boolean',
        description: 'Include each account balance.',
        default: true
      }
    }
  };

  getPermissions(): string[] {
    return ['accounts:read'];
  }

  validate(args: { includeBalances?: boolean }): boolean | string {
    const types = this.validateTypes(args, { includeBalances: 'boolean' });
    if (types !== true) return types;
    return true;
  }

  async execute(args: { includeBalances?: boolean }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Get accounts from the run-tab plugin (udapp)
      const loadedAccounts = await plugin.call('udappEnv' as any, 'getLoadedAccounts');
      const selectedAccount = await plugin.call('udappEnv' as any, 'getSelectedAccount');

      if (!loadedAccounts) {
        return this.createErrorResult('Could not retrieve accounts from execution environment');
      }

      const accounts: AccountInfo[] = [];
      for (const loadedAccount of loadedAccounts) {
        loadedAccount.isSmartAccount = await plugin.call('udappEnv' as any, 'isSmartAccount', loadedAccount.account) || false

        // Get balance if requested
        if (args.includeBalances !== false) {
          try {
            const balance = await plugin.call('blockchain' as any, 'getBalanceInEther', loadedAccount.account);
            loadedAccount.balance = balance || '0';
          } catch (error) {
            loadedAccount.balance = 'unknown';
          }
        }

        accounts.push(loadedAccount);
      }

      const result = {
        success: true,
        accounts: accounts,
        selectedAccount: selectedAccount,
        totalAccounts: accounts.length,
        environment: await this.getCurrentEnvironment(plugin)
      };

      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to get user accounts: ${error.message}`);
    }
  }

  private async getCurrentEnvironment(plugin: Plugin): Promise<string> {
    try {
      const provider = await plugin.call('blockchain' as any, 'getCurrentProvider');
      return provider?.displayName || provider?.name || 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }
}

/**
 * Set Selected Account Tool Handler
 */
export class SetSelectedAccountHandler extends BaseToolHandler {
  name = 'set_selected_account';
  description = 'Choose the account Deploy & Run sends from.';
  inputSchema = {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'Address to select (0x...). Must be one of get_user_accounts.'
      }
    },
    required: ['address']
  };

  getPermissions(): string[] {
    return ['accounts:write'];
  }

  validate(args: { address: string }): boolean | string {
    const required = this.validateRequired(args, ['address']);
    if (required !== true) return required;

    const types = this.validateTypes(args, { address: 'string' });
    if (types !== true) return types;

    // Basic address validation
    if (!/^0x[a-fA-F0-9]{40}$/.test(args.address)) {
      return 'Invalid Ethereum address format';
    }

    return true;
  }

  async execute(args: { address: string }, plugin: Plugin): Promise<IMCPToolResult> {
    await plugin.call('sidePanel', 'showContent', 'udapp' )

    try {
      // Set the selected account through the udapp plugin
      await plugin.call('udapp' as any, 'setAccount', args.address);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait a moment for the change to propagate

      // Verify the account was set
      const selectedAccount = await plugin.call('udappEnv' as any, 'getSelectedAccount');

      if (selectedAccount !== args.address) {
        return this.createErrorResult(`Failed to set account. Current selected: ${selectedAccount}`);
      }

      return this.createSuccessResult({
        success: true,
        selectedAccount: args.address,
        message: `Successfully set account ${args.address} as selected`
      });
    } catch (error) {
      return this.createErrorResult(`Failed to set selected account: ${error.message}`);
    }
  }
}

/**
 * Get Current Environment Tool Handler
 */
export class GetCurrentEnvironmentHandler extends BaseToolHandler {
  name = 'get_current_environment';
  description = 'Current Deploy & Run environment, network and selected account.';
  inputSchema = {
    type: 'object',
    properties: {}
  };

  getPermissions(): string[] {
    return ['environment:read'];
  }

  async execute(_args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Get environment information
      const provider = await plugin.call('blockchain' as any, 'getProvider');
      const network = await plugin.call('network', 'detectNetwork')

      // Verify the account was set
      const loadedAccounts = await plugin.call('udappEnv' as any, 'getLoadedAccounts');
      const selectedAccount = await plugin.call('udappEnv' as any, 'getSelectedAccount');

      const result = {
        success: true,
        environment: {
          provider,
          network,
          loadedAccounts,
          selectedAccount
        }
      };

      return this.createSuccessResult(result);
    } catch (error) {
      return this.createErrorResult(`Failed to get environment information: ${error.message}`);
    }
  }
}

/**
 * Simulate Transaction Tool Handler
 */
export class SimulateTransactionHandler extends BaseToolHandler {
  name = 'simulate_transaction';
  description = 'Dry-run a transaction and return the trace. Sends nothing.';
  inputSchema = {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        description: 'Sender address (0x...).',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      to: {
        type: 'string',
        description: 'optional for contract creation',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      value: {
        type: 'string',
        description: 'in wei in decimal value (optional)',
        default: '0'
      },
      maxFeePerGas: {
        type: 'string',
        description: 'in wei in decimal value (optional)',
        default: '0'
      },
      data: {
        type: 'string',
        description: 'Calldata (hex).',
        pattern: '^0x[a-fA-F0-9]*$'
      },
      validation: {
        type: 'boolean',
        description: 'Fail on invalid state instead of simulating anyway.',
        default: true
      },
      traceTransfers: {
        type: 'boolean',
        description: 'Include ETH transfers in the trace.',
        default: true
      },
      shouldDecodeLogs: {
        type: 'boolean',
        description: 'Decode event logs in the trace.',
        default: true
      }
    },
    required: ['from']
  };

  getPermissions(): string[] {
    return ['transaction:simulate'];
  }

  validate(args: SimulateTransactionArgs): boolean | string {
    const required = this.validateRequired(args, ['from']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      from: 'string',
      to: 'string',
      value: 'string',
      maxFeePerGas: 'string',
      data: 'string',
      validation: 'boolean',
      traceTransfers: 'boolean',
      shouldDecodeLogs: 'boolean'
    });
    if (types !== true) return types;

    if (!args.from.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid from address format';
    }

    if (args.to && !args.to.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid to address format';
    }

    if (args.data && !args.data.match(/^0x[a-fA-F0-9]*$/)) {
      return 'Invalid data format (must be hex)';
    }

    return true;
  }

  async execute(args: SimulateTransactionArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Call the transactionSimulator plugin's simulateTransaction method
      const value = args.value ? '0x' + BigInt(args.value).toString(16) : null
      const maxFeePerGas = args.maxFeePerGas ? '0x' + BigInt(args.maxFeePerGas).toString(16) : null
      const simulationResult = await plugin.call(
        'transactionSimulator',
        'simulateTransaction',
        args.from,
        args.to,
        value,
        maxFeePerGas,
        args.data,
        args.validation !== false,
        args.traceTransfers !== false,
        args.shouldDecodeLogs !== false
      );

      if (!simulationResult.success) {
        return this.createErrorResult(
          `Simulation failed: ${simulationResult.error || 'Unknown error'}`
        );
      }

      return this.createSuccessResult({
        success: true,
        ...simulationResult
      });

    } catch (error) {
      return this.createErrorResult(`Transaction simulation failed: ${error.message}`);
    }
  }
}

/**
 * Add Instance Tool Handler
 */
export class AddInstanceHandler extends BaseToolHandler {
  name = 'add_instance';
  description = 'Attach an already-deployed contract at an address to the Deploy & Run list.';
  inputSchema = {
    type: 'object',
    properties: {
      contractAddress: {
        type: 'string',
        description: 'Deployed address (0x...).',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      abi: {
        type: 'array',
        description: 'Optional. Resolved from the last compilation of contractName when omitted.',
        items: {
          type: 'object'
        }
      },
      contractName: {
        type: 'string',
        description: 'Contract name, as compiled.'
      },
      contractData: {
        type: 'object',
        description: 'Optional compilation artefact. Resolved automatically when omitted.'
      }
    },
    // `abi` is deliberately not required — see resolveContractAbi.
    required: ['contractAddress', 'contractName']
  };

  getPermissions(): string[] {
    return ['deploy:write'];
  }

  validate(args: AddInstanceArgs): boolean | string {
    const required = this.validateRequired(args, ['contractAddress', 'contractName']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      contractAddress: 'string',
      contractName: 'string'
    });
    if (types !== true) return types;

    if (!args.contractAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid contract address format';
    }

    // An omitted ABI is resolved in execute(); only a malformed one is rejected here.
    if (args.abi !== undefined && args.abi !== null && !coerceAbi(args.abi)) {
      return 'ABI must be an array or valid JSON string';
    }

    return true;
  }

  async execute(args: AddInstanceArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const resolved = await resolveContractAbi(plugin, { abi: args.abi, address: args.contractAddress, contractName: args.contractName })
      if (!resolved.abi) {
        return this.createErrorResult(resolved.error);
      }
      const abi = resolved.abi
      await plugin.call('sidePanel', 'showContent', 'udapp');

      let data
      try {
        const compilerAbstract = await plugin.call('compilerArtefacts', 'getArtefactsByContractName', args.contractName) as any;
        data = getContractData(args.contractName, compilerAbstract)
      } catch (e) {}

      // Add the instance to udappDeployedContracts
      await plugin.call(
        'udappDeployedContracts',
        'addInstance',
        args.contractAddress,
        abi,
        args.contractName,
        data || null
      );

      const result: AddInstanceResult = {
        success: true,
        contractAddress: args.contractAddress,
        contractName: args.contractName,
        message: `Successfully added contract instance ${args.contractName} at ${args.contractAddress}`
      };

      plugin.call('notification', 'toast', `Added contract instance: ${args.contractName}`);

      return this.createSuccessResult(result);

    } catch (error) {
      return this.createErrorResult(`Failed to add contract instance: ${error.message}`);
    }
  }
}

/**
 * Create deployment and interaction tool definitions
 */
export function createDeploymentTools(): RemixToolDefinition[] {
  // description comes from the handler — the copies here were vaguer than the
  // handler's own text and drifted from it.
  const define = (handler: BaseToolHandler, permissions: string[]): RemixToolDefinition => ({
    name: handler.name,
    description: handler.description,
    inputSchema: handler.inputSchema,
    category: ToolCategory.DEPLOYMENT,
    permissions,
    handler
  })

  return [
    define(new DeployContractHandler(), ['deploy:contract']),
    define(new CallContractHandler(), ['contract:interact']),
    define(new SendTransactionHandler(), ['transaction:send']),
    define(new GetDeployedContractsHandler(), ['deploy:read']),
    define(new SetExecutionEnvironmentHandler(), ['environment:config']),
    define(new GetAccountBalanceHandler(), ['account:read']),
    define(new GetUserAccountsHandler(), ['accounts:read']),
    define(new SetSelectedAccountHandler(), ['accounts:write']),
    define(new GetCurrentEnvironmentHandler(), ['environment:read']),
    define(new RunScriptHandler(), ['transaction:send']),
    define(new SimulateTransactionHandler(), ['transaction:simulate']),
    define(new AddInstanceHandler(), ['deploy:write'])
  ];
}
