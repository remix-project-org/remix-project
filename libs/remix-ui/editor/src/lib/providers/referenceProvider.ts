import { Monaco } from "@monaco-editor/react"
import { sourceMappingDecoder } from "@remix-project/remix-debug"
import monaco from "../../types/monaco"
import { EditorUIProps } from "../remix-ui-editor"

export class RemixReferenceProvider implements monaco.languages.ReferenceProvider {
  props: EditorUIProps
  monaco: Monaco
  constructor(props: any, monaco: any) {
    this.props = props
    this.monaco = monaco
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async provideReferences(model: monaco.editor.ITextModel, position: monaco.Position, context: monaco.languages.ReferenceContext, token: monaco.CancellationToken) {

    const cursorPosition = this.props.editorAPI.getCursorPosition()
    const nodes = await this.props.plugin.call('codeParser', 'referrencesAtPosition', cursorPosition)
    const references = []
    if (nodes && nodes.length) {
      const compilationResult = await this.props.plugin.call('codeParser', 'getLastCompilationResult')
      const file = await this.props.plugin.call('fileManager', 'file')
      if (compilationResult && compilationResult.data && compilationResult.data.sources[file]) {
        for (const node of nodes) {
          const position = sourceMappingDecoder.decode(node.src)
          const fileInNode = compilationResult.getSourceName(position.file)
          // Resolve via resolution index only
          let fileTarget: string
          try {
            const resolved = await this.props.plugin.call('resolutionIndex', 'resolvePath', file, fileInNode)
            fileTarget = resolved || fileInNode
          } catch (e) {
            fileTarget = fileInNode
          }
          const fileContent = await this.props.plugin.call('fileManager', 'readFile', fileInNode)
          const lineColumn = await this.props.plugin.call('codeParser', 'getLineColumnOfPosition', position)

          try {
            this.props.plugin.call('editor', 'addModel', fileTarget, fileContent)
          } catch (e) {

          }
          const range = new this.monaco.Range(lineColumn.start.line + 1, lineColumn.start.column + 1, lineColumn.end.line + 1, lineColumn.end.column + 1)
          references.push({
            range,
            uri: this.monaco.Uri.parse(fileTarget)
          })
        }
      }
    }
    return references
  }
}