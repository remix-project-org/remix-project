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
  RunScriptResult
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';
import { getContractData } from '@remix-project/core-plugin'
import type { TxResult } from '@remix-project/remix-lib';
import { BrowserProvider, formatEther } from "ethers"
import { toNumber } from 'ethers'
import { execution } from '@remix-project/remix-lib';
const { txFormat, txHelper: { makeFullTypeDefinition } } = execution;

/**
 * Deploy Contract Tool Handler
 */
export class DeployContractHandler extends BaseToolHandler {
  name = 'deploy_contract';
  description = 'Deploy a smart contract';
  inputSchema = {
    type: 'object',
    properties: {
      contractName: {
        type: 'string',
        description: 'Name of the contract to deploy'
      },
      constructorArgs: {
        type: 'array',
        description: 'Constructor arguments',
        items: {
          type: 'string'
        },
        default: []
      },
      gasLimit: {
        type: 'number',
        description: 'Gas limit for deployment',
        minimum: 21000
      },
      gasPrice: {
        type: 'string',
        description: 'Gas price in wei'
      },
      value: {
        type: 'string',
        description: 'ETH value to send with deployment',
        default: '0'
      },
      account: {
        type: 'string',
        description: 'Account to deploy from (address or index)'
      },
      file: {
        type: 'string',
        description: 'The file containing the contract to deploy'
      }
    },
    required: ['contractName', 'file']
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
      const compilerAbstract = await plugin.call('compilerArtefacts', 'getCompilerAbstract', args.file) as any;
      const data = getContractData(args.contractName, compilerAbstract)
      if (!data) {
        return this.createErrorResult(`Could not retrieve contract data for '${args.contractName}'`);
      }
      await plugin.call('sidePanel', 'showContent', 'udapp' )
      plugin.emit('setValueRequest', args.value || '0', 'wei')
      if (args.value && args.value !== '0') {
        plugin.call('notification', 'toast', `Value of ${formatEther(args.value)} ETH will be sent with the deployment`)
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait a moment for the toast to be seen
      }

      let txReturn
      try {
        txReturn = await new Promise(async (resolve, reject) => {
          const callbacks = { continueCb: (error, continueTxExecution, cancelCb) => {
            continueTxExecution()
          }, promptCb: () => {}, statusCb: (error) => {
          }, finalCb: (error, contractObject, address: string, txResult: TxResult) => {
            if (error) reject(error)
            resolve({ contractObject, address, txResult })
          } }
          const confirmationCb = (network, tx, gasEstimation, continueTxExecution, cancelCb) => {
            continueTxExecution(null)
          }
          const compilerContracts = await plugin.call('compilerArtefacts', 'getLastCompilationResult')
          plugin.call('blockchain', 'deployContractAndLibraries',
            data,
            args.constructorArgs ? args.constructorArgs : [],
            null,
            compilerContracts.getData().contracts,
            callbacks,
            confirmationCb
          )
        })
      } catch (e) {
        return this.createErrorResult(`Deployment error: ${e.message || e}`);
      }

      const receipt = (txReturn.txResult.receipt)
      const result: DeploymentResult = {
        transactionHash: receipt.hash,
        gasUsed: toNumber(receipt.gasUsed),
        effectiveGasPrice: args.gasPrice || '20000000000',
        blockNumber: toNumber(receipt.blockNumber),
        logs: receipt.logs,
        contractAddress: receipt.contractAddress,
        success: receipt.status === 1 ? true : false
      }
      plugin.call('udapp', 'addInstance', result.contractAddress, data.abi, args.contractName, data)

      return this.createSuccessResult(result);

    } catch (error) {
      console.log(error)
      return this.createErrorResult(`Deployment failed: ${error.message}`);
    }
  }
}

/**
 * Call Contract Method Tool Handler
 */
