import { IMCPTool } from "../../types/mcp";

export class ToolApiGenerator {

  generateAPIDescription(): string {
    return `
Use callMCPTool(toolName, args) to call tools. You can perform multiple tasks by chaining tool calls.
Each callMCPTool returns a object according to this interface
export interface IMCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

Examples:
// Reading files - returns string content directly
const fileContent = await callMCPTool('file_read', { path: 'contract.sol' });
const modified = fileContent.replace('old', 'new');

// Multiple tasks 1
const compiled = await callMCPTool('solidity_compile', { file: 'contract.sol' });
const deployed = await callMCPTool('deploy_contract', { contractName: 'MyToken' });


// With loops for batch operations
const files = ['contracts/Token.sol', 'contracts/NFT.sol', 'contracts/DAO.sol'];
for (const file of files) {
  await callMCPTool('solidity_compile', { file: 'contracts/' + file });
}
`;
  }

  /**
   * Generate compact tool list with exact parameter signatures
   */
  generateToolsList(tools: IMCPTool[]): string {
    let list = 'Available tools:\n';

    for (const tool of tools) {
      const requiredParams = tool.inputSchema.required || [];
      const allParams = tool.inputSchema.properties || {};

      const paramsList = Object.entries(allParams)
        .map(([name, schema]: [string, any]) => {
          const isRequired = requiredParams.includes(name);
          const type = this.jsonSchemaToTsType(schema);
          return `${name}${isRequired ? '' : '?'}: ${type}`;
        })
        .join(', ');

      // Truncate description to max 50 characters
      const description = tool.description.length > 50
        ? tool.description.substring(0, 50) + '...'
        : tool.description;

      list += `- ${tool.name}({${paramsList}}) - ${description}\n\n`;
    }

    return list;
  }

  private jsonSchemaToTsType(schema: any): string {
    if (!schema.type) {
      return 'any';
    }

    switch (schema.type) {
    case 'string':
      if (schema.enum) {
        return schema.enum.map((e: string) => `'${e}'`).join(' | ');
      }
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      if (schema.items) {
        const itemType = this.jsonSchemaToTsType(schema.items);
        return `${itemType}[]`;
      }
      return 'any[]';
    case 'object':
      if (schema.properties) {
        const props = Object.entries(schema.properties)
          .map(([key, val]) => `${key}: ${this.jsonSchemaToTsType(val as any)}`)
          .join('; ');
        return `{ ${props} }`;
      }
      return 'Record<string, any>';
    default:
      return 'any';
    }
  }
}
