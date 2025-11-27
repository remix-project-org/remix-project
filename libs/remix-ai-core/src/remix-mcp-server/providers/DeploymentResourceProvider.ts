/**
 * Deployment Resource Provider - Provides access to deployment history and contract instances
 */

import { Plugin } from '@remixproject/engine';
import { IMCPResource, IMCPResourceContent } from '../../types/mcp';
import { BaseResourceProvider } from '../registry/RemixResourceProviderRegistry';
import { ResourceCategory, DeployedContractInstance, DeployedContractsByNetwork } from '../types/mcpResources';

export class DeploymentResourceProvider extends BaseResourceProvider {
  name = 'deployment';
  description = 'Provides access to deployment history, contract instances, and transaction records';

  async getResources(plugin: Plugin): Promise<IMCPResource[]> {
    const resources: IMCPResource[] = [];

    try {
      // Add deployment overview resources
      resources.push(
        this.createResource(
          'deployment://history',
          'Deployment History',
          'Complete history of contract deployments',
          'application/json',
          {
            category: ResourceCategory.DEPLOYMENT_DATA,
            tags: ['deployments', 'history', 'transactions'],
            priority: 9
          }
        )
      );

      resources.push(
        this.createResource(
          'deployment://active',
          'Active Deployments',
          'Currently active and deployed contracts',
          'application/json',
          {
            category: ResourceCategory.DEPLOYMENT_DATA,
            tags: ['active', 'deployed', 'contracts'],
            priority: 8
          }
        )
      );

      resources.push(
        this.createResource(
          'deployment://networks',
          'Deployment Networks',
          'Networks and environments where contracts are deployed',
          'application/json',
          {
            category: ResourceCategory.DEPLOYMENT_DATA,
            tags: ['networks', 'environments'],
            priority: 7
          }
        )
      );

      resources.push(
        this.createResource(
          'deployment://transactions',
          'Deployment Transactions',
          'Transaction details for all deployments',
          'application/json',
          {
            category: ResourceCategory.DEPLOYMENT_DATA,
            tags: ['transactions', 'gas', 'costs'],
            priority: 6
          }
        )
      );

      resources.push(
        this.createResource(
          'deployment://config',
          'Deployment Configuration',
          'Current deployment settings and environment configuration',
          'application/json',
          {
            category: ResourceCategory.DEPLOYMENT_DATA,
            tags: ['config', 'settings', 'environment'],
            priority: 5
          }
        )
      );

      await this.addContractInstances(plugin, resources);

    } catch (error) {
      console.warn('Failed to get deployment resources:', error);
    }

    return resources;
  }

  async getResourceContent(uri: string, plugin: Plugin): Promise<IMCPResourceContent> {
    if (uri === 'deployment://history') {
      return this.getDeploymentHistory(plugin);
    }

    if (uri === 'deployment://active') {
      return this.getActiveDeployments(plugin);
    }

    if (uri === 'deployment://networks') {
      return this.getDeploymentNetworks(plugin);
    }

    if (uri === 'deployment://transactions') {
      return this.getDeploymentTransactions(plugin);
    }

    if (uri === 'deployment://config') {
      return this.getDeploymentConfig(plugin);
    }

    if (uri.startsWith('instance://')) {
      return this.getContractInstance(uri, plugin);
    }

    throw new Error(`Unsupported deployment resource URI: ${uri}`);
  }

  canHandle(uri: string): boolean {
    return uri.startsWith('deployment://') || uri.startsWith('instance://');
  }

