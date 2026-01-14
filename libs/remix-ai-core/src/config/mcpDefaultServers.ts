import { IMCPServer } from '../types/mcp';
import { endpointUrls } from "@remix-endpoints-helper"

export interface MCPDefaultServersConfig {
  version: string;
  defaultServers: IMCPServer[];
}

export const mcpDefaultServersConfig: MCPDefaultServersConfig = {
  version: "1.0.0",
  defaultServers: [
    {
      name: 'Remix IDE Server',
      description: 'Built-in Remix IDE MCP server providing access to workspace files and IDE features',
      transport: 'internal',
      autoStart: true,
      enabled: true,
      timeout: 5000,
      isBuiltIn: true
    },
    {
      name: 'OpenZeppelin Contracts',
      description: 'OpenZeppelin smart contract library and security tools',
      transport: 'http',
      url: endpointUrls.mcpCorsProxy + '/solidity',
      autoStart: true,
      enabled: true,
      timeout: 30000
    },
    {
      name: 'OpenZeppelin Contracts Cairo',
      description: 'OpenZeppelin smart contract library and security tools',
      transport: 'http',
      url: endpointUrls.mcpCorsProxy + '/cairo',
      autoStart: true,
      enabled: true,
      timeout: 30000
    },
    {
      name: 'OpenZeppelin Contracts Stellar',
      description: 'OpenZeppelin smart contract library and security tools',
      transport: 'http',
      url: endpointUrls.mcpCorsProxy + '/stellar',
      autoStart: true,
      enabled: true,
      timeout: 30000
    },
    {
      name: 'OpenZeppelin Contracts Stylus',
      description: 'OpenZeppelin smart contract library and security tools',
      transport: 'http',
      url: endpointUrls.mcpCorsProxy + '/stylus',
      autoStart: true,
      enabled: true,
      timeout: 30000
    },
    {
      name: 'Alchemy',
      description: 'Alchemy blockchain data query',
      transport: 'http',
      url: endpointUrls.mcpCorsProxy + '/alchemy',
      autoStart: true,
      enabled: true,
      timeout: 30000
    }
    // {
    //   name: 'Etherscan',
    //   description: 'Etherscan block explorer',
    //   transport: 'http',
    //   url: endpointUrls.mcpCorsProxy + '/etherscan',
    //   autoStart: true,
    //   enabled: true,
    //   timeout: 30000
    // }
  ]
};
