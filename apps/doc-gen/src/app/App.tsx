import React, { useState, useEffect } from 'react'

import './App.css'
import { DocGenClient } from './docgen-client'
import { Build } from './docgen/site'

export const client = new DocGenClient()

const App = () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [themeType, setThemeType] = useState<string>('dark')
  const [hasBuild, setHasBuild] = useState<boolean>(false)
  const [fileName, setFileName] = useState<string>('')

  useEffect(() => {
    const watchThemeSwitch = async () => {
      client.eventEmitter.on('themeChanged', (theme: string) => {
        setThemeType(theme)
      })
      client.eventEmitter.on('compilationFinished', (build: Build, fileName: string) => {
        setHasBuild(true)
        setFileName(fileName)
      })
      client.eventEmitter.on('docsGenerated', (docs: string[]) => {})
    }
    watchThemeSwitch()
  }, [])

  return (
    <div className="p-3">
      <h5 className="h-5 mb-3">
        Compile a Solidity contract and generate its documentation as Markdown. (Right-click on a contract in the File
        Explorer and select "Generate Docs" from the context menu).
      </h5>
      {fileName && (
        <div className="border-b border-t px-2 py-3 justify-center items-center flex">
          <h6>File: {fileName}</h6>
        </div>
      )}
      {hasBuild && (
        <button className="btn btn-primary w-full mt-4" onClick={() => client.generateDocs()}>
          Generate Docs
        </button>
      )}
    </div>
  )
}

export default App
