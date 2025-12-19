/* eslint-disable no-async-promise-executor */
/**
 * Amp Query Tool Handlers for Remix MCP Server
 *
 * Provides functionality to query data using the Amp hosted server
 */
const path = require("path");
import { IMCPToolResult } from '../../types/mcp';
import { BaseToolHandler } from '../registry/RemixToolRegistry';
import {
  ToolCategory,
  RemixToolDefinition
} from '../types/mcpTools';
import { Plugin } from '@remixproject/engine';

/**
 * Amp Query argument types
 */
export interface AmpQueryArgs {
  query: string
}

/**
 * Amp Query result types
 */
export interface AmpQueryResult<T = any> {
  success: boolean;
  data: Array<T>;
  rowCount: number;
  query: string;
  error?: string;
}

/**
 * Amp Query Tool Handler
 */
export class AmpQueryHandler extends BaseToolHandler {
  name = 'amp_query';
  description = 'Execute SQL queries against the Amp hosted server to retrieve blockchain data';
  inputSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'SQL query to execute against the Amp server'
      }
    },
    required: ['query']
  };

  getPermissions(): string[] {
    return ['amp:query'];
  }

  validate(args: AmpQueryArgs): boolean | string {
    const required = this.validateRequired(args, ['query']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      query: 'string'
    });
    if (types !== true) return types;

    if (args.query.trim().length === 0) {
      return 'Query cannot be empty';
    }

    return true;
  }

  async execute(args: AmpQueryArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Show a notification that the query is being executed
      plugin.call('notification', 'toast', `Executing Amp query...`);

      const authToken: string | undefined = await plugin.call('config', 'getEnv', 'AMP_QUERY_TOKEN');
      const baseUrl: string | undefined = await plugin.call('config', 'getEnv', 'AMP_QUERY_URL');
      // Perform the Amp query
      const data = await plugin.call('amp', 'performAmpQuery', args.query, baseUrl, authToken)

      const result: AmpQueryResult = {
        success: true,
        data: data,
        rowCount: data.length,
        query: args.query
      };

      // Show success notification
      plugin.call('notification', 'toast', `Query completed successfully. Retrieved ${data.length} rows.`);

      return this.createSuccessResult(result);

    } catch (error) {
      console.error('Amp query error:', error?.cause?.rawMessage);

      const errorMessage = error?.cause?.rawMessage

      // Show error notification
      plugin.call('notification', 'toast', `Amp query failed: ${errorMessage}`);

      return this.createErrorResult(`Amp query failed: ${errorMessage}`);
    }
  }
}

/**
 * Amp Dataset Manifest argument types
 */
export interface AmpDatasetManifestArgs {
  datasetName: string;
  version: string;
}

export interface AmpVisualizationArgs {
  path: string
  query: string
  description: string
}

/**
 * Amp Dataset Manifest result types
 */
export interface AmpDatasetManifestResult {
  success: boolean;
  manifest?: any;
  datasetName: string;
  version: string;
  error?: string;
}

/**
 * Amp Dataset List result types
 */
export interface AmpDatasetListResult {
  success: boolean;
  result: any
}

export interface AmpVisualizationResult {
  success: boolean;
  result: any
}

/**
 * Amp Dataset Manifest Tool Handler
 */
export class AmpDatasetManifestHandler extends BaseToolHandler {
  name = 'amp_dataset_manifest';
  description = 'Fetch manifest information for a specific Amp dataset version';
  inputSchema = {
    type: 'object',
    properties: {
      datasetName: {
        type: 'string',
        description: 'Dataset name in format owner/name (e.g., "shiyasmohd/counter")'
      },
      version: {
        type: 'string',
        description: 'Dataset version (e.g., "0.0.2")'
      }
    },
    required: ['datasetName', 'version']
  };

  getPermissions(): string[] {
    return ['amp:dataset:manifest'];
  }

  validate(args: AmpDatasetManifestArgs): boolean | string {
    const required = this.validateRequired(args, ['datasetName', 'version']);
    if (required !== true) return required;

    const types = this.validateTypes(args, {
      datasetName: 'string',
      version: 'string'
    });
    if (types !== true) return types;

    if (args.datasetName.trim().length === 0) {
      return 'Dataset name cannot be empty';
    }

    if (args.version.trim().length === 0) {
      return 'Version cannot be empty';
    }

    return true;
  }

