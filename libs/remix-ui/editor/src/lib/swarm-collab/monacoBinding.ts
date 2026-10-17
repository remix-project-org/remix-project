import type { editor, IDisposable } from 'monaco-editor'
import * as Y from 'yjs'
import { diffText, normalizeEol, RecentTexts } from './text'

// Model versions remembered to recognise Remix's save echo, see `acceptExternalValue`.
const ECHO_HISTORY = 64
const EOL_LF = 0 as editor.EndOfLineSequence

/** Two-way binding between a `Y.Text` and a Monaco model, like y-monaco but without importing Monaco at runtime. */
export class YTextModelBinding {
  private applyingRemote = false
  private readonly recent = new RecentTexts(ECHO_HISTORY)
  private readonly subscription: IDisposable

  /** `isShared` tells whether `path` is still in the room's file index. */
  constructor(readonly path: string, private readonly ytext: Y.Text, readonly model: editor.ITextModel, private readonly origin: object, private readonly isShared: () => boolean) {
    model.setEOL(EOL_LF)
    this.recent.add(model.getValue())
    this.subscription = model.onDidChangeContent((e) => this.onModelChange(e))
    ytext.observe(this.onYTextChange)
    this.replaceModelText(ytext.toString(), true)
  }

  /** Takes a `setValue` from outside the editor: recent model states are echoes and ignored, new content is applied as a minimal edit. */
  acceptExternalValue(value: string): void {
    const text = normalizeEol(value)
    if (text === this.model.getValue() || this.recent.has(text)) return

    this.replaceModelText(text, false)
  }

  dispose(): void {
    this.ytext.unobserve(this.onYTextChange)
    this.subscription.dispose()
  }

  private onModelChange(e: editor.IModelContentChangedEvent): void {
    this.recent.add(this.model.getValue())
    if (this.applyingRemote) return

    // Offsets refer to the model before the change, so apply from the end backwards.
    const changes = [...e.changes].sort((a, b) => b.rangeOffset - a.rangeOffset)
    this.ytext.doc?.transact(() => {
      for (const change of changes) {
        if (change.rangeLength) this.ytext.delete(change.rangeOffset, change.rangeLength)
        if (change.text) this.ytext.insert(change.rangeOffset, change.text)
      }
    }, this.origin)
  }

  private onYTextChange = (event: Y.YTextEvent, transaction: Y.Transaction): void => {
    if (transaction.origin === this.origin || !this.isShared()) return

    this.applyingRemote = true
    try {
      let index = 0
      for (const op of event.delta) {
        if (op.retain !== undefined) {
          index += op.retain
        } else if (typeof op.insert === 'string') {
          this.edit(index, index, op.insert)
          index += op.insert.length
        } else if (op.delete !== undefined) {
          this.edit(index, index + op.delete, '')
        }
      }
    } finally {
      this.applyingRemote = false
    }
  }

  private replaceModelText(text: string, fromShared: boolean): void {
    const change = diffText(this.model.getValue(), text)
    if (!change) return

    this.applyingRemote = fromShared
    try {
      this.edit(change.index, change.index + change.remove, change.insert)
    } finally {
      this.applyingRemote = false
    }
  }

  private edit(start: number, end: number, text: string): void {
    const from = this.model.getPositionAt(start)
    const to = this.model.getPositionAt(end)
    this.model.applyEdits([{ range: { startLineNumber: from.lineNumber, startColumn: from.column, endLineNumber: to.lineNumber, endColumn: to.column }, text }])
  }
}

const bindings = new Map<string, YTextModelBinding>()

/** Lets the `SET_VALUE` reducer hand writes for bound models to their binding. */
export const collabModelGuard = {
  register(binding: YTextModelBinding): void {
    bindings.set(binding.path, binding)
  },
  unregister(binding: YTextModelBinding): void {
    if (bindings.get(binding.path) === binding) bindings.delete(binding.path)
  },
  /** Returns `true` when the write was taken over and the caller must not touch the model. */
  interceptSetValue(path: string, value: string): boolean {
    const binding = bindings.get(path)
    if (!binding) return false

    binding.acceptExternalValue(value)
    return true
  }
}

export interface RemoteCursor {
  username: string
  color: number
  anchor: number
  head: number
}

export const CURSOR_COLORS = 6

/** Renders other participants' carets and selections in one editor. */
export class RemoteCursorDecorations {
  private readonly collection: editor.IEditorDecorationsCollection

  constructor(private readonly codeEditor: editor.ICodeEditor) {
    this.collection = codeEditor.createDecorationsCollection()
  }

  render(cursors: RemoteCursor[]): void {
    const model = this.codeEditor.getModel()
    if (!model) return this.collection.clear()

    const decorations: editor.IModelDeltaDecoration[] = []
    for (const cursor of cursors) {
      const start = model.getPositionAt(Math.min(cursor.anchor, cursor.head))
      const end = model.getPositionAt(Math.max(cursor.anchor, cursor.head))
      const head = model.getPositionAt(cursor.head)
      const color = cursor.color % CURSOR_COLORS

      if (cursor.anchor !== cursor.head) {
        decorations.push({
          range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column },
          options: { className: `swarm-collab-selection swarm-collab-color-${color}` }
        })
      }
      decorations.push({
        range: { startLineNumber: head.lineNumber, startColumn: head.column, endLineNumber: head.lineNumber, endColumn: head.column },
        options: { beforeContentClassName: `swarm-collab-caret swarm-collab-color-${color}`, hoverMessage: { value: cursor.username }, stickiness: 1 }
      })
    }
    this.collection.set(decorations)
  }

  dispose(): void {
    this.collection.clear()
  }
}