  private async addContractInstances(plugin: Plugin, resources: IMCPResource[]): Promise<void> {
    try {
      const deployedContracts:DeployedContractsByNetwork = await plugin.call('udapp' as any, 'getDeployedContracts');
      for (const [networkKey, contracts] of Object.entries(deployedContracts)) {
        if (contracts && typeof contracts === 'object') {
          for (const [address, contractInfo] of Object.entries(contracts)) {
            const contractInstance = contractInfo as DeployedContractInstance;
            const contractName = contractInstance.name || 'Unknown';

            resources.push(
              this.createResource(
                `instance://${address}`,
                `${contractName} Instance`,
                `Deployed instance of ${contractName} at ${address} on ${networkKey}`,
                'application/json',
                {
                  category: ResourceCategory.DEPLOYMENT_DATA,
                  tags: ['instance', 'contract', contractName.toLowerCase(), networkKey],
                  contractName: contractName,
                  contractAddress: address,
                  network: networkKey,
                  deployedAt: contractInstance.timestamp || new Date().toISOString(),
                  priority: 4
                }
              )
            );
          }
        }
      }
    } catch (error) {
      console.warn('Failed to add contract instances:', error);
    }
  }

  private async getDeploymentHistory(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      const deployedContracts:DeployedContractsByNetwork = await plugin.call('udapp' as any, 'getDeployedContracts').catch(() => ({}));

      // Get compilation results for contract names
      const compilationResult = await plugin.call('solidity' as any, 'getCompilationResult').catch(() => null);

      // Get current provider info
      const provider = await plugin.call('blockchain' as any, 'getCurrentProvider').catch(() => ({ displayName: 'unknown' }));
      const networkName = await plugin.call('blockchain' as any, 'getNetworkName').catch(() => 'unknown');

      const deployments = [];
      let totalGasUsed = 0;

      // Process deployed contracts
      for (const [networkKey, contracts] of Object.entries(deployedContracts)) {
        if (contracts && typeof contracts === 'object') {
          for (const [address, contractInfo] of Object.entries(contracts)) {
            const contractInstance = contractInfo as DeployedContractInstance;
            const deployment = {
              id: `deploy_${address}`,
              contractName: contractInstance.name || 'Unknown',
              address: address,
              network: networkKey,
              transactionHash: contractInstance.transactionHash || 'unknown',
              blockNumber: contractInstance.blockNumber || 0,
              gasUsed: contractInstance.gasUsed || 0,
              gasPrice: contractInstance.gasPrice || '0',
              deployedAt: contractInstance.timestamp || new Date().toISOString(),
              status: contractInstance.status || 'unknown',
              deployer: contractInstance.from || 'unknown',
              constructorArgs: contractInstance.constructorArgs || [],
              value: contractInstance.value || '0',
              abi: contractInstance.abi || []
            };
            deployments.push(deployment);
            totalGasUsed += parseInt(deployment.gasUsed.toString()) || 0;
          }
        }
      }

      const deploymentHistory = {
        deployments,
        summary: {
          totalDeployments: deployments.length,
          successfulDeployments: deployments.filter(d => d.status === 'success').length,
          failedDeployments: deployments.filter(d => d.status === 'failed').length,
          totalGasUsed,
          currentProvider: provider.displayName || provider.name || 'unknown',
          currentNetwork: networkName,
          compilationAvailable: !!compilationResult
        },
        generatedAt: new Date().toISOString()
      };

      return this.createJsonContent('deployment://history', deploymentHistory);
    } catch (error) {
      return this.createTextContent('deployment://history', `Error getting deployment history: ${error.message}`);
    }
  }

  private async getActiveDeployments(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      // Get deployed contracts
      const deployedContracts = await plugin.call('udapp' as any, 'getDeployedContracts').catch(() => ({}));

      // Get current environment info
      const provider = await plugin.call('blockchain' as any, 'getCurrentProvider').catch(() => ({ displayName: 'unknown' }));
      const networkName = await plugin.call('blockchain' as any, 'getNetworkName').catch(() => 'unknown');
      const chainId = await plugin.call('blockchain' as any, 'getChainId').catch(() => 'unknown');

      // Get compilation result for ABIs
      const compilationResult = await plugin.call('solidity' as any, 'getCompilationResult').catch(() => null);

      const contracts = [];
      let totalContracts = 0;

      // Process deployed contracts
      for (const [networkKey, contractsData] of Object.entries(deployedContracts)) {
        if (contractsData && typeof contractsData === 'object') {
          for (const [address, contractInfo] of Object.entries(contractsData)) {
            const contractInstance = contractInfo as DeployedContractInstance;
            totalContracts++;

            // Try to get balance for the contract
            let balance = '0';
            try {
              balance = await plugin.call('blockchain' as any, 'getBalanceInEther', address);
            } catch (e) {
              // Ignore balance errors
            }

            // Extract ABI from compilation result or contract info
            let abi = contractInstance.abi || [];
            if (!abi.length && compilationResult?.data?.contracts) {
              // Try to find ABI in compilation result
              for (const [, fileContracts] of Object.entries(compilationResult.data.contracts)) {
                for (const [contractName, contractData] of Object.entries(fileContracts as any)) {
                  if (contractName === contractInstance.name) {
                    abi = (contractData as any).abi || [];
                    break;
                  }
                }
                if (abi.length) break;
              }
            }

            contracts.push({
              name: contractInstance.name || 'Unknown',
              address: address,
              network: networkKey,
              status: 'active',
              deployedAt: contractInstance.timestamp || new Date().toISOString(),
              lastInteraction: contractInstance.timestamp || new Date().toISOString(),
              transactionCount: 0,
              balance: balance,
              abi: abi,
              verificationStatus: contractInstance.verified ? 'verified' : 'unverified',
              deployer: contractInstance.from || 'unknown',
              gasUsed: contractInstance.gasUsed || 0
            });
          }
        }
      }

      // Get current network info
      const currentNetwork = {
        name: networkName,
        provider: provider.displayName || provider.name || 'unknown',
        chainId: chainId,
        contractCount: totalContracts,
        status: 'connected'
      };

      const activeDeployments = {
        contracts,
        currentNetwork,
        environment: {
          provider: provider.displayName || provider.name || 'unknown',
          networkName,
          chainId
        },
        summary: {
          totalActive: contracts.length,
          totalNetworks: 1,
          lastUpdate: new Date().toISOString(),
          hasCompilationData: !!compilationResult
        }
      };

      return this.createJsonContent('deployment://active', activeDeployments);
    } catch (error) {
      return this.createTextContent('deployment://active', `Error getting active deployments: ${error.message}`);
    }
  }

  private async getDeploymentNetworks(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      // Get current provider and network info
      const provider = await plugin.call('blockchain' as any, 'getCurrentProvider').catch(() => ({ displayName: 'unknown' }));
      const networkName = await plugin.call('blockchain' as any, 'getNetworkName').catch(() => 'unknown');
      const chainId = await plugin.call('blockchain' as any, 'getChainId').catch(() => 'unknown');

      // Get account information
      const runTabApi = await plugin.call('udapp' as any, 'getRunTabAPI').catch(() => ({ accounts: {} }));
      const accounts = [];

      if (runTabApi.accounts?.loadedAccounts) {
        for (const [address, displayName] of Object.entries(runTabApi.accounts.loadedAccounts)) {
          try {
            const balance = await plugin.call('blockchain' as any, 'getBalanceInEther', address);
            accounts.push({
              address: address,
              balance: `${balance} ETH`,
              displayName: displayName as string,
              isSelected: address === runTabApi.accounts.selectedAccount,
              isSmartAccount: (displayName as string)?.includes('[SMART]') || false
            });
          } catch (e) {
            accounts.push({
              address: address,
              balance: 'unknown',
              displayName: displayName as string,
              isSelected: address === runTabApi.accounts.selectedAccount,
              isSmartAccount: (displayName as string)?.includes('[SMART]') || false
            });
          }
        }
      }

      // Get deployed contracts count
      const deployedContracts = await plugin.call('udapp' as any, 'getDeployedContracts').catch(() => ({}));
      let totalDeployments = 0;

      for (const [, contracts] of Object.entries(deployedContracts)) {
        if (contracts && typeof contracts === 'object') {
          totalDeployments += Object.keys(contracts).length;
        }
      }

      // Get current network details
      const current = {
        name: networkName,
        provider: provider.displayName || provider.name || 'unknown',
        chainId: chainId,
        networkId: chainId,
        status: 'connected',
        deployments: totalDeployments,
        accounts: accounts.length,
        selectedAccount: runTabApi.accounts?.selectedAccount || null
      };

      // Get available providers list
      const availableProviders = await plugin.call('blockchain' as any, 'getProviders').catch(() => []);

      const configured = [{
        name: current.name,
        type: this.getNetworkType(chainId),
        chainId: current.chainId,
        provider: current.provider,
        status: 'connected',
        deployments: totalDeployments,
        accounts: accounts
      }];

      // Add other available providers
      for (const availableProvider of availableProviders) {
        if (availableProvider.name !== provider.name) {
          configured.push({
            name: availableProvider.displayName || availableProvider.name,
            type: 'available',
            chainId: 'unknown',
            provider: availableProvider.name,
            status: 'available',
            deployments: 0,
            accounts: []
          });
        }
      }

      const networks = {
        configured,
        current,
        environment: {
          currentProvider: provider.name,
          providerType: provider.kind || 'unknown',
          injectedProvider: provider.isInjected || false
        },
        statistics: {
          totalNetworks: configured.length,
          connectedNetworks: 1,
          totalDeployments,
          totalAccounts: accounts.length,
          selectedAccount: current.selectedAccount
        }
      };

      return this.createJsonContent('deployment://networks', networks);
    } catch (error) {
      return this.createTextContent('deployment://networks', `Error getting deployment networks: ${error.message}`);
    }
  }

  private getNetworkType(chainId: any): string {
    const id = parseInt(chainId.toString());
    switch (id) {
    case 1: return 'mainnet';
    case 11155111: return 'sepolia';
    case 5: return 'goerli';
    case 137: return 'polygon';
    case 1337: return 'local';
    default: return id > 1000 ? 'local' : 'testnet';
    }
  }

  private async getDeploymentTransactions(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      // Get deployed contracts to extract transaction history
      const deployedContracts = await plugin.call('udapp' as any, 'getDeployedContracts').catch(() => ({}));

      // Get current network info
      const provider = await plugin.call('blockchain' as any, 'getCurrentProvider').catch(() => ({ displayName: 'unknown' }));
      const networkName = await plugin.call('blockchain' as any, 'getProvider').catch(() => 'unknown');

      const deployments = [];
      const interactions = [];
      let totalGasUsed = 0;
      let totalCost = 0;
      let successfulTxs = 0;
      let totalTxs = 0;

      // Process deployment transactions
      for (const [networkKey, contracts] of Object.entries(deployedContracts)) {
        if (contracts && typeof contracts === 'object') {
          for (const [address, contractInfo] of Object.entries(contracts)) {
            const contractInstance = contractInfo as DeployedContractInstance;
            const gasUsed = parseInt(contractInstance.gasUsed?.toString() || '0');
            const gasPrice = contractInstance.gasPrice || '0';
            const costInWei = gasUsed * parseInt(gasPrice);
            const costInEth = costInWei / 1e18;

            totalGasUsed += gasUsed;
            totalCost += costInEth;
            totalTxs++;

            if (contractInstance.status === 'success' || !contractInstance.status) {
              successfulTxs++;
            }

            deployments.push({
              hash: contractInstance.transactionHash || 'unknown',
              type: 'deployment',
              contractName: contractInstance.name || 'Unknown',
              contractAddress: address,
              from: contractInstance.from || 'unknown',
              to: null,
              value: contractInstance.value || '0',
              gasUsed: gasUsed,
              gasPrice: gasPrice,
              effectiveGasPrice: gasPrice,
              status: contractInstance.status || 'unknown',
              blockNumber: contractInstance.blockNumber || 0,
              blockHash: contractInstance.blockNumber || 'unknown',
              timestamp: contractInstance.timestamp || new Date().toISOString(),
              network: networkKey,
              confirmations: 0, // confirmations not in interface
              constructorArgs: contractInstance.constructorArgs || []
            });
          }
        }
      }

      const transactions = {
        deployments,
        interactions,
        network: {
          name: networkName,
          provider: provider.displayName || provider.name || 'unknown'
        },
        summary: {
          totalTransactions: totalTxs,
          deploymentTransactions: deployments.length,
          interactionTransactions: interactions.length,
          totalGasUsed,
          totalCost: `${totalCost.toFixed(9)}`,
          successRate: totalTxs > 0 ? `${Math.round((successfulTxs / totalTxs) * 100)}%` : '0%',
          successfulTransactions: successfulTxs,
          failedTransactions: totalTxs - successfulTxs
        },
        generatedAt: new Date().toISOString()
      };

      return this.createJsonContent('deployment://transactions', transactions);
    } catch (error) {
      return this.createTextContent('deployment://transactions', `Error getting deployment transactions: ${error.message}`);
    }
  }

  private async getDeploymentConfig(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      // Get current provider and network info
      const provider = await plugin.call('blockchain' as any, 'getCurrentProvider').catch(() => ({ displayName: 'unknown' }));
      const networkName = await plugin.call('blockchain' as any, 'getProvider').catch(() => 'unknown');
      const chainId = await plugin.call('blockchain' as any, 'getChainId').catch(() => 'unknown');

      // Get available providers
      const availableProviders = await plugin.call('blockchain' as any, 'getProviders').catch(() => []);

      // Get account information
      const runTabApi = await plugin.call('udapp' as any, 'getRunTabAPI').catch(() => ({ accounts: {} }));
      const accounts = [];

      if (runTabApi.accounts?.loadedAccounts) {
        for (const [address, displayName] of Object.entries(runTabApi.accounts.loadedAccounts)) {
          try {
            const balance = await plugin.call('blockchain' as any, 'getBalanceInEther', address);
            accounts.push({
              address: address,
              balance: `${balance} ETH`,
              displayName: displayName as string,
              isSelected: address === runTabApi.accounts.selectedAccount,
              isSmartAccount: (displayName as string)?.includes('[SMART]') || false
            });
          } catch (e) {
            accounts.push({
              address: address,
              balance: 'unknown',
              displayName: displayName as string,
              isSelected: address === runTabApi.accounts.selectedAccount,
              isSmartAccount: (displayName as string)?.includes('[SMART]') || false
            });
          }
        }
      }

      // Get compiler configuration
      const compilerConfig = await plugin.call('solidity' as any, 'getCurrentCompilerConfig').catch(() => ({}));

      // Get gas settings (approximate from recent transactions)
      const deployedContracts = await plugin.call('udapp' as any, 'getDeployedContracts').catch(() => ({}));
      let avgGasPrice = '20000000000'; // default
      let avgGasUsed = 0;
      let contractCount = 0;

      for (const [netName, contracts] of Object.entries(deployedContracts)) {
        if (contracts && typeof contracts === 'object') {
          for (const [, contractInfo] of Object.entries(contracts)) {
            const contractInstance = contractInfo as DeployedContractInstance;
            if (contractInstance.gasPrice) avgGasPrice = contractInstance.gasPrice;
            if (contractInstance.gasUsed) {
              avgGasUsed += parseInt(contractInstance.gasUsed.toString());
              contractCount++;
            }
          }
        }
      }

      const config = {
        environment: {
          current: provider.displayName || provider.name || 'unknown',
          provider: provider.name,
          providerType: provider.kind || 'unknown',
          isInjected: provider.isInjected || false,
          networkName: networkName,
          chainId: chainId,
          networkId: chainId,
          available: availableProviders.map((p: any) => p.displayName || p.name)
        },
        accounts: accounts,
        selectedAccount: runTabApi.accounts?.selectedAccount || null,
        totalAccounts: accounts.length,
        gas: {
          averagePrice: avgGasPrice,
          averageUsed: contractCount > 0 ? Math.round(avgGasUsed / contractCount) : 0,
          priceUnit: 'wei',
          estimationEnabled: true
        },
        compiler: {
          version: compilerConfig.version || 'unknown',
          optimize: compilerConfig.optimize || false,
          runs: compilerConfig.runs || 200,
          evmVersion: compilerConfig.evmVersion || 'unknown',
          language: compilerConfig.language || 'Solidity'
        },
        deployment: {
          totalDeployments: contractCount,
          networks: Object.keys(deployedContracts),
          lastActivity: new Date().toISOString()
        },
        capabilities: {
          canDeploy: accounts.length > 0,
          canCompile: !!compilerConfig,
          hasAccounts: accounts.length > 0,
          networkConnected: provider.name !== 'unknown'
        },
        settings: {
          autoCompile: false,
          saveOnCompile: true,
          debug: false
        }
      };

      return this.createJsonContent('deployment://config', config);
    } catch (error) {
      return this.createTextContent('deployment://config', `Error getting deployment config: ${error.message}`);
    }
  }

  private async getContractInstance(uri: string, plugin: Plugin): Promise<IMCPResourceContent> {
    const contractAddress = uri.replace('instance://', '');

    try {
      // Get deployed contracts to find this specific instance
      const deployedContracts = await plugin.call('udapp' as any, 'getDeployedContracts').catch(() => ({}));

      let contractInfo = null;
      let networkKey = null;

      // Find the contract in deployed contracts
      for (const [network, contracts] of Object.entries(deployedContracts)) {
        if (contracts && typeof contracts === 'object') {
          const found = (contracts as any)[contractAddress];
          if (found) {
            contractInfo = found;
            networkKey = network;
            break;
          }
        }
      }

      if (!contractInfo) {
        return this.createTextContent(uri, `Contract instance not found: ${contractAddress}`);
      }

      // Get current balance
      let balance = '0';
      try {
        balance = await plugin.call('blockchain' as any, 'getBalanceInEther', contractAddress);
      } catch (e) {
        // Ignore balance errors
      }

      // Get ABI from compilation result if not in contract info
      let abi = contractInfo.abi || [];
      if (!abi.length) {
        try {
          const compilationResult = await plugin.call('solidity' as any, 'getCompilationResult');
          if (compilationResult?.data?.contracts) {
            for (const [, fileContracts] of Object.entries(compilationResult.data.contracts)) {
              for (const [contractName, contractData] of Object.entries(fileContracts as any)) {
                if (contractName === contractInfo.name) {
                  abi = (contractData as any).abi || [];
                  break;
                }
              }
              if (abi.length) break;
            }
          }
        } catch (e) {
          // Ignore compilation result errors
        }
      }

      // Get network information
      const provider = await plugin.call('blockchain' as any, 'getCurrentProvider').catch(() => ({ displayName: 'unknown' }));
      const networkName = await plugin.call('blockchain' as any, 'getNetworkName').catch(() => 'unknown');

      const instance = {
        address: contractAddress,
        name: contractInfo.name || 'Unknown',
        network: networkKey || networkName,
        deployment: {
          transactionHash: contractInfo.transactionHash || 'unknown',
          blockNumber: contractInfo.blockNumber || 0,
          deployer: contractInfo.from || 'unknown',
          deployedAt: contractInfo.timestamp || new Date().toISOString(),
          constructorArgs: contractInfo.constructorArgs || [],
          gasUsed: contractInfo.gasUsed || 0,
          gasPrice: contractInfo.gasPrice || '0',
          value: contractInfo.value || '0'
        },
        abi: abi,
        state: {
          balance: `${balance} ETH`,
          transactionCount: contractInfo.transactionCount || 0,
          lastInteraction: contractInfo.lastInteraction || contractInfo.timestamp || new Date().toISOString(),
          status: contractInfo.status || 'active'
        },
        interactions: contractInfo.interactions || [],
        verification: {
          status: contractInfo.verified ? 'verified' : 'unverified',
          source: contractInfo.sourceCode || null,
          explorer: null
        },
        environment: {
          provider: provider.displayName || provider.name || 'unknown',
          networkName: networkName,
          chainId: await plugin.call('blockchain' as any, 'getChainId').catch(() => 'unknown')
        },
        metadata: {
          compiler: contractInfo.compiler || 'unknown',
          optimization: contractInfo.optimization || false,
          runs: contractInfo.runs || 0
        }
      };

      return this.createJsonContent(uri, instance);
    } catch (error) {
      return this.createTextContent(uri, `Error getting contract instance: ${error.message}`);
    }
  }
}