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
  HexToDecimalArgs,
  TimestampToDateArgs
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
 * Unix Timestamp to Human Readable Date Converter Tool Handler
 */
export class TimestampToDateHandler extends BaseToolHandler {
  name = 'timestamp_to_date';
  description = 'Convert Unix timestamp to human readable date/time';
  inputSchema = {
    type: 'object',
    properties: {
      timestamp: {
        type: ['string', 'number'],
        description: 'Unix timestamp (seconds since epoch) to convert to human readable date'
      },
      format: {
        type: 'string',
        enum: ['iso', 'local', 'utc'],
        description: 'Output format: "iso" for ISO string, "local" for local date string, "utc" for UTC string',
        default: 'iso'
      }
    },
    required: ['timestamp']
  };

  getPermissions(): string[] {
    return ['utils:convert'];
  }

  validate(args: TimestampToDateArgs): boolean | string {
    const required = this.validateRequired(args, ['timestamp']);
    if (required !== true) return required;

    // Convert to number for validation
    const timestampNum = typeof args.timestamp === 'string' ? parseInt(args.timestamp, 10) : args.timestamp;

    // Validate that timestamp is a valid number
    if (isNaN(timestampNum)) {
      return 'Timestamp must be a valid number';
    }

    // Check if timestamp is reasonable (between 1970 and far future)
    if (timestampNum < 0 || timestampNum > 4294967295) {
      return 'Timestamp must be a valid Unix timestamp (0 to 4294967295)';
    }

    // Validate format if provided
    if (args.format && !['iso', 'local', 'utc'].includes(args.format)) {
      return 'Format must be one of: iso, local, utc';
    }

    return true;
  }

  async execute(args: TimestampToDateArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      const timestamp = typeof args.timestamp === 'string' ? parseInt(args.timestamp, 10) : args.timestamp;
      const format = args.format || 'iso';

      // Create Date object from timestamp (multiply by 1000 to convert seconds to milliseconds)
      const date = new Date(timestamp * 1000);

      // Check if date is valid
      if (isNaN(date.getTime())) {
        return this.createErrorResult('Invalid timestamp - cannot convert to valid date');
      }

      let formattedDate: string;
      let formatDescription: string;

      switch (format) {
      case 'iso':
        formattedDate = date.toISOString();
        formatDescription = 'ISO 8601';
        break;
      case 'local':
        formattedDate = date.toString();
        formatDescription = 'Local time string';
        break;
      case 'utc':
        formattedDate = date.toUTCString();
        formatDescription = 'UTC string';
        break;
      default:
        formattedDate = date.toISOString();
        formatDescription = 'ISO 8601';
      }

      return this.createSuccessResult({
        success: true,
        timestamp: timestamp,
        date: formattedDate,
        format: format,
        message: `${timestamp} (Unix timestamp) = ${formattedDate} (${formatDescription})`,
        timezone: format === 'local' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined
      });
    } catch (error) {
      return this.createErrorResult(`Failed to convert timestamp to date: ${error.message}`);
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
      description: 'Convert wei to ether. ALWAYS use this tool when you want to output an ETHER value knowing the WEI value.',
      inputSchema: new WeiToEtherHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['utils:convert'],
      handler: new WeiToEtherHandler()
    },
    {
      name: 'ether_to_wei',
      description: 'Convert ether to wei. ALWAYS use this tool when you want to output a WEI value knowing the ETHER value.',
      inputSchema: new EtherToWeiHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['utils:convert'],
      handler: new EtherToWeiHandler()
    },
    {
      name: 'decimal_to_hex',
      description: 'Convert decimal number to hexadecimal. ALWAYS use this tool when you need an hexadecimal value knowing the decimal value (when you display a value to the user, when a generated script or MCP tool require a specific type, etc...).',
      inputSchema: new DecimalToHexHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['utils:convert'],
      handler: new DecimalToHexHandler()
    },
    {
      name: 'hex_to_decimal',
      description: 'Convert hexadecimal to decimal number. ALWAYS use this tool when you need an decimal value knowing the hexadecimal value (when you display a value to the user, when a generated script or MCP tool require a specific type, etc...).',
      inputSchema: new HexToDecimalHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['utils:convert'],
      handler: new HexToDecimalHandler()
    },
    {
      name: 'timestamp_to_date',
      description: 'Convert Unix timestamp to human readable date/time. ALWAYS use this tool when you want to output a human readable date knowing the Unix timestamp.',
      inputSchema: new TimestampToDateHandler().inputSchema,
      category: ToolCategory.DEPLOYMENT,
      permissions: ['utils:convert'],
      handler: new TimestampToDateHandler()
    }
  ];
}
