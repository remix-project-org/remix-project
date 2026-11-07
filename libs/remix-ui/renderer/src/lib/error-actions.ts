// Shared by the Renderer and the compiler's issue list: open the file of an error at its line, and hand an error to RemixAI.

export const gotoError = async (plugin: any, errFile: string, errLine: number, errCol: number) => {
  console.debug('[renderer] _errorClick:start', { errFile, errLine, errCol })
  try {
    // Resolve the target path via the in-memory resolution index first to avoid chained plugin calls
    const currentFile = await plugin.call('fileManager', 'file')
    console.debug('[renderer] _errorClick currentFile', currentFile)

    let resolved: string | null = null
    try {
      const viaResolvePath = await plugin.call('resolutionIndex', 'resolvePath', currentFile, errFile)
      console.debug('[renderer] _errorClick resolvePath ->', viaResolvePath)
      if (viaResolvePath) resolved = viaResolvePath
    } catch (e) {
      console.debug('[renderer] _errorClick resolvePath threw', e)
    }
    if (!resolved) {
      try {
        const viaImport = await plugin.call('resolutionIndex', 'resolveImportFromIndex', currentFile, errFile)
        console.debug('[renderer] _errorClick resolveImportFromIndex ->', viaImport)
        if (viaImport) resolved = viaImport
      } catch (e) {
        console.debug('[renderer] _errorClick resolveImportFromIndex threw', e)
      }
    }

    console.debug('[renderer] _errorClick final resolution ->', resolved)
    if (resolved) errFile = resolved
  } catch (_) {
    // best-effort: leave errFile as-is; fileManager.open will attempt legacy mapping
    console.debug('[renderer] _errorClick resolution attempt failed; using raw errFile')
  }

  const current = await plugin.call('config', 'getAppParameter', 'currentFile')
  console.debug('[renderer] _errorClick current config file', current)
  if (errFile !== current) {
    // TODO: refactor with this._components.contextView.jumpTo
    try {
      // if it doesn't exist, we do nothing here – index is the source of truth
      // open only when the resolved target exists (should if indexed)
      const exists = await plugin.call('fileManager', 'exists', errFile)
      console.debug('[renderer] _errorClick exists=', exists)
      if (exists) {
        console.debug('[renderer] _errorClick opening', errFile)
        await plugin.call('fileManager', 'open', errFile)
        console.debug('[renderer] _errorClick gotoLine', { errLine, errCol })
        await plugin.call('editor', 'gotoLine', errLine, errCol)
      }
    } catch (e) {
      console.error('[renderer] _errorClick error while opening/gotoLine', e)
    }
  } else {
    console.debug('[renderer] _errorClick already on file; gotoLine only', { errLine, errCol })
    await plugin.call('editor', 'gotoLine', errLine, errCol)
  }
}

// buildMessage gets the content and path of the file holding the error and returns the prompt
export const fixWithRemixAI = async (
  plugin: any,
  errFile: string,
  messageText: string,
  buildMessage: (content: string, filePath: string) => string,
  trackMatomoEvent?: (event: any) => void
) => {
  try {
    let content
    // The path tells the agent which file to edit
    let filePath = errFile
    try {
      content = await plugin.call('fileManager', 'readFile', errFile)
    } catch (error) {
      filePath = await plugin.call('config', 'getAppParameter', 'currentFile')
      content = await plugin.call('fileManager', 'readFile', filePath)
    }
    const message = buildMessage(content, filePath)

    await plugin.call('menuicons', 'select', 'remixaiassistant')
    setTimeout(async () => {
      // The bubble reads "Fix the error"; the error itself sits behind its details toggle
      await plugin.call('remixAI', 'chatPipe', 'error_explaining', message, undefined, `Fix the error\n\n${messageText}`, { source: 'compiler-error', presetId: 'error-explain', displayText: 'Fix the error' })
    }, 500)
    trackMatomoEvent?.({ category: 'ai', action: 'remixAI', name: 'error_explaining_SolidityError', isClick: true })
  } catch (err) {
    console.error('unable to ask RemixAI')
    console.error(err)
  }
}
