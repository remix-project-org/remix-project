/**
 * Compilation Resource Provider - Provides access to compilation results and artifacts
 */

import axios from 'axios';
import { Plugin } from '@remixproject/engine';
import { IMCPResource, IMCPResourceContent } from '../../types/mcp';
import { BaseResourceProvider } from '../registry/RemixResourceProviderRegistry';
import { ResourceCategory } from '../types/mcpResources';

export class TutorialsResourceProvider extends BaseResourceProvider {
  name = 'tutorials';
  description = 'Provides access to a list of tutorials and their details. If applicable it returns the tutorial that the user is at the moment viewing.';
  private _plugin

  constructor (plugin){
    super()
    this._plugin = plugin
  }
  async getResources(plugin: Plugin): Promise<IMCPResource[]> {
    const resources: IMCPResource[] = [];

    try {
      // Add tutorial resources
      resources.push(
        this.createResource(
          'tutorials://list',
          'Tutorials',
          'List of tutorials for learning web3, solidity, blockchain and smart contract development.',
          'application/json',
          {
            category: ResourceCategory.TUTORIALS,
            tags: ['solidity', 'web3', 'tutorial', 'basics'],
            priority: 9
          }
        )
      )

      resources.push(
        this.createResource(
          'tutorials://current',
          'Tutorials',
          'Current tutorial that the user is at the moment viewing.',
          'application/json',
          {
            category: ResourceCategory.TUTORIALS,
            tags: ['solidity', 'web3', 'tutorial', 'basics'],
            priority: 9
          }
        )
      )
    } catch (error) {
      console.warn('Failed to get tutorials resources:', error);
    }

    return resources;
  }

  async getResourceContent(uri: string, plugin: Plugin): Promise<IMCPResourceContent> {
    if (uri === 'tutorials://list') {
      return this.getTutorialsList(plugin);
    }

    if (uri === 'tutorials://current') {
      return this.currentTutorial(plugin);
    }

    throw new Error(`Unsupported compilation resource URI: ${uri}`);
  }

  canHandle(uri: string): boolean {
    return uri.startsWith('tutorials://');
  }

  private async currentTutorial(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      const tutorial = await plugin.call('LearnEth', 'getCurrentTutorial')
      return this.createJsonContent('tutorials://current', tutorial);
    } catch (error) {
      return this.createTextContent('tutorials://current', `Error getting current tutorial: ${error.message}`);
    }
  }

  private async getTutorialsList(plugin: Plugin): Promise<IMCPResourceContent> {
    try {
      const tutorials = await axios('https://raw.githubusercontent.com/remix-project-org/remix-workshops/refs/heads/master/config-properties.json')
      return this.createJsonContent('tutorials://list', tutorials.data);
    } catch (error) {
      return this.createTextContent('tutorials://list', `Error getting tutorials: ${error.message}`);
    }
  }
}