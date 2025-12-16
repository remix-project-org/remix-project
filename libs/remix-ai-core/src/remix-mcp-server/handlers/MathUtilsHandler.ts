/**
 * Math Utilities Tool Handlers for Remix MCP Server
 */

import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import {
  ToolCategory,
  RemixToolDefinition,
  WeiToEtherArgs,
  EtherToWeiArgs,
  DecimalToHexArgs,
  HexToDecimalArgs
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';
import { formatEther, parseEther } from 'ethers';

/**
 * Wei to Ether Converter Tool Handler
 */
export class WeiToEtherHandler extends BaseToolHandler {
  name = 'wei_to_ether';
  description = 'Convert wei to ether';
  inputSchema = {
    type: 'object',
    properties: {
      wei: {
        type: 'string',
        description: 'Amount in wei to convert to ether'
      }
    },
    required: ['wei']
  };

  getPermissions(): string[] {
    return ['utils:convert'];
  }

  validate(args: WeiToEtherArgs): boolean | string {
    const required = this.validateRequired(args, ['wei']);
    if (required !== true) return required;

    const types = this.validateTypes(args, { wei: 'string' });
    if (types !== true) return types;

    // Validate that wei is a valid number
    if (!/^\d+$/.test(args.wei)) {
      return 'Wei must be a valid positive integer';
    }

    return true;
  }

  async execute(args: WeiToEtherArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const ether = formatEther(args.wei);

      return this.createSuccessResult({
        success: true,
        wei: args.wei,
        ether: ether,
        message: `${args.wei} wei = ${ether} ETH`
      });
    } catch (error) {
      return this.createErrorResult(`Failed to convert wei to ether: ${error.message}`);
    }
  }
}

/**
 * Ether to Wei Converter Tool Handler
 */
export class EtherToWeiHandler extends BaseToolHandler {
  name = 'ether_to_wei';
  description = 'Convert ether to wei';
  inputSchema = {
    type: 'object',
    properties: {
      ether: {
        type: 'string',
        description: 'Amount in ether to convert to wei'
      }
    },
    required: ['ether']
  };

  getPermissions(): string[] {
    return ['utils:convert'];
  }

  validate(args: EtherToWeiArgs): boolean | string {
    const required = this.validateRequired(args, ['ether']);
    if (required !== true) return required;

    const types = this.validateTypes(args, { ether: 'string' });
    if (types !== true) return types;

    // Validate that ether is a valid number
    if (!/^\d+\.?\d*$/.test(args.ether)) {
      return 'Ether must be a valid positive number';
    }

    return true;
  }

  async execute(args: EtherToWeiArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const wei = parseEther(args.ether).toString();

      return this.createSuccessResult({
        success: true,
        ether: args.ether,
        wei: wei,
        message: `${args.ether} ETH = ${wei} wei`
      });
    } catch (error) {
      return this.createErrorResult(`Failed to convert ether to wei: ${error.message}`);
    }
  }
}

/**
 * Decimal to Hex Converter Tool Handler
 */
export class DecimalToHexHandler extends BaseToolHandler {
  name = 'decimal_to_hex';
  description = 'Convert decimal number to hexadecimal';
  inputSchema = {
    type: 'object',
    properties: {
      decimal: {
        type: ['string', 'number'],
        description: 'Decimal number to convert to hexadecimal'
      }
    },
    required: ['decimal']
  };

  getPermissions(): string[] {
    return ['utils:convert'];
  }

  validate(args: DecimalToHexArgs): boolean | string {
    const required = this.validateRequired(args, ['decimal']);
    if (required !== true) return required;

    // Convert to string for validation
    const decimalStr = String(args.decimal);

    // Validate that decimal is a valid integer
    if (!/^-?\d+$/.test(decimalStr)) {
      return 'Decimal must be a valid integer';
    }

    return true;
  }

  async execute(args: DecimalToHexArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const decimal = typeof args.decimal === 'string' ? parseInt(args.decimal, 10) : args.decimal;

      // Check if the number is valid
      if (isNaN(decimal)) {
        return this.createErrorResult('Invalid decimal number');
      }

      // Convert to hex (with 0x prefix)
      const hex = '0x' + (decimal < 0 ?
        (BigInt(decimal) & BigInt('0xFFFFFFFFFFFFFFFF')).toString(16) :
        decimal.toString(16));

      return this.createSuccessResult({
        success: true,
        decimal: decimal,
        hex: hex,
        message: `${decimal} (decimal) = ${hex} (hexadecimal)`
      });
    } catch (error) {
      return this.createErrorResult(`Failed to convert decimal to hex: ${error.message}`);
    }
  }
}

/**
 * Hex to Decimal Converter Tool Handler
 */
export class HexToDecimalHandler extends BaseToolHandler {
  name = 'hex_to_decimal';
  description = 'Convert hexadecimal to decimal number';
  inputSchema = {
    type: 'object',
    properties: {
      hex: {
        type: 'string',
        description: 'Hexadecimal value to convert to decimal (with or without 0x prefix)'
      }
    },
    required: ['hex']
  };

  getPermissions(): string[] {
    return ['utils:convert'];
  }

  validate(args: HexToDecimalArgs): boolean | string {
    const required = this.validateRequired(args, ['hex']);
    if (required !== true) return required;

    const types = this.validateTypes(args, { hex: 'string' });
    if (types !== true) return types;

    // Validate that hex is a valid hexadecimal string
    const hexStr = args.hex.toLowerCase().replace(/^0x/, '');
    if (!/^[0-9a-f]+$/.test(hexStr)) {
      return 'Hex must be a valid hexadecimal string (with or without 0x prefix)';
    }

    return true;
  }

  async execute(args: HexToDecimalArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Remove 0x prefix if present
      const hexStr = args.hex.toLowerCase().replace(/^0x/, '');

      // Convert to decimal
      const decimal = parseInt(hexStr, 16);

      if (isNaN(decimal)) {
        return this.createErrorResult('Invalid hexadecimal value');
      }

      return this.createSuccessResult({
        success: true,
        hex: args.hex,
        decimal: decimal,
        message: `${args.hex} (hexadecimal) = ${decimal} (decimal)`
      });
    } catch (error) {
      return this.createErrorResult(`Failed to convert hex to decimal: ${error.message}`);
    }
  }
}

/**
 * Create math utilities tool definitions
 */
export function createMathUtilsTools(): RemixToolDefinition[] {
  return [
    {
      name: 'wei_to_ether',
      description: 'Convert wei to ether',
      inputSchema: new WeiToEtherHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['utils:convert'],
      handler: new WeiToEtherHandler()
    },
    {
      name: 'ether_to_wei',
      description: 'Convert ether to wei',
      inputSchema: new EtherToWeiHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['utils:convert'],
      handler: new EtherToWeiHandler()
    },
    {
      name: 'decimal_to_hex',
      description: 'Convert decimal number to hexadecimal',
      inputSchema: new DecimalToHexHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['utils:convert'],
      handler: new DecimalToHexHandler()
    },
    {
      name: 'hex_to_decimal',
      description: 'Convert hexadecimal to decimal number',
      inputSchema: new HexToDecimalHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['utils:convert'],
      handler: new HexToDecimalHandler()
    }
  ];
}