  async execute(args: AmpDatasetManifestArgs, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Show a notification that the manifest is being fetched
      plugin.call('notification', 'toast', `Fetching manifest for ${args.datasetName}@${args.version}...`);

      const response = await plugin.call('amp', 'fetchManifest', args.datasetName, args.version)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const manifest = await response.json();

      const result: AmpDatasetManifestResult = {
        success: true,
        manifest: manifest,
        datasetName: args.datasetName,
        version: args.version
      };

      // Show success notification
      plugin.call('notification', 'toast', `Manifest fetched successfully for ${args.datasetName}@${args.version}`);

      return this.createSuccessResult(result);

    } catch (error) {
      console.error('Amp dataset manifest fetch error:', error?.cause?.rawMessage);

      const errorMessage = error?.cause?.rawMessage

      // Show error notification
      plugin.call('notification', 'toast', `Failed to fetch manifest: ${errorMessage}`);

      return this.createErrorResult(`Failed to fetch manifest: ${errorMessage}`);
    }
  }
}

/**
 * Amp Dataset Manifest Tool Handler
 */
export class AmpDatasetListHandler extends BaseToolHandler {
  name = 'amp_dataset_manifest';
  description = 'Fetch list of available public dataset in Amp';
  inputSchema = {
    type: 'object',
    properties: {},
    required: []
  };

  getPermissions(): string[] {
    return ['amp:dataset:list'];
  }

  validate(args: AmpDatasetManifestArgs): boolean | string {
    return true;
  }

  async execute(args: any, plugin: Plugin): Promise<IMCPToolResult> {
    try {
      // Show a notification that the manifest is being fetched
      const response = await plugin.call('amp', 'listDatasets')

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const list = await response.json()
      const result: AmpDatasetListResult = {
        success: true,
        result: list.result?.data?.json?.datasets.map((d) => {
          const short = {
            latest_version: d.latest_version
          }
          return { indexing_chains: d.indexing_chains, description: d.description, ...short }
        })
      };

      console.log(result)
      return this.createSuccessResult(result);

    } catch (error) {
      console.error('Amp dataset listt fetch error:', error);

      const errorMessage = error instanceof Error ? error.message : String(error);

      return this.createErrorResult(`Failed to fetch manifest: ${errorMessage}`);
    }
  }
}

/**
 * Amp Dataset Manifest Tool Handler
 */
export class AmpVisualizationHandler extends BaseToolHandler {
  name = 'amp_dataset_visualization';
  description = 'Convert data from a given file path to a Vega-Lite v5 JSON specification and generate its visualization using Vega-Lite';
  inputSchema = {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'a file path containing the data to convert.'
      },
      query: {
        type: 'string',
        description: 'query used to produced the data.'
      },
      description: {
        type: 'string',
        description: 'detals about how the view should look like.'
      }
    },
    required: []
  }

  getPermissions(): string[] {
    return ['amp:dataset:visualization'];
  }

  validate(args: AmpVisualizationArgs): boolean | string {
    return true;
  }

  async execute(args: AmpVisualizationArgs, plugin: Plugin): Promise<IMCPToolResult> {
    let toastid
    try {
      const content = await plugin.call('fileManager', 'readFile', args.path)
      const jsonContent = JSON.parse(content)
      
      
      toastid = await plugin.call('notification', 'toast', 'Converting the data, this will take some time, please be patient...', 60000 * 5)

      // getting the prompt ready
      const sample =  jsonContent.length > 5 ? jsonContent.slice(0, 6) : jsonContent
      // extract the schema
      const schema = await plugin.call('remixAI', 'basic_prompt', schemaExtraction(JSON.stringify(sample)))
      // generate the spec
      let specs = await plugin.call('remixAI', 'basic_prompt', visualizationPrompt(args.query, cleanJson(schema.result), args.description, JSON.stringify(sample)))
      specs = cleanJson(specs.result)
      
      // uploading the data for vega lite
      const contentData = new FormData();
      contentData.append("file", new Blob([content], { type: "text/plain" }));
      const ipfsRes = await postIpfs(contentData)
      try {
        await checkAvailability(ipfsRes.gatewayUrl)
      } catch (e) {
        throw new Error('Unable to process the data')
      }      
      
      // putting the data ref in the spec
      const parsed = JSON.parse(specs)
      parsed.data = {
        url: ipfsRes.gatewayUrl,
        format: { type: 'json' }
      }
      specs = JSON.stringify(parsed)
            
      // building the visualization
      const { png, vegaSpecs, domElement } = await buildVisualizationFromVegaSpec(specs, plugin)
      plugin.call('fileManager', 'writeFile', './amp/vega-specs/' + path.basename(args.path), JSON.stringify(JSON.parse(vegaSpecs), null, '\t'))
      
      // uploading the chart img
      const response = await fetch(png);
      const formData = new FormData()      
      const blob = await response.blob();
      formData.append("file", blob, 'chart.png');
      const data = await postIpfs(formData)
      try {
        await checkAvailability(data.gatewayUrl)
      } catch (e) {}
      
      document.body.removeChild(domElement)

      // getting the md file ready
      const mdFile = `./amp/visualizations/${parsed.title.replace(/ /g, '_')}.md`
      const mdContent = `## ${parsed.title}
![please, reload when the ipfs link is available](${data.gatewayUrl})`
      await plugin.call('fileManager', 'writeFile', mdFile, mdContent)
      await plugin.call('doc-viewer' as any, 'viewDocs', [mdFile])

      // opening a new tab
      window.open(data.gatewayUrl, '_blank')

      await plugin.call('notification', 'hideToaster', toastid)
      return this.createSuccessResult('visualization created successfully');

    } catch (error) {
      await plugin.call('notification', 'hideToaster', toastid)
      console.error('Amp dataset listt fetch error:', error);

      const errorMessage = error

      return this.createErrorResult(`visualization failed to be created successfully: ${errorMessage}`);
    }
  }
}

