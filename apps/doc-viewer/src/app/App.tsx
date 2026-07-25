import React, {useEffect, useState} from 'react'
import {DocViewer} from './docviewer'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const client = new DocViewer()

export default function App() {
  const [contents, setContents] = useState('')
  useEffect(() => {
    client.eventEmitter.on('contentsReady', (fileContents: string) => {
      setContents(fileContents)
    })
  }, [])
  const edit = () => {
    if (!client.mdFile) return
    client.call('fileManager', 'open' as any, client.mdFile)
    client.call('fileManager', 'switchFile' as any, client.mdFile) //@TODO check why this doesn't work
  }
  return (
    <>
      <div className="bg-light p-5">
        <button className="btn btn-sm border mb-2" onClick={edit}>EDIT</button>
        <ReactMarkdown
          children={contents}
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({node, ...props}) => <h1 className="lh-sm" {...props} />
          }}
        />
      </div>
    </>
  )
}
