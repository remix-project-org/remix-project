import { Plugin } from '@remixproject/engine'

const profile = {
  name: 'vega',
  displayName: 'vega',
  description: 'vega',
  methods: ['generateVisualization', 'generateSpecsFromAmpData','generateVisualizationAndEnsureLinting'],
  events: [],
  version: '1.0.0'
}

export class VegaPlugin extends Plugin {
  constructor() {
    super(profile)
  }

  onActivation(): void {
    /*
      <script src="assets/js/vega/vega.js"></script>
      <script src="assets/js/vega/vega-lite.js"></script>
      <script src="assets/js/vega/vega-embed.js"></script>
    */
    const vega = document.createElement('script')
    vega.setAttribute('src','assets/js/vega/vega.js')
    document.head.appendChild(vega)

    const vegaLite = document.createElement('script')
    vegaLite.setAttribute('src','assets/js/vega/vega-lite.js')
    document.head.appendChild(vegaLite)

    const vegaEmbed = document.createElement('script')
    vegaEmbed.setAttribute('src','assets/js/vega/vega-lite.js')
    document.head.appendChild(vegaEmbed)
  }

  async generateVisualization (filePath: string) {
    const vegaSpecs = await this.call('fileManager', 'readFile', filePath)
    const parsed = JSON.parse(vegaSpecs)
    const domElement = document.createElement('div');
    const id = `chart_${Date.now()}`
    domElement.setAttribute("id", id);
    document.body.appendChild(domElement);
    // @ts-ignore
    const result = await vegaEmbed(`#${id}`, parsed, {
      renderer: "svg", // important for clean export
      actions: false
    })
    const png = await result.view.toImageURL("png")

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
    this.saveMdFile(parsed.title, data.gatewayUrl)
  }

  async generateSpecsFromAmpData (dataPath: string, query: string, description: string) {
    const content = await this.call('fileManager', 'readFile', dataPath)
    const jsonContent = JSON.parse(content)

    const toastid = await this.call('notification', 'toast', 'Creating the specification, this will take some time, please be patient...', 60000 * 5)

    // getting the prompt ready
    const sample = jsonContent.length > 5 ? jsonContent.slice(0, 6) : jsonContent

    // extract the schema
    const schema = await this.call('remixAI', 'basic_prompt', schemaExtraction(JSON.stringify(sample)))

    // generate the spec
    let specs = await this.call('remixAI', 'basic_prompt', visualizationPrompt(query, cleanJson(schema.result), description, JSON.stringify(sample)))
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

    this.call('notification', 'hideToaster', toastid)

    return parsed
  }

  async generateVisualizationAndEnsureLinting (vegaSpecs, name) {
    let incr = 0
    const domElement = document.createElement('div');
    const id = `chart_${Date.now()}`
    domElement.setAttribute("id", id);
    document.body.appendChild(domElement);

    const vegaSpecPath = './amp/vega-specs/' + name
    let png
    let timeout = false
    try {
      let built = false
      while (!built && !timeout) {
        incr++
        try {
          if (!built && incr > 2) timeout = true
          // @ts-ignore
          const result = await vegaEmbed(`#${id}`, JSON.parse(cleanJson(vegaSpecs)), {
            renderer: "svg", // important for clean export
            actions: false
          })
          png = await result.view.toImageURL("png")
          built = true
        } catch (e) {
          // lint
          console.log('error', e, e.message)
          const data = await this.call('remixAI', 'basic_prompt', lintPrompt(cleanJson(vegaSpecs), e))
          vegaSpecs = cleanJson(data.result)
        }
      }
    } catch (e) {
      this.call('terminal', 'log', { type: 'error', value: `${e.message}. The file has been saved at ${vegaSpecPath}` })
    }

    if (timeout) {
      this.call('terminal', 'log', { type: 'error', value: `Unable to compute a correct vega specs. The file has been saved to ${vegaSpecPath}` })
    }
    this.call('fileManager', 'writeFile', vegaSpecPath, JSON.stringify(JSON.parse(vegaSpecs), null, '\t'))

    // uploading the chart img
    const response = await fetch(png);
    const formData = new FormData()
    const blob = await response.blob();
    formData.append("file", blob, 'chart.png')
    const data = await postIpfs(formData)
    try {
      await checkAvailability(data.gatewayUrl)
    } catch (e) {}

    document.body.removeChild(domElement)

    // getting the md file ready
    const title = JSON.parse(vegaSpecs).title
    this.saveMdFile(title, data.gatewayUrl)
    return
  }

  async saveMdFile (title, graphUrl) {
    try {
      const mdFile = `./amp/visualizations/${title.replace(/ /g, '_') || 'graph' + Date.now()}.md`
      const mdContent = `## ${title || 'Graph'}
  ![please, reload when the ipfs link is available](${graphUrl})`
      await this.call('fileManager', 'writeFile', mdFile, mdContent)
      await this.call('doc-viewer' as any, 'viewDocs', [mdFile])
    } catch (e) {
      this.call('terminal', 'log', { type: 'error', value: `Unableto save MD file, please verify the JSON structure. ${e.message} ` })
    }
  }
}

const INTERVAL_MS = 4000; // polling interval
const TIMEOUT_MS = 60000; // max wait time (1 min)
const controller = new AbortController();

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

async function postIpfs(content) {
  const REMIX_ENDPOINT_IPFS = 'https://quickdapp-ipfs.api.remix.live';
  const responseIpfs = await fetch(`${REMIX_ENDPOINT_IPFS}/upload`, {
    method: 'POST',
    body: content
  });

  return await responseIpfs.json()
}

const cleanJson = (content) => {
  if (!content) return content
  return content.replace('```json', '').replace('```', '')
}

const lintPrompt = (spec, error) => {
  return `You are a Vega-Lite compiler-aware validator, You generate Vega-Lite v6 specifications
The following error has been thrown by vegaEmbed. fix it and make sure the spec has no more issues.
Error thrown by vegaEmbed: ${error}

Input:
- A Vega-Lite v6 spec
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
- Ensure the output is valid Vega-Lite v6 JSON.

Current spec which fails linting:
${spec}

Output ONLY the corrected Vega-Lite spec, with no explanation.
`
}

const visualizationPrompt = (query, schema, goal, rows) => {
  return `You are a Vega-Lite compiler-aware validator, You generate Vega-Lite v6 specifications.

Your task is to generate Vega-Lite v6 specifications.

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
- Ensure the output is valid Vega-Lite v6 JSON.

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