import { IMCPTool } from "../../types/mcp";

export class ToolApiGenerator {

  generateAPIDescription(): string {
    return `
Use callMCPTool(toolName, args) to call tools. You can only perform one single task or tool call sequentially. 
Do not allow chaining tool calls. Do not write function or complex code.
Each callMCPTool returns a object according to this interface
export interface IMCPToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

Pay attention that the result of callMCPTool is not a string but an object in the occasion you have to process the tool result. 

Example of correct usage:
const toolReturnValue = return (await callMCPTool('tool_name', { param1: 'value1' })).content[0].text

Every tool returns a success or failed response following this schema:
{
  content: [{
    type: 'text',
    text: typeof content === 'string' ? content : JSON.stringify(content, replacer, 2)
  }],
  isError: false
};

Example Taks:

## Tasks 1
return await callMCPTool('solidity_compile', { file: 'contract.sol' });

## Task 2
const deployed = await callMCPTool('deploy_contract', { contractName: 'MyToken' });
return deployed


## Task 3
// With loops for batch operations
const files = ['contracts/Token.sol', 'contracts/NFT.sol', 'contracts/DAO.sol'];
for (const file of files) {
  await callMCPTool('solidity_compile', { file: 'contracts/' + file });
}

## Sequantial tasks
### Task 4.1 
// first: compile a contract
return await callMCPTool('solidity_compile', { file: 'contract.sol' });

### Task 4.2
// second: deploy a contract
return await callMCPTool('deploy_contract', { contractName: 'MyToken' });


Do not use remix.call(..) or any other method to interact with Remix, only use callMCPTool as described above.
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

      list += `- ${tool.name}({${paramsList}}) - ${tool.description}\n\n`;
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
