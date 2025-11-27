import { AssistantParams } from "../types/models";
import { workspaceAgent } from "./workspaceAgent";
import { CompilationResult } from "../types/types";
import { compilecontracts, compilationParams } from "../helpers/compile";
import { OllamaInferencer } from "../inferencers/local/ollamaInferencer"
const COMPILATION_WARNING_MESSAGE = '⚠️**Warning**: The compilation failed. Please check the compilation errors in the Solidity compiler plugin. Enter `/continue` or `/c` if you want RemixAI to try again until a compilable solution is generated?'

export class ContractAgent {
  plugin: any;
  readonly generationAttempts: number = 5
  nAttempts: number = 0
  generationThreadID: string= ''
  workspaceName: string = ''
  contracts: any = {}
  mainPrompt: string = ''
  static instance
  oldPayload: any = undefined

  private constructor(props) {
    this.plugin = props;
    AssistantParams.provider = this.plugin.assistantProvider
  }

  public static getInstance(props) {
    if (ContractAgent.instance) return ContractAgent.instance
    ContractAgent.instance = new ContractAgent(props)
    return ContractAgent.instance
  }

  /*
  * Write the result of the generation to the workspace. Compiles the contracts one time and creates a new workspace.
  * @param payload - The payload containing the generated files
  * @param userPrompt - The user prompt used to generate the files
  * @param statusCallback - Optional callback for status updates in chat window
  */
  async writeContracts(payload, userPrompt, statusCallback?: (status: string) => Promise<void>) {
    await statusCallback?.('Getting current workspace info...')
    const currentWorkspace = await this.plugin.call('filePanel', 'getCurrentWorkspace')
    const writeAIResults = async (parsedResults) => {
      if (this.plugin.isOnDesktop) {
        await statusCallback?.('Preparing files for desktop...')
        const files = parsedResults.files.reduce((acc, file) => {
          acc[file.fileName] = file.content
          return acc
        }, {})
        await statusCallback?.('Opening in new window...')
        await this.plugin.call('electronTemplates', 'loadTemplateInNewWindow', files)
        //return "Feature not only available in the browser version of Remix IDE. Please use the browser version to generate secure code."
        return "## New workspace created!  \nNavigate to the new window!"
      }

      await statusCallback?.('Creating new workspace...')
      await this.createWorkspace(this.workspaceName)

      await statusCallback?.('Writing files to workspace...')
      const dirCreated = []
      for (const file of parsedResults.files) {
        const dir = file.fileName.split('/').slice(0, -1).join('/')
        if (!dirCreated.includes(dir) && dir) {
          await this.plugin.call('fileManager', 'mkdir', dir)
          dirCreated.push(dir)
        }
        // check if file already exists
        await this.plugin.call('fileManager', 'writeFile', file.fileName, file.content)
      }
      return "New workspace created: **" + this.workspaceName + "**\nUse the Hamburger menu to select it!"
    }

    try {
      if (payload === undefined) {
        await statusCallback?.('No payload received, retrying...')
        this.nAttempts += 1
        if (this.nAttempts > this.generationAttempts) {
          if (this.oldPayload) {
            return await writeAIResults(this.oldPayload)
          }
          return "Max attempts reached! Please try again with a different prompt."
        }
        return "No payload, try again while considering changing the assistant provider with the command `/setAssistant <openai|anthropic|mistralai|ollama>`"
      }

      if ( this.plugin.remoteInferencer instanceof OllamaInferencer){
        // Extract JSON from markdown code blocks
        if (typeof payload === 'string' && (payload.includes('```json') || payload.includes('```'))) {
          // Match ```json content ``` or ``` content ```
          const jsonMatch = payload.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
          if (jsonMatch && jsonMatch[1]) {
            payload = jsonMatch[1].trim();
          }
        }
        if (typeof payload === 'string') {
          payload = JSON.parse(payload)
        }
      }

      await statusCallback?.('Processing generated files...')
      this.contracts = {}
      const parsedFiles = payload
      this.oldPayload = payload
      this.generationThreadID = this.plugin.remoteInferencer instanceof OllamaInferencer ? "" : parsedFiles['threadID']
      this.workspaceName = parsedFiles['projectName']

      this.nAttempts += 1
      if (this.nAttempts === 1) this.mainPrompt=userPrompt

      if (this.nAttempts > this.generationAttempts) {
        return await writeAIResults(parsedFiles)
      }

      await statusCallback?.('Processing Solidity contracts...')
      const genContrats = []
      for (const file of parsedFiles.files) {
        if (file.fileName.endsWith('.sol')) {
          this.contracts[file.fileName] = { content: file.content }
          genContrats.push({ fileName: file.fileName, content: file.content })
        }
      }

      await statusCallback?.('Compiling contracts...')
      const result:CompilationResult = await compilecontracts(this.contracts, this.plugin)
      if (!result.compilationSucceeded) {
        await statusCallback?.('Compilation failed, fixing errors...')
        const generatedContracts = (genContrats || []).map(contract =>
          `File: ${contract.fileName}\n${contract.content}`
        ).join('\n\n');

        // Format error files properly according to the schema
        const formattedErrorFiles = Object.entries(result.errfiles).map(([fileName, fileData]: [string, any]) => {
          const errors = (fileData.errors || []).map((err: any) =>
            `Error at ${err.errorStart}-${err.errorEnd}: ${err.errorMessage}`
          ).join('\n  ');
          return `File: ${fileName}\n  ${errors}`;
        }).join('\n\n');

        const newPrompt = `
              Compilation parameters:\n${JSON.stringify(compilationParams)}\n\n
              Compilation errors:\n${formattedErrorFiles}\n\n
              Generated contracts:\n${generatedContracts}\n\nConsider other possible solutions and retry this main prompt again: \n${this.mainPrompt}\n `

        await statusCallback?.('Regenerating workspace with error fixes...')
        return await this.plugin.generate(newPrompt, AssistantParams, this.generationThreadID, false, statusCallback); // reuse the same thread
      }

      await statusCallback?.('Finalizing workspace creation...')
      return result.compilationSucceeded ? await writeAIResults(parsedFiles) : await writeAIResults(parsedFiles) + "\n\n" + COMPILATION_WARNING_MESSAGE
    } catch (error) {
      await statusCallback?.('Error occurred, cleaning up...')
      this.deleteWorkspace(this.workspaceName )
      this.nAttempts = 0
      await this.plugin.call('filePanel', 'switchToWorkspace', currentWorkspace)
      const rtvalue = this.plugin.remoteInferencer instanceof OllamaInferencer
        ? "The selected Ollama model might not be supported. Please select another provider for this generation task or try again!"
        : "Failed to generate secure code on user prompt! Please try again with a different prompt."
      return rtvalue
    } finally {
      this.nAttempts = 0
    }
  }

  async createWorkspace(workspaceName) {
    // create random workspace surfixed with timestamp
    try {
      const timestamp = new Date().getTime()
      const wsp_name = workspaceName + '-' + timestamp
      await this.plugin.call('filePanel', 'createWorkspace', wsp_name, true)
      this.workspaceName = wsp_name
    } catch (error) {
      console.error('Error creating workspace:', error)
    }
  }

  async deleteWorkspace(workspaceName) {
    await this.plugin.call('filePanel', 'deleteWorkspace', workspaceName)
  }

  async fixWorkspaceCompilationErrors(wspAgent:workspaceAgent) {
    try {
      const wspfiles = JSON.parse(await wspAgent.getCurrentWorkspaceFiles())
      const compResult:CompilationResult = await compilecontracts(wspfiles, this.plugin)

      if (compResult.compilationSucceeded) {
        return 'Compilation succeeded, no errors to fix'
      }

      const newPrompt = `Payload:\n${JSON.stringify(compResult.errfiles)}}\n\n Fix the compilation errors above\n`
      return await this.plugin.generateWorkspace(newPrompt, AssistantParams, this.generationThreadID); // reuse the same thread, pass the paylod to the diff checker

    } catch (error) {
    } finally {
    }
  }

}