export class CallContractHandler extends BaseToolHandler {
  name = 'call_contract';
  description = 'Call a smart contract method';
  inputSchema = {
    type: 'object',
    properties: {
      contractName: {
        type: 'string',
        description: 'Contract name',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      address: {
        type: 'string',
        description: 'Contract address',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      abi: {
        type: 'array',
        description: 'Contract ABI',
        items: {
          type: 'object'
        }
      },
      methodName: {
        type: 'string',
        description: 'Method name to call'
      },
      args: {
        type: 'array',
        description: 'Method arguments',
        items: {
          type: 'string'
        },
        default: []
      },
      gasLimit: {
        type: 'number',
        description: 'Gas limit for transaction',
        minimum: 21000
      },
      gasPrice: {
        type: 'string',
        description: 'Gas price in wei'
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
    required: ['address', 'abi', 'methodName', 'contractName']
  };

  getPermissions(): string[] {
    return ['contract:interact'];
  }

  validate(args: CallContractArgs): boolean | string {
    const required = this.validateRequired(args, ['address', 'abi', 'methodName', 'contractName']);
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

    if (!Array.isArray(args.abi)) {
      try {
        args.abi = JSON.parse(args.abi as any)
        if (!Array.isArray(args.abi)) {
          return 'ABI must be an array'
        }
      } catch (e) {
        return 'ABI must be an array'
      }
    }

    return true;
  }

  async execute(args: CallContractArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const funcABI = args.abi.find((item: any) => item.name === args.methodName && item.type === 'function')
      const isView = funcABI.stateMutability === 'view' || funcABI.stateMutability === 'pure';
      let txReturn
      try {
        await plugin.call('sidePanel', 'showContent', 'udapp' )
        plugin.emit('setValueRequest', args.value || '0', 'wei')
        if (args.value && args.value !== '0') {
          plugin.call('notification', 'toast', `Value of ${formatEther(args.value)} ETH will be sent with the deployment`)
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait a moment for the toast to be seen
        }

        txReturn = await new Promise((resolve, reject) => {
          const params = funcABI.type !== 'fallback' ? (args.args? args.args.join(',') : ''): ''
          plugin.call('blockchain', 'runOrCallContractMethod',
            args.contractName,
            args.abi,
            funcABI,
            undefined,
            args.args ? args.args : [],
            args.address,
            params,
            isView,
            (msg) => {
              // logMsg
            },
            (msg) => {
              // logCallback
            },
            (returnValue) => {
              // outputCb
            },
            (network, tx, gasEstimation, continueTxExecution, cancelCb) => {
              // confirmationCb
              continueTxExecution(null)
            },
            (error, continueTxExecution, cancelCb) => {
              if (error) reject(error)
              // continueCb
              continueTxExecution()
            },
            (okCb, cancelCb) => {
              // promptCb
            },
            (error, { txResult, address, returnValue }) => {
              if (error) return reject(error)
              resolve({ txResult, address, returnValue })
            },
          )
        })
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
  name = 'send_transaction';
  description = 'Run a script in the current environment';
  inputSchema = {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'path to the file',
        pattern: '^0x[a-fA-F0-9]{40}$'
      }
    },
    required: ['file']
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
      const content = await plugin.call('fileManager', 'readFile', args.file)
      await plugin.call('scriptRunnerBridge', 'execute', content, args.file)

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
  description = 'Send a raw transaction';
  inputSchema = {
    type: 'object',
    properties: {
      to: {
        type: 'string',
        description: 'Recipient address',
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
        description: 'Gas limit',
        minimum: 21000
      },
      gasPrice: {
        type: 'string',
        description: 'Gas price in wei'
      },
      from: {
        type: 'string',
        description: 'Account to send from'
      }
    },
    required: ['to']
  };

  getPermissions(): string[] {
    return ['transaction:send'];
  }

  validate(args: SendTransactionArgs): boolean | string {
    const required = this.validateRequired(args, ['to']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      to: 'string',
      value: 'string',
      data: 'string',
      gasLimit: 'number',
      gasPrice: 'string',
      from: 'string'
    });
    if (types !== true) return types;

    if (!args.to.match(/^0x[a-fA-F0-9]{40}$/)) {
      return 'Invalid recipient address format';
    }

    if (args.data && !args.data.match(/^0x[a-fA-F0-9]*$/)) {
      return 'Invalid data format (must be hex)';
    }

    return true;
  }

  async execute(args: SendTransactionArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Get accounts
      const sendAccount = args.from

      if (!sendAccount) {
        return this.createErrorResult('No account available for sending transaction');
      }
      const ethersProvider: BrowserProvider = await plugin.call('blockchain', 'web3')
      const signer = await ethersProvider.getSigner();
      const tx = await signer.sendTransaction({
        from: args.from,
        to: args.to,
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
        from: args.from,
        to: args.to,
        value: args.value || '0',
        gasUsed: toNumber(receipt.gasUsed),
        blockNumber: receipt.blockNumber
      };

      return this.createSuccessResult(result);

    } catch (error) {
      console.log(error)
      return this.createErrorResult(`Transaction failed: ${error.message}`);
    }
  }
}

/**
 * Get Deployed Contracts Tool Handler
 */
export class GetDeployedContractsHandler extends BaseToolHandler {
  name = 'get_deployed_contracts';
  description = 'Get list of deployed contracts';
  inputSchema = {
    type: 'object',
    properties: {
      network: {
        type: 'string',
        description: 'Network name (optional)'
      }
    }
  };

  getPermissions(): string[] {
    return ['deploy:read'];
  }

  async execute(args: { network?: string }, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const deployedContracts = await plugin.call('udapp', 'getAllDeployedInstances')
      return this.createSuccessResult({
        success: true,
        contracts: deployedContracts,
        count: deployedContracts.length
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
  description = 'Set the execution environment for deployments';
  inputSchema = {
    type: 'object',
    properties: {
      environment: {
        type: 'string',
        enum: ['vm-osaka', 'vm-prague', 'vm-cancun', 'vm-shanghai', 'vm-paris', 'vm-london', 'vm-berlin', 'vm-mainnet-fork', 'vm-sepolia-fork', 'vm-custom-fork', 'walletconnect', 'basic-http-provider', 'hardhat-provider', 'ganache-provider', 'foundry-provider', 'injected-Rabby Wallet', 'injected-MetaMask', 'injected-metamask-optimism', 'injected-metamask-arbitrum', 'injected-metamask-sepolia', 'injected-metamask-ephemery', 'injected-metamask-gnosis', 'injected-metamask-chiado', 'injected-metamask-linea'],
        description: 'Execution environment'
      },
      networkUrl: {
        type: 'string',
        description: 'Network URL (for web3 environment)'
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
      const provider = Object.keys(providers).find((p) => p === args.environment)
      if (!provider) {
        return this.createErrorResult(`Could not find provider for environment '${args.environment}'`);
      }
      await plugin.call('blockchain', 'changeExecutionContext', { context: args.environment })
      return this.createSuccessResult({
        success: true,
        message: `Execution environment set to: ${args.environment}`,
        environment: args.environment,
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
  description = 'Get account balance';
  inputSchema = {
    type: 'object',
    properties: {
      account: {
        type: 'string',
        description: 'Account address',
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
  description = 'Get user accounts from the current execution environment';
  inputSchema = {
    type: 'object',
    properties: {
      includeBalances: {
        type: 'boolean',
        description: 'Whether to include account balances',
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
      const runTabApi = await plugin.call('udapp' as any, 'getRunTabAPI');

      if (!runTabApi || !runTabApi.accounts) {
        return this.createErrorResult('Could not retrieve accounts from execution environment');
      }

      const accounts: AccountInfo[] = [];
      const loadedAccounts = runTabApi.accounts.loadedAccounts || {};
      const selectedAccount = runTabApi.accounts.selectedAccount;
      for (const [address, displayName] of Object.entries(loadedAccounts)) {
        const account: AccountInfo = {
          address: address,
          displayName: displayName as string,
          isSmartAccount: (displayName as string)?.includes('[SMART]') || false
        };

        // Get balance if requested
        if (args.includeBalances !== false) {
          try {
            const balance = await plugin.call('blockchain' as any, 'getBalanceInEther', address);
            account.balance = balance || '0';
          } catch (error) {
            account.balance = 'unknown';
          }
        }

        accounts.push(account);
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
  description = 'Set the currently selected account in the execution environment';
  inputSchema = {
    type: 'object',
    properties: {
      address: {
        type: 'string',
        description: 'The account address to select'
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
      const runTabApi = await plugin.call('udapp' as any, 'getRunTabAPI');
      const currentSelected = runTabApi?.accounts?.selectedAccount;

      if (currentSelected !== args.address) {
        return this.createErrorResult(`Failed to set account. Current selected: ${currentSelected}`);
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
  description = 'Get information about the current execution environment';
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
      const runTabApi = await plugin.call('udapp' as any, 'getRunTabAPI');
      const accounts = runTabApi?.accounts;

      const result = {
        success: true,
        environment: {
          provider,
          network,
          accounts
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
  description = 'Simulate a transaction using eth_simulateV1 RPC endpoint';
  inputSchema = {
    type: 'object',
    properties: {
      from: {
        type: 'string',
        description: 'From address',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      to: {
        type: 'string',
        description: 'To address (optional for contract creation)',
        pattern: '^0x[a-fA-F0-9]{40}$'
      },
      value: {
        type: 'string',
        description: 'Value in wei in decimal value (optional)',
        default: '0'
      },
      maxFeePerGas: {
        type: 'string',
        description: 'maxFeePerGas in wei in decimal value (optional)',
        default: '0'
      },
      data: {
        type: 'string',
        description: 'Transaction data (hex)',
        pattern: '^0x[a-fA-F0-9]*$'
      },
      validation: {
        type: 'boolean',
        description: 'Enable validation',
        default: true
      },
      traceTransfers: {
        type: 'boolean',
        description: 'Enable trace transfers',
        default: true
      },
      shouldDecodeLogs: {
        type: 'boolean',
        description: 'Whether to decode logs',
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
 * Create deployment and interaction tool definitions
 */
export function createDeploymentTools(): RemixToolDefinition[] {
  return [
    {
      name: 'deploy_contract',
      description: 'Deploy a smart contract',
      inputSchema: new DeployContractHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['deploy:contract'],
      handler: new DeployContractHandler()
    },
    {
      name: 'call_contract',
      description: 'Call a smart contract method',
      inputSchema: new CallContractHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['contract:interact'],
      handler: new CallContractHandler()
    },
    {
      name: 'send_transaction',
      description: 'Send a raw transaction',
      inputSchema: new SendTransactionHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['transaction:send'],
      handler: new SendTransactionHandler()
    },
    {
      name: 'get_deployed_contracts',
      description: 'Get list of deployed contracts',
      inputSchema: new GetDeployedContractsHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['deploy:read'],
      handler: new GetDeployedContractsHandler()
    },
    {
      name: 'set_execution_environment',
      description: 'Set the execution environment for deployments',
      inputSchema: new SetExecutionEnvironmentHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['environment:config'],
      handler: new SetExecutionEnvironmentHandler()
    },
    {
      name: 'get_account_balance',
      description: 'Get account balance',
      inputSchema: new GetAccountBalanceHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['account:read'],
      handler: new GetAccountBalanceHandler()
    },
    {
      name: 'get_user_accounts',
      description: 'Get user accounts from the current execution environment',
      inputSchema: new GetUserAccountsHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['accounts:read'],
      handler: new GetUserAccountsHandler()
    },
    {
      name: 'set_selected_account',
      description: 'Set the currently selected account in the execution environment',
      inputSchema: new SetSelectedAccountHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['accounts:write'],
      handler: new SetSelectedAccountHandler()
    },
    {
      name: 'get_current_environment',
      description: 'Get information about the current execution environment',
      inputSchema: new GetCurrentEnvironmentHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['environment:read'],
      handler: new GetCurrentEnvironmentHandler()
    },
    {
      name: 'run_script',
      description: 'Run a script in the current environment',
      inputSchema: new RunScriptHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['transaction:send'],
      handler: new RunScriptHandler()
    },
    {
      name: 'simulate_transaction',
      description: 'Simulate a transaction using eth_simulateV1 RPC endpoint',
      inputSchema: new SimulateTransactionHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['transaction:simulate'],
      handler: new SimulateTransactionHandler()
    }
  ];
}