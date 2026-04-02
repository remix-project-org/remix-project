import { useState, useEffect, useRef } from 'react'
import { IntlProvider } from 'react-intl'
import { Renderer } from '@remix-ui/renderer'
import { remixClient, extractRelativePath } from './utils'
import { CompilationResult } from '@remixproject/plugin-api'

// Components
import CompilerButton from './components/CompilerButton'
import VyperResult from './components/VyperResult'
import LocalUrlInput from './components/LocalUrl'
import Button from 'react-bootstrap/Button'
import Accordion from 'react-bootstrap/Accordion'

import './app.css'
import { CustomTooltip } from '@remix-ui/helper'
import { Form } from 'react-bootstrap'
import CustomAccordionToggle from './components/CustomAccordionToggle'
import { VyperCompilationResultWrapper, VyperCompilationErrorsWrapper, VyperCompilationError } from './utils/types'
import { endpointUrls } from '@remix-endpoints-helper'

interface AppState {
  status: 'idle' | 'inProgress'
  environment: 'remote' | 'local'
  compilationResult?: CompilationResult
  localUrl: string
}

const App = () => {
  const [locale, setLocale] = useState<{code: string; messages: any}>({
    code: 'en',
    messages: null
  })
  const [contract, setContract] = useState<string>()
  const [output, setOutput] = useState<VyperCompilationErrorsWrapper | VyperCompilationResultWrapper>(remixClient.compilerOutput)
  const [state, setState] = useState<AppState>({
    status: 'idle',
    environment: 'remote',
    localUrl: 'http://localhost:8000/',
  })

  const spinnerIcon = useRef(null)

  useEffect(() => {
    async function start() {
      try {
        await remixClient.loaded()
        remixClient.onFileChange((name) => {
          !name.endsWith('.vy') && remixClient.changeStatus({ key: 'none' })
          setOutput(null)
          setContract(name)
        })
        remixClient.onNoFileSelected(() => setContract(''))
      } catch (err) {
        console.log(err)
      }

      try {
        remixClient.call('locale' as any, 'currentLocale').then((currentLocale) => {
          setLocale(currentLocale)
        })

        remixClient.on('locale' as any, 'localeChanged', (locale: any) => {
          setLocale(locale)
        })
      } catch (err) {
        console.log(err)
      }

      try {
        const name = await remixClient.getContractName() // throw if no file are selected
        setContract(name)
      } catch (e) {}
    }
    start()
  }, [])

  useEffect(() => {
    remixClient.eventEmitter.on('resetCompilerState', () => {
      resetCompilerResultState()
    })

    return () => {
      remixClient.eventEmitter.off('resetCompilerState', () => {
        resetCompilerResultState()
      })
    }
  }, [])

  useEffect(() => {
    remixClient.eventEmitter.on('setOutput', (payload) => {
      setOutput(payload)
    })

    return () => {
      remixClient.eventEmitter.off('setOutput', (payload) => {
        setOutput(payload)
      })
    }
  }, [])

  /** Update the environment state value */
  function setEnvironment(environment: 'local' | 'remote') {
    setState({ ...state, environment })
  }

  function setLocalUrl(url: string) {
    setState({ ...state, localUrl: url })
  }

  function compilerUrl() {
    return state.environment === 'remote' ? `${endpointUrls.vyper2}/` : state.localUrl
  }

  function resetCompilerResultState() {
    setOutput(remixClient.compilerOutput)
  }

  const [cloneCount, setCloneCount] = useState(0)

  return (
    <IntlProvider locale={locale.code} messages={locale.messages}>
      <main id="vyper-plugin">
        <section>
          <div className="px-3 pt-3 mb-3 w-full">
            <CustomTooltip placement="bottom" tooltipText="Clone a repo of Vyper examples. Switch to the File Explorer to see the examples.">
              <button data-id="add-repository" className="w-full text-dark btn border" onClick={() => {
                {cloneCount === 0 ? remixClient.cloneVyperRepo() : remixClient.cloneVyperRepo(cloneCount)}
                setCloneCount((prev) => {
                  return ++prev
                })
              }}>
              Clone a repo of Vyper examples
              </button>
            </CustomTooltip>
          </div>

          <Accordion className="border-0 w-full accordion-background">
            <div className="border-0">
              <div className="">
                <CustomAccordionToggle eventKey="0">
                  <label style={{ fontSize: "1REM" }}>Configurations</label>
                </CustomAccordionToggle>
              </div>
              <Accordion.Collapse eventKey="0">
                <div className="pb-2 border-b">
                  <Form>
                    <div className="flex flex-row justify-around mb-1 mt-2">
                      <div className={`form-control custom-radio ${state.environment === 'remote' ? 'flex' : 'flex cursor-status'} bg-body`}>
                        <input
                          type="radio"
                          id="remote-compiler"
                          data-id="remote-compiler"
                          name="remote"
                          value={state.environment}
                          checked={state.environment === 'remote'}
                          onChange={() => setEnvironment('remote')}
                          className={`form-check-input ${state.environment === 'remote' ? 'flex mr-1' : 'flex mr-1 cursor-status'}`}
                        />
                        <label
                          htmlFor="remote-compiler"
                          className="form-check-label"
                        >Remote Compiler</label>
                      </div>
                      <div className={`form-control custom-radio ${state.environment === 'local' ? 'mr-2' : `cursor-status`} bg-body p-0 mt-1`}>
                        <input
                          id="local-compiler"
                          data-id="local-compiler"
                          checked={state.environment === 'local'}
                          type="radio"
                          name="local"
                          value={state.environment}
                          onChange={() => setEnvironment('local')}
                          className={`form-check-input  ${state.environment === 'local' ? '' : `cursor-status`} mr-1`}
                        />
                        <label
                          htmlFor="local-compiler"
                          className="form-check-label"
                        >Local Compiler</label>
                      </div>
                    </div>
                  </Form>
                  <LocalUrlInput url={state.localUrl} setUrl={setLocalUrl} environment={state.environment} />
                </div>
              </Accordion.Collapse>
            </div>
          </Accordion>
          <span className="w-full px-3 mt-3 mb-1 small text-warning">
          Specify the{' '}
            <a className="text-warning" target="_blank" href="https://remix-ide.readthedocs.io/en/latest/vyper.html#specify-vyper-version">
            compiler version
            </a>{' '}
          &{' '}
            <a className="text-warning" href="https://remix-ide.readthedocs.io/en/latest/vyper.html#evm-version" target="_blank" rel="noopener noreferrer">
            EVM version
            </a>{' '}
          in the .vy file.
          </span>
          <div className="px-3 w-full mb-3 mt-1" id="compile-btn">
            <CompilerButton compilerUrl={compilerUrl()} contract={contract} setOutput={(name, update) => setOutput({ ...output, [name]: update })} resetCompilerState={resetCompilerResultState} output={output} remixClient={remixClient}/>
          </div>
          <article id="result" className="px-3 p-2 w-full border-t mt-2 vyper-errorBlobs">
            {output && output.status === 'success' &&
            <>
              <VyperResult output={output} plugin={remixClient} />
            </>
            }
            {output && output.status === 'failed' &&
            output.errors && output.errors.map((error: VyperCompilationError, index: number) => {
              return <Renderer key={index}
                message={extractRelativePath(error.message, contract)}
                plugin={remixClient}
                context='vyper'
                opt={{
                  useSpan: false,
                  type: 'error',
                  errorType: error.error_type,
                  errCol: error.column,
                  errLine: error.line ? error.line - 1 : null,
                  errFile: contract
                }}
              />
            })
            }
          </article>
        </section>
      </main>
    </IntlProvider>
  )
}

export default App
