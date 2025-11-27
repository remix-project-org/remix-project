import { IContextType, SupportedFileExtensions, ISimilaritySearchConfig } from "../types/types";
import { extractFirstLvlImports } from "../helpers/localImportsExtractor";
export class workspaceAgent {
  plugin: any
  currentWorkspace: string = ''
  static instance
  ctxFiles:any
  localUsrFiles: { [key: string]: string } = {}
  similarityConfig: ISimilaritySearchConfig = {
    maxFiles: 5,
    similarityThreshold: 0,
    enabled: true
  }

  private constructor(props) {
    this.plugin = props;
    this.localUsrFiles = {};
    // event listeners
    this.plugin.on('solidity', 'compilationFailed', async (file: string, source, languageVersion, data, input, version) => {
      this.localUsrFiles = await this.getLocalUserImports({
        file,
        source,
        languageVersion,
        data,
        input,
        version
      });
    })
    this.plugin.on('solidity', 'compilationFinished', async (file: string, source, languageVersion, data, input, version) => {
      this.localUsrFiles = await this.getLocalUserImports({
        file,
        source,
        languageVersion,
        data,
        input,
        version
      });
    })
  }

  private async getLocalUserImports(compilerPayload){
    const currentFile = await this.plugin.call('fileManager', 'getCurrentFile')
    const files = []
    files.push({
      fileName: currentFile,
      content: await this.plugin.call('fileManager', 'readFile', currentFile)
    })
    const imports = extractFirstLvlImports(files, compilerPayload);
    const localUsrImport = imports.filter(imp => imp.isLocal);

    const result: { [key: string]: string } = {}
    for (const imp of localUsrImport) {
      if (!result[imp.importPath]) {
        result[imp.importPath] = imp.content;
      }
    }
    return result;
  }

  public static getInstance(props) {
    if (workspaceAgent.instance) return workspaceAgent.instance
    workspaceAgent.instance = new workspaceAgent(props)
    return workspaceAgent.instance
  }

  async getCurrentWorkspaceFiles() {
    try {
      let files = '{\n'
      const jsonDirsContracts = await this.plugin.call('fileManager', 'copyFolderToJson', '/');
      for (const dirs in jsonDirsContracts) {
        if (dirs.startsWith('.') || dirs.startsWith('node_modules') || dirs.startsWith('/.')) continue;
        for (const file in jsonDirsContracts[dirs].children) {
          if (file.startsWith('.')) continue;
          if (!Object.values(SupportedFileExtensions).some(ext => file.endsWith(ext))) continue;

          files += `"${file}": ${JSON.stringify(jsonDirsContracts[dirs].children[file].content)}},`
        }
      }
      return files + '\n}'
    } catch (error) { console.error('Error getting current workspace files:', error); }
  }