/**
 * Create Amp tool definitions
 */
export function createAmpTools(): RemixToolDefinition[] {
  return [
    {
      name: 'amp_query',
      description: 'Execute SQL queries against the Amp hosted server to retrieve blockchain data',
      inputSchema: new AmpQueryHandler().inputSchema,
      category: ToolCategory.ANALYSIS,
      permissions: ['amp:query'],
      handler: new AmpQueryHandler()
    },
    {
      name: 'amp_dataset_manifest',
      description: 'Fetch manifest information for a specific Amp dataset version',
      inputSchema: new AmpDatasetManifestHandler().inputSchema,
      category: ToolCategory.ANALYSIS,
      permissions: ['amp:dataset:manifest'],
      handler: new AmpDatasetManifestHandler()
    },
    {
      name: 'amp_dataset_list',
      description: 'Fetch list of available dataset',
      inputSchema: new AmpDatasetListHandler().inputSchema,
      category: ToolCategory.ANALYSIS,
      permissions: ['amp:dataset:list'],
      handler: new AmpDatasetListHandler()
    },
    {
      name: 'amp_dataset_visualization',
      description: 'Fetch list of available dataset',
      inputSchema: new AmpVisualizationHandler().inputSchema,
      category: ToolCategory.ANALYSIS,
      permissions: ['amp:dataset:visualization'],
      handler: new AmpVisualizationHandler()
    }
  ];
}
const INTERVAL_MS = 4000; // polling interval
const TIMEOUT_MS = 60000; // max wait time (1 min)

const controller = new AbortController();

async function postIpfs(content) {
  const REMIX_ENDPOINT_IPFS = 'https://quickdapp-ipfs.api.remix.live';
  const responseIpfs = await fetch(`${REMIX_ENDPOINT_IPFS}/upload`, {
    method: 'POST',
    body: content
  });

  return await responseIpfs.json()
}

async function checkAvailability(url: string): Promise<void> {
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seconds
        const res = await fetch(url, { method: "HEAD", signal: controller.signal });
        clearTimeout(timeoutId)

        if (res.ok) {
          console.log(`✅ CID is available on gateway: ${url}`);
          resolve();
          return;
        }

        console.log(`⏳ Not available yet (status ${res.status})`);
      } catch (err) {
        console.log("⏳ Gateway not responding yet");
      }

      if (Date.now() - startTime > TIMEOUT_MS) {
        console.error("❌ Timed out waiting for CID");
        reject(new Error('Timed out waiting for CID'));
        return;
      }

      setTimeout(poll, INTERVAL_MS);
    };

    poll();
  });
}

const buildVisualizationFromVegaSpec = async (vegaSpecs, plugin) => {
  let incr = 0
  const domElement = document.createElement('div');
  const id = `chart_${Date.now()}`
  domElement.setAttribute("id", id);
  document.body.appendChild(domElement);

  let png
  let built = false
  while (!built) {
    incr++
    try {
      console.log('compiling vega', vegaSpecs)
      // @ts-ignore
      const result = await vegaEmbed(`#${id}`, JSON.parse(cleanJson(vegaSpecs)), {
        renderer: "svg",   // important for clean export
        actions: false
      })
      png = await result.view.toImageURL("png")
      built = true
      if (!built && incr > 2) throw new Error('Unable to compute a correct vega specs')
    } catch (e) {
      // lint
      console.log('error', e, e.message)
      const data = await plugin.call('remixAI', 'basic_prompt', lintPrompt(cleanJson(vegaSpecs), e))
      vegaSpecs = cleanJson(data.result)
    }
  }
  
  return { png, vegaSpecs, domElement }
}

