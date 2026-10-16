import { Monaco } from "@monaco-editor/react"
import { sourceMappingDecoder } from "@remix-project/remix-debug"
import monaco from "../../types/monaco"
import { EditorUIProps } from "../remix-ui-editor"

export class RemixHighLightProvider implements monaco.languages.DocumentHighlightProvider {
  props: EditorUIProps
  monaco: Monaco
  constructor(props: any, monaco: any) {
    this.props = props
    this.monaco = monaco
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async provideDocumentHighlights(model: monaco.editor.ITextModel, position: monaco.Position, token: monaco.CancellationToken): Promise<monaco.languages.DocumentHighlight[]> {
    // Only the code editor's own files: other editors (the RemixAI changes panel) use in-memory models
    if (model.uri.scheme === 'inmemory') return []
    const cursorPosition = this.props.editorAPI.getCursorPosition()
    const nodes = await this.props.plugin.call('codeParser', 'referrencesAtPosition', cursorPosition)
    const highlights: monaco.languages.DocumentHighlight[] = []
    if (nodes && nodes.length) {
      const compilationResult = await this.props.plugin.call('codeParser', 'getLastCompilationResult')
      // No file open (a diff can be showing): nothing to highlight
      const file = await this.props.plugin.call('fileManager', 'file').catch(() => null)
      if (file && compilationResult && compilationResult.data && compilationResult.data.sources[file]) {
        for (const node of nodes) {
          const position = sourceMappingDecoder.decode(node.src)
          const fileInNode = compilationResult.getSourceName(position.file)
          if (fileInNode === file) {
            const lineColumn = await this.props.plugin.call('codeParser', 'getLineColumnOfPosition', position)
            const range = new this.monaco.Range(lineColumn.start.line + 1, lineColumn.start.column + 1, lineColumn.end.line + 1, lineColumn.end.column + 1)
            highlights.push({
              range,
            })
          }
        }
      }
    }
    return highlights
  }
}