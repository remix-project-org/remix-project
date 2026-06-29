import { Monaco } from "@monaco-editor/react"
import monaco from "../../types/monaco"
import { EditorUIProps } from "../remix-ui-editor"

export class RemixDefinitionProvider implements monaco.languages.DefinitionProvider {
  props: EditorUIProps
  monaco: Monaco
  constructor(props: any, monaco: any) {
    this.props = props
    this.monaco = monaco
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async provideDefinition(model: monaco.editor.ITextModel, position: monaco.Position, token: monaco.CancellationToken): Promise<monaco.languages.Definition | monaco.languages.LocationLink[]> {
    const cursorPosition = this.props.editorAPI.getCursorPosition()
    let jumpLocation = await this.jumpToDefinition(cursorPosition)
    if (!jumpLocation || !jumpLocation.fileName) {
      const line = model.getLineContent(position.lineNumber)
      const lastpart = line.substring(0, position.column - 1).split(';').pop()
      if (lastpart.startsWith('import')) {
        const importPath = line.substring(lastpart.indexOf('"') + 1)
        const importPath2 = importPath.substring(0, importPath.indexOf('"'))
        jumpLocation = {
          startLineNumber: 1,
          startColumn: 1,
          endColumn: 1,
          endLineNumber: 1,
          fileName: importPath2
        }
      }
    }
    if (jumpLocation && jumpLocation.fileName) {
      return [{
        uri: this.monaco.Uri.parse(jumpLocation.fileName),
        range: {
          startLineNumber: jumpLocation.startLineNumber,
          startColumn: jumpLocation.startColumn,
          endLineNumber: jumpLocation.endLineNumber,
          endColumn: jumpLocation.endColumn
        }
      }]
    }
    return []
  }

  async jumpToDefinition(position: any) {
    const node = await this.props.plugin.call('codeParser', 'definitionAtPosition', position)
    const sourcePosition = await this.props.plugin.call('codeParser', 'positionOfDefinition', node)
    if (sourcePosition) {
      return await this.jumpToPosition(sourcePosition)
    }
  }

  /*
    * onClick jump to position of ast node in the editor
    */
  async jumpToPosition(position: any) {
    const jumpToLine = async (fileName: string, lineColumn: any) => {

      const currentFile = await this.props.plugin.call('fileManager', 'file')
      const fileTarget = await this.props.plugin.call('resolutionIndex', 'resolvePath', currentFile, fileName)
      if (fileName !== await this.props.plugin.call('fileManager', 'file')) {
        const fileContent = await this.props.plugin.call('fileManager', 'readFile', fileTarget)
        try {
          await this.props.plugin.call('editor', 'addModel', fileTarget, fileContent)
        } catch (e) {

        }
      }
      if (lineColumn.start && lineColumn.start.line >= 0 && lineColumn.start.column >= 0) {
        const pos = {
          startLineNumber: lineColumn.start.line + 1,
          startColumn: lineColumn.start.column + 1,
          endColumn: lineColumn.end.column + 1,
          endLineNumber: lineColumn.end.line + 1,
          fileName: fileTarget || fileName
        }
        return pos
      }
    }
    const lastCompilationResult = await this.props.plugin.call('codeParser', 'getLastCompilationResult') // await this.props.plugin.call('compilerArtefacts', 'getLastCompilationResult')
    if (lastCompilationResult && lastCompilationResult.languageversion.indexOf('soljson') === 0 && lastCompilationResult.data) {

      const lineColumn = await this.props.plugin.call('codeParser', 'getLineColumnOfPosition', position)
      const filename = lastCompilationResult.getSourceName(position.file)
      return await jumpToLine(filename, lineColumn)
    }
  }
}