const cleanJson = (content) => {
  if (!content) return content
  return content.replace('```json', '').replace('```', '')
}

const lintPrompt = (spec, error) => {
  return `You are a Vega-Lite compiler-aware validator, You generate Vega-Lite v5 specifications
The following error has been thrown by vegaEmbed. fix it and make sure the spec has no more issues.
Error thrown by vegaEmbed: ${error}

Input:
- A Vega-Lite v5 spec
- A Vega error message

Task:
1. Enumerate all params and list every layer that references each param.
2. Identify any point selection with 'nearest: true' referenced by more than one layer.
3. Fix the spec by REMOVING 'nearest: true' from that selection.
4. Do not apply any other fixes.
5. Output ONLY the corrected Vega-Lite JSON.

Important:
- Assume the error message is correct.
- Do not explain.
- Do not optimize.
- Do not partially fix.

First, list each param name and all layers that reference it
(e.g., layer index + encoding channel).
Then identify any point selection with 'nearest: true'
that is referenced by more than one layer.
Only after that, modify the spec.

If a point selection with 'nearest: true' is referenced more than once,
you MUST eliminate all but one reference.
Do not attempt partial fixes.

When fixing duplicate signal errors:
- Do NOT keep 'nearest: true'.
- Always remove 'nearest: true' from the offending selection.
- Do not attempt layer scoping.

FINAL CHECK
- Ensure no selection name would generate duplicate internal signals.
- Ensure the output is valid Vega-Lite v5 JSON.

Current spec which fails linting:
${spec}

Output ONLY the corrected Vega-Lite spec, with no explanation.
`
}

const visualizationPrompt = (query, schema, goal, rows) => {
  return `You are a Vega-Lite compiler-aware validator, You generate Vega-Lite v5 specifications.

Your task is to generate Vega-Lite v5 specifications.

Rules you must enforce:

SELECTION SAFETY
- Point selections with 'nearest: true' generate tuple signals.
- In layered specs, such selections must be referenced by exactly one layer.
- Do NOT reuse a nearest point selection across multiple layers.

LAYERING RULES
- Selections should be defined once at the top level.
- Each selection may be consumed by at most one layer unless it is:
  - an interval selection, or
  - a legend-bound multi selection.

SAFE SHARING
- Interval selections (brushes) may be shared.
- Legend-bound multi selections may be shared.
- Hover or nearest point selections may NOT be shared.

AUTO-REPAIR STRATEGY
If a violation is found:
1. Prefer removing 'nearest: true'.
2. Otherwise, restrict the selection usage to a single layer.
3. Otherwise, replace the selection with an expression-driven param.

FINAL CHECK
- Ensure no selection name would generate duplicate internal signals.
- Ensure the output is valid Vega-Lite v5 JSON.

Output ONLY the corrected Vega-Lite spec.


Here is the original query that produced this data: 
${query}

Schema:
${schema}

Visualization goal:
${goal}

Sample rows:
${rows}

Other Constraints (if any):
[OPTIONAL CONSTRAINTS]

Return ONLY the Vega-Lite JSON spec, with no explanation.`
}

const schemaExtraction = (data) => { 
  return `You are a schema extraction engine.
You must follow the instructions exactly and output only valid JSON.

Analyze the JSON data below and extract a schema suitable for generating a Vega-Lite specification.

Rules:

 - Assume the data represents a table (rows = records, columns = fields).
 - Flatten nested objects using dot notation.
 - For arrays of objects, infer the schema from the first non-null object.
 - Map data types as follows:
    - Numbers → "quantitative"
    - ISO dates, timestamps, or date strings → "temporal"
    - Strings → "nominal"
    - Booleans → "nominal"
 - If a field has a small, ordered set of numeric or string values, use "ordinal".
 - Exclude fields that are always null or empty arrays.

Output JSON Schema Format (exact):
{
  "fields": [
    {
      "name": "string",
      "type": "quantitative | temporal | nominal | ordinal"
    }
  ]
}
  {
  "fields": [
    {
      "name": "sales",
      "type": "quantitative",
      "example": 1200,
      "nullable": false
    }
  ]
}

Sample Data:
${data}
`
}