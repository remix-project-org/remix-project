import React, {useState} from 'react'
import {isCompilationError} from '../utils'
import {CopyToClipboard} from '@remix-ui/clipboard'

interface VyperResultProps {
  output?: any
  plugin?: any
}

export type OutputType = {
  contractName: string
  abi: any
  bytecode: any
  runtimeBytecode: any
  ir: string
  methodIdentifiers: any
}

export type ExampleContract = {
  name: string
  address: string
}

type TabContentMembers = {
  tabText: string
  tabPayload: any
  tabMemberType: 'abi' | 'bytecode' | 'bytecode_runtime' | 'ir'
  className: string
}

function VyperResult({ output, plugin }: VyperResultProps) {

  if (!output)
    return (
      <div id="result">
        <p className="my-3">No contract compiled yet.</p>
      </div>
    )

  if (isCompilationError(output)) {
    return (
      <div id="result" className="error">
        <i className="fas fa-exclamation-circle text-danger"></i>
        <pre
          data-id="error-message"
          className="px-2 w-100 alert alert-danger"
          style={{
            fontSize: '0.5rem',
            overflowX: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          {output.message}
        </pre>
      </div>
    )
  }

  return (
    <>
      <div className="d-flex justify-content-center w-100 mb-3 mt-1 vyper-panel-width flex-column">
        <button data-id="compilation-details" className="remixui_resultsBtn text-dark border btn d-block btn-block" onClick={async () => {
          await plugin?.call('vyperCompilationDetails', 'showDetails', output)
        }}>
          <span>
            <i className="fa-regular fa-memo-pad me-2 text-primary"></i>
            <span>Compilation Details</span>
          </span>
        </button>
        <div className="mt-1">
          <div className="input-group input-group d-flex flex-row-reverse">
            <div className="btn-group align-self-start" role="group" aria-label="Copy to Clipboard">
              <CopyToClipboard tip={'Copy ABI to clipboard'} getContent={() => (Object.values(output)[1] as OutputType)?.abi} direction="bottom" icon="far fa-copy">
                <span className="btn remixui_copyButton">
                  <i className="remixui_copyIcon far fa-copy" aria-hidden="true"></i>
                  <span>ABI</span>
                </span>
              </CopyToClipboard>
              <CopyToClipboard tip={'Copy Bytecode to clipboard'} getContent={() => (Object.values(output)[1] as OutputType)?.bytecode.object} direction="bottom" icon="far fa-copy">
                <span className="btn remixui_copyButton">
                  <i className="remixui_copyIcon far fa-copy" aria-hidden="true"></i>
                  <span>Bytecode</span>
                </span>
              </CopyToClipboard>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default VyperResult
