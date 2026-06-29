// interactive code explaining and highlighting security vulnerabilities
import * as fs from 'fs';

export class CodeExplainAgent {
  private codebase: string[]; // list of code base file
  public currentFile: string;
  plugin

  constructor(props) {
    this.plugin = props
    // git or fs
    const codebase = this.loadCodebase("codebasePath");
  }

  private loadCodebase(path: string): string[] {
    return []
  }

  public update(currentFile, lineNumber){

  }

  async chatCommand(prompt:string){
    // change this function with indexer or related
    try {
      if (prompt.includes('Explain briefly the current file')){
        const file = await this.plugin.call('fileManager', 'getCurrentFile')
        const content = `Explain this code:\n ${await this.plugin.call('fileManager', 'readFile', file)}`
        return content
      } else return prompt
    } catch {
      return 'There is No file selected'
    }
  }

  public getExplanations(currentLine: string, numSuggestions: number = 3): string[] {
    // process the code base explaining the current file and highlighting some details
    const suggestions: string[] = [];
    return suggestions;
  }
}

// Handle file changed (significantly)
