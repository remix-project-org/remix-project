/**
 * Deployment Resource Provider - Provides access to deployment history and contract instances
 */

import { Plugin } from '@remixproject/engine';
import { IMCPResource, IMCPResourceContent } from '../../types/mcp';
import { BaseResourceProvider } from '../registry/RemixResourceProviderRegistry';
import { ResourceCategory } from '../types/mcpResources';

export class DeploymentResourceProvider extends BaseResourceProvider {
  name = 'deployment';
  description = 'Provides access to deployment history, contract instances, and transaction records';
  private _plugin: Plugin;

  constructor(plugin: Plugin) {
    super();
    this._plugin = plugin;
  }

  async getResources(plugin: Plugin): Promise<IMCPResource[]> {
    const resources: IMCPResource[] = [];

    try {
      // Add deployment overview resources
      await this.addContractInstances(plugin, resources);

    } catch (error) {
      console.warn('Failed to get deployment resources:', error);
    }

    return resources;
  }

  async getResourceContent(uri: string, plugin: Plugin): Promise<IMCPResourceContent> {
    throw new Error(`Unsupported deployment resource URI: ${uri}`);
  }

  canHandle(uri: string): boolean {
    return uri.startsWith('instance://');
  }

  private async addContractInstances(plugin: Plugin, resources: IMCPResource[]): Promise<void> {
    try {
      const deployedContracts = await plugin.call('udappDeployedContracts' as any, 'getDeployedContracts');
      deployedContracts.forEach((contract: any) => {
        resources.push(
          this.createResource(
            `instance://${contract.address}`,
            `${contract.name} Instance`,
            `Deployed instance of ${contract.name} at ${contract.address}`,
            'application/json',
            {
              category: ResourceCategory.DEPLOYMENT_DATA,
              tags: ['instance', 'contract', contract.name],
              contractName: contract.name,
              contractAddress: contract.address,
              deployedAt: contract.timestamp || new Date().toISOString(),
              abi: contract.abi,
              priority: 4
            }
          )
        )
      })
    } catch (error) {
      console.warn('Failed to add contract instances:', error);
    }
  }
}