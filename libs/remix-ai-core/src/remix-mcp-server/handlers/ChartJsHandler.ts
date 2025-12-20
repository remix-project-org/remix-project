/**
 * Chart.js Tool Handlers for Remix MCP Server
 *
 * Provides functionality to generate charts using Chart.js library
 */
import { StringToBytesErrorType } from 'viem';
import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import {
  ToolCategory,
  RemixToolDefinition
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';

/**
 * Chart.js argument types
 */
export interface ChartJsGenerateArgs {
  chartType: string;
  dataTransformFn: string;
  rawDataPath: string;
  description: string
  title: string
}

/**
 * Chart.js result types
 */
export interface ChartJsGenerateResult {
  success: boolean;
  chartUrl?: string;
  error?: string;
}

/**
 * Chart.js Generate Tool Handler
 */
export class ChartJsGenerateHandler extends BaseToolHandler {
  name = 'chartjs_generate';
  description = 'Generate charts using Chart.js library with custom data transformation';
  inputSchema = {
    type: 'object',
    properties: {
      chartType: {
        type: 'string',
        description: 'Type of chart to generate (bar, line, pie, doughnut, radar, polarArea, bubble, scatter)',
        enum: ['bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea', 'bubble', 'scatter']
      },
      dataTransformFn: {
        type: 'string',
        description: 'A string representing a function that transforms raw data into Chart.js compatible format. The function should accept data (as an already parsed JSON object) as parameter and return an object with labels, datasets, etc. Example: "(data) => ({ labels: data.map(d => d.name), datasets: [{ label: \'Values\', data: data.map(d => d.value) }] })" . That function will be wrapped with: `return (<your code>>)(data)'
      },
      rawDataPath: {
        type: 'string',
        description: 'Path to the raw data to be transformed and visualized'
      },
      description: {
        type: 'string',
        description: 'A short description of the data being visualized'
      },
      title: {
        type: 'string',
        description: 'A title that define what this visualization is about'
      }
    },
    required: ['chartType', 'dataTransformFn', 'rawDataPath']
  };

  getPermissions(): string[] {
    return ['chartjs:generate'];
  }

  validate(args: ChartJsGenerateArgs): boolean | string {
    const required = this.validateRequired(args, ['chartType', 'dataTransformFn', 'rawDataPath']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      chartType: 'string',
      dataTransformFn: 'string'
    });
    if (types !== true) return types;

    if (args.chartType.trim().length === 0) {
      return 'Chart type cannot be empty';
    }

    if (args.dataTransformFn.trim().length === 0) {
      return 'Data transformation function cannot be empty';
    }

    const validChartTypes = ['bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea', 'bubble', 'scatter'];
    if (!validChartTypes.includes(args.chartType)) {
      return `Invalid chart type. Must be one of: ${validChartTypes.join(', ')}`;
    }

    return true;
  }

  async execute(args: ChartJsGenerateArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Show a notification that chart generation is starting
      plugin.call('notification', 'toast', `Generating ${args.chartType} chart...`);

      // Call the chartjs plugin to generate the chart
      const chartUrl = await plugin.call(
        'chartjs',
        'generateChart',
        args.chartType,
        args.dataTransformFn,
        args.rawDataPath,
        args.description,
        args.title
      );

      const result: ChartJsGenerateResult = {
        success: true,
        chartUrl: chartUrl
      };

      // Show success notification
      plugin.call('notification', 'toast', `Chart generated successfully!`);

      return this.createSuccessResult(result);

    } catch (error) {
      console.error('Chart.js generation error:', error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      // Show error notification
      plugin.call('notification', 'toast', `Chart generation failed: ${errorMessage}`);

      return this.createErrorResult(`Chart generation failed: ${errorMessage}`);
    }
  }
}

/**
 * Create Chart.js tool definitions
 */
export function createChartJsTools(): RemixToolDefinition[] {
  return [
    {
      name: 'chartjs_generate',
      description: 'Generate charts using Chart.js library with custom data transformation function',
      inputSchema: new ChartJsGenerateHandler().inputSchema,
      category: ToolCategory.ANALYSIS,
      permissions: ['chartjs:generate'],
      handler: new ChartJsGenerateHandler()
    }
  ];
}
