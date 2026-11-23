import React, {useContext, useEffect, useState} from 'react' //eslint-disable-line
import { useIntl } from 'react-intl'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { helper } from '@remix-project/remix-solidity'
import { TrackingContext } from '@remix-ide/tracking'
import { AIEvent } from '@remix-api'
import { gotoError, fixWithRemixAI } from './error-actions'
import './renderer.css'

interface RendererProps {
  message: any
  opt?: RendererOptions
  plugin: any
  context?: string
}

type RendererOptions = {
  useSpan?: boolean
  type: string
  errorType?: string
  errCol?: number
  errLine?: number
  errFile?: string
}

export const Renderer = ({ message, opt, plugin, context }: RendererProps) => {
  const intl = useIntl()
  const { trackMatomoEvent } = useContext(TrackingContext)
  const [messageText, setMessageText] = useState(null)
  const [editorOptions, setEditorOptions] = useState<RendererOptions>({
    useSpan: false,
    type: '',
    errorType: '',
    errCol: null,
    errLine: null,
    errFile: null
  })
  const [classList, setClassList] = useState(opt.type === 'error' ? 'alert alert-danger' : 'alert alert-warning')
  const [close, setClose] = useState(false)

  useEffect(() => {
    if (!message) return
    let text

    if (typeof message === 'string') {
      text = message
    } else if (message.innerText) {
      text = message.innerText
    }

    // ^ e.g:
    // browser/gm.sol: Warning: Source file does not specify required compiler version! Consider adding "pragma solidity ^0.6.12
    // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v3.2.0/contracts/introspection/IERC1820Registry.sol: ParserError: Source file requires different compiler version (current compiler is 0.7.4+commit.3f05b770.Emscripten.clang) - note that nightly builds are considered to be strictly less than the released version

    if (!opt.errLine) {
      const positionDetails = helper.getPositionDetails(text)
      opt.errLine = !opt.errLine ? positionDetails.errLine as number : opt.errLine
      opt.errCol = !opt.errCol ? positionDetails.errCol as number : opt.errCol
      opt.errFile = !opt.errFile ? (positionDetails.errFile ? (positionDetails.errFile as string).trim() : '') : opt.errFile
    }

    setMessageText(text)
    setEditorOptions(opt)
    setClose(false)
    setClassList(opt.type === 'error' ? 'alert alert-danger' : 'alert alert-warning')
  }, [message, opt])

  const handleErrorClick = (opt) => {
    console.debug('[renderer] handleErrorClick()', { opt })
    if (opt.click) {
      console.debug('[renderer] handleErrorClick -> custom click handler')
      opt.click(message)
    } else if (opt.errFile !== undefined && opt.errLine !== undefined && opt.errCol !== undefined) {
      console.debug('[renderer] handleErrorClick -> _errorClick with', { file: opt.errFile, line: opt.errLine, col: opt.errCol })
      _errorClick(opt.errFile, opt.errLine, opt.errCol)
    }
  }

  const handleClose = () => {
    setClose(true)
  }

  const _errorClick = (errFile, errLine, errCol) => gotoError(plugin, errFile, errLine, errCol)

  const askGtp = () => fixWithRemixAI(
    plugin,
    editorOptions.errFile,
    messageText,
    (content, filePath) => intl.formatMessage({ id: `${context || 'solidity' }.openaigptMessage` }, { content, messageText, filePath }),
    trackMatomoEvent
  )

  return (
    <>
      {messageText && !close && (
        <div className={`remixui_sol ${editorOptions.type} ${classList}`} data-id={editorOptions.errFile} onClick={() => handleErrorClick(editorOptions)}>
          {editorOptions.useSpan ? (
            <span> {messageText} </span>
          ) : (
            <pre>
              <span>{messageText}</span>
            </pre>
          )}
          <div className="close" data-id="renderer" onClick={handleClose}>
            <i className="fas fa-times"></i>
          </div>
          <div className="d-flex pt-1 flex-row-reverse">
            <span className="ms-3 pt-1 py-1" >
              <CopyToClipboard content={messageText} className={` p-0 m-0 far fa-copy ${classList}`} direction={'top'} />
            </span>
            <span
              className="position-relative text-ai text-sm ps-0 pe-2"
              style={{ fontSize: "x-small", alignSelf: "end" }}
            >
            </span>
            <button
              className="btn btn-ai"
              data-id="ask-remix-ai-button"
              onClick={(event) => { event.preventDefault(); askGtp() }}
            >
              <img src="assets/img/remixAI_small.svg" alt="Remix AI" className="explain-icon" />
              <span>Fix with RemixAI</span>
            </button>

          </div>
        </div>
      )}
    </>
  )
}
