import { IMCPServer } from '../types/mcp';

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
      url: 'https://mcp.openzeppelin.com/contracts/solidity/mcp',
      autoStart: true,
      enabled: true,
      timeout: 30000
    },
    {
      name: 'OpenZeppelin Contracts Cairo',
      description: 'OpenZeppelin smart contract library and security tools',
      transport: 'http',
      url: 'https://mcp.openzeppelin.com/contracts/cairo/mcp',
      autoStart: true,
      enabled: true,
      timeout: 30000
    },
    {
      name: 'OpenZeppelin Contracts Stellar',
      description: 'OpenZeppelin smart contract library and security tools',
      transport: 'http',
      url: 'https://mcp.openzeppelin.com/contracts/stellar/mcp',
      autoStart: true,
      enabled: true,
      timeout: 30000
    },
    {
      name: 'OpenZeppelin Contracts Stylus',
      description: 'OpenZeppelin smart contract library and security tools',
      transport: 'http',
      url: 'https://mcp.openzeppelin.com/contracts/stylus/mcp',
      autoStart: true,
      enabled: true,
      timeout: 30000
    }
  ]
};
