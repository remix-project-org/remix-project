import { CopyToClipboard } from '@remix-ui/clipboard'
import JSONTree, { ThemeKeys, ThemeObject } from '@microlink/react-json-view'
import React, { useState } from 'react'
import Tabs from 'react-bootstrap/Tabs'
import Tab from 'react-bootstrap/Tab'
import Button from 'react-bootstrap/Button'
import { ABIDescription } from '@remixproject/plugin-api'

export interface VyperCompilationResult {
  status?: 'success'
  bytecode: string
  bytecodeRuntime: string | 'bytecode_runtime'
  abi: ABIDescription[]
  ir: string
  methodIdentifiers: {
    [method: string]: string
  }
  compilerVersion: string
  evmVersion: string
}

export interface VyperCompileProps {
  result: VyperCompilationResult
  theme?: ThemeKeys | ThemeObject
  themeStyle?: any
}

type tabContentType = {
  tabHeadingText: string
  tabPayload: string | ABIDescription[]
  tabMemberType: keyof VyperCompilationResult | string
  tabButtonText: () => string
  eventKey: string
  version?: string
  evmVersion?: string
  methodIdentifiers?: {
    [method: string]: string
  }
}

export default function VyperCompile({ result, theme, themeStyle }: VyperCompileProps) {
  const [active, setActive] = useState<keyof VyperCompilationResult>('abi')
  const tabContent: tabContentType[] = [
    {
      tabHeadingText: 'ABI',
      tabPayload: result.abi,
      tabMemberType: 'abi',
      tabButtonText: () => 'Copy ABI',
      eventKey: 'abi',
      version: result.compilerVersion,
      evmVersion: result.evmVersion,
      methodIdentifiers: result.methodIdentifiers
    },
    {
      tabHeadingText: 'Bytecode',
      tabPayload: result.bytecode,
      tabMemberType: 'bytecode',
      tabButtonText: () => 'Copy Bytecode',
      eventKey: 'bytecode'
    },
    {
      tabHeadingText: 'Runtime Bytecode',
      tabPayload: result.bytecodeRuntime,
      tabMemberType: 'bytecode_runtime',
      tabButtonText: () => 'Copy Runtime Bytecode',
      eventKey: 'bytecode_runtime'
    }
  ]

  return (
    <div className='w-100 h-100 d-flex flex-row'>
      <Tabs className="flex-column" style={{ height: "fit-content", backgroundColor: 'var(--bs-body-bg)' }} id="result" activeKey={active} onSelect={(key: any) => setActive(key)}>
        {tabContent.map((content, index) => (
          <Tab className="border-top border-start p-4 bg-light" style={{ width: '50rem', height: 'fit-content', minHeight: '25rem' }} eventKey={content.eventKey} title={content.tabHeadingText} as={'span'} key={`${index}-${content.eventKey}`}>
            <div className="d-flex flex-column w-90 justify-content-center mx-auto rounded-2">
              <CopyToClipboard getContent={() => (content.eventKey !== 'abi' ? content.tabPayload : JSON.stringify(result['abi']))}>
                <Button
                  className="copy ms-2 btn btn-sm btn-secondary"
                  data-id={content.eventKey === 'abi' ? 'copy-abi' : ''}
                >
                  <span className="far fa-copy me-2"></span>
                  {content.tabButtonText()}
                </Button>
              </CopyToClipboard>
              {content.eventKey === 'abi' ? (
                <div className="my-3">
                  {JSON.stringify(content?.tabPayload)?.length > 1 ? <JSONTree
                    src={{ ...content.tabPayload as ABIDescription[], evmVersion: content.evmVersion, version: content.version, methodIdentifiers: content.methodIdentifiers } }
                    theme={theme}
                    style={themeStyle}
                  /> : null}
                </div>
              ) : (
                <div className="w-100 mt-2 p-2 mx-auto">
                  <textarea className="form-control rounded-2" defaultValue={content.tabPayload as string} rows={15}></textarea>
                </div>
              )}
            </div>
          </Tab>
        ))}
      </Tabs>
    </div>
  )
}