  async writeGenerationResults(payload, statusCallback?: (status: string) => Promise<void>) {
    try {
      await statusCallback?.('Processing workspace modifications...')
      if (typeof payload === 'string' && (payload.includes('```json') || payload.includes('```'))) {
        const jsonMatch = payload.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          payload = jsonMatch[1].trim();
        }
      }
      if (typeof payload === 'string') {
        payload = JSON.parse(payload)
      }
      let modifiedFilesMarkdown = '#### **List of Modified Files**\n'
      let createdFilesMarkdown = '#### **List of Created Files**\n'
      let hasCreatedFiles = false

      for (const file of payload.files) {
        if (!Object.values(SupportedFileExtensions).some(ext => file.fileName.endsWith(ext))) continue;

        try {
          const fileExists = await this.plugin.call('fileManager', 'exists', file.fileName)

          if (fileExists) {
            await this.plugin.call('editor', 'showCustomDiff', file.fileName, file.content)
            modifiedFilesMarkdown += `- ${file.fileName}\n`
          } else {
            await statusCallback?.(`Creating file ${file.fileName}...`)

            const dirPath = file.fileName.substring(0, file.fileName.lastIndexOf('/'))
            if (dirPath && dirPath.length > 0) {
              try {
                await this.plugin.call('fileManager', 'mkdir', dirPath)
              } catch (mkdirError) {
                // Directory already exist, just continue
              }
            }

            await this.plugin.call('fileManager', 'writeFile', file.fileName, "")
            await new Promise(resolve => setTimeout(resolve, 2000)) // wait so the content is written before diffing
            await this.plugin.call('editor', 'showCustomDiff', file.fileName, file.content)
            createdFilesMarkdown += `- ${file.fileName}\n`
            hasCreatedFiles = true
          }
        } catch (fileError) {
          console.warn(`Error processing file ${file.fileName}:`, fileError)
        }
      }

      await statusCallback?.('Workspace modifications complete!')

      // Build result markdown
      let result = modifiedFilesMarkdown
      if (hasCreatedFiles) {
        result += '\n' + createdFilesMarkdown
      }

      return result || 'No files modified'
    } catch (error) {
      console.warn('Error writing generation results:', error);
      return 'No files modified'
    }
  }

  private calculateSimilarity(prompt: string, fileName: string, content: string): number {
    const promptLower = prompt.toLowerCase();
    const fileNameLower = fileName.toLowerCase();
    const contentLower = content.toLowerCase();
    let score = 0;

    const promptWords = promptLower.split(/\s+/).filter(word => word.length > 2);
    for (const word of promptWords) {
      if (fileNameLower.includes(word)) {
        score += 3;
      }
    }

    for (const word of promptWords) {
      const matches = (contentLower.match(new RegExp(word, 'g')) || []).length;
      score += matches * 1; // Weight for content matches
    }
    return score;
  }

  public getRelevantLocalFiles(prompt: string, maxFiles?: number): { [key: string]: string } {
    const effectiveMaxFiles = maxFiles || this.similarityConfig.maxFiles || 5;
    const fileCount = Object.keys(this.localUsrFiles).length;

    if (!this.similarityConfig.enabled || fileCount <= effectiveMaxFiles) {
      return this.localUsrFiles;
    }

    const scoredFiles: Array<{ fileName: string; content: string; score: number }> = [];

    for (const [fileName, content] of Object.entries(this.localUsrFiles)) {
      const score = this.calculateSimilarity(prompt, fileName, content);
      if (score >= (this.similarityConfig.similarityThreshold || 0)) {
        scoredFiles.push({ fileName, content, score });
      }
    }

    scoredFiles.sort((a, b) => b.score - a.score);
    const topFiles = scoredFiles.slice(0, effectiveMaxFiles);
    const result: { [key: string]: string } = {};
    for (const file of topFiles) {
      result[file.fileName] = file.content;
    }
    return result;
  }

  // Update similarity search configuration
  public updateSimilarityConfig(config: Partial<ISimilaritySearchConfig>): void {
    this.similarityConfig = { ...this.similarityConfig, ...config };
  }

  async setCtxFiles (context: IContextType) {
    this.ctxFiles = ""
    switch (context.context) {
    case 'currentFile': {
      const file = await this.plugin.call('fileManager', 'getCurrentFile')
      const content = await this.plugin.call('fileManager', 'readFile', file)
      this.ctxFiles = `"${file}": ${JSON.stringify(content)}`
      break
    }
    case 'workspace':
      this.ctxFiles = await this.getCurrentWorkspaceFiles()
      break
    case 'openedFiles': {
      this.ctxFiles = "{\n"
      const openedFiles = await this.plugin.call('fileManager', 'getOpenedFiles')
      Object.keys(openedFiles).forEach(key => {
        if (!Object.values(SupportedFileExtensions).some(ext => key.endsWith(ext))) return;
        this.ctxFiles += `"${key}": ${JSON.stringify(openedFiles[key])},\n`
      });
      this.ctxFiles += "\n}"
      break
    }
    default:
      this.ctxFiles = ""
      break
    }

    if (context.files){
      for (const file of context.files) {
        if (!Object.values(SupportedFileExtensions).some(ext => file.fileName.endsWith(ext))) continue;
        this.ctxFiles += `"${file.fileName}": ${JSON.stringify(file.content)},\n`
      }

    }
  }
}
