import React, { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import copy from 'copy-to-clipboard'
import BackButton from '../../components/BackButton'
import { useAppSelector, useAppDispatch } from '../../redux/hooks'
import { trackMatomoEvent } from '@remix-api'
import './index.scss'
import remixClient from '../../remix-client'

export function normalizeMarkdown(input: string): string {
  return input
    .trim()
    .replace(/\n{2,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "");
}

function StepDetailPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const [clonedStep, setClonedStep] = React.useState(null)
  const [themeTracker, setThemeTracker] = React.useState(null)

  const queryParams = new URLSearchParams(location.search)
  const id = queryParams.get('id') as string
  const stepId = Number(queryParams.get('stepId'))
  const {
    workshop: { detail, selectedId },
    remixide: { errorLoadingFile, errors, success },
  } = useAppSelector((state: any) => state)
  const entity = detail[selectedId].entities[id]
  const steps = entity.steps
  const step = steps[stepId]

  useEffect(() => {
    setClonedStep(null)
    const clonedStep = JSON.parse(JSON.stringify(step))
    const loadFiles = async () => {
      async function loadFile(step, fileType) {
        if (step[fileType] && step[fileType].file && !step[fileType].content) {
          clonedStep[fileType].content = (await remixClient.call('contentImport', 'resolve', step[fileType].file)).content;
        }
      }

      const fileTypes = ['markdown', 'solidity', 'test', 'answer', 'js', 'vy'];
      for (const fileType of fileTypes) {
        await loadFile(step, fileType);
      }
    }
    loadFiles().then(() => {

      setClonedStep(clonedStep)
      dispatch({
        type: 'remixide/displayFile',
        payload: clonedStep,
      })
      dispatch({
        type: 'remixide/save',
        payload: { errors: [], success: false },
      })
      window.scrollTo(0, 0)
    })
  }, [step])

  useEffect(() => {
    if (errors.length > 0 || success) {
      window.scrollTo(0, document.documentElement.scrollHeight)
    }
  }, [errors, success])

  useEffect(() => {
    remixClient.on('theme', 'themeChanged', (theme) => {
      setThemeTracker(theme)
    })
    return () => {
      remixClient.off('theme', 'themeChanged')
    }
  }, [])

  if (!clonedStep) {
    return (<div className='pb-4'>
      <div className="fixed-top">
        <div className="bg-light">
          <BackButton entity={entity} />
        </div>
      </div>
      loading...
    </div>
    )
  }  

  const VideoRenderer = ({
    node,
    src,
    alt,
    ...props
  }: {
    node?: any;
    src?: string;
    alt?: string;
    [key: string]: any;
  }) => {
    if (alt === 'youtube') {
      /*
        <iframe width="560" height="315" src="https://www.youtube.com/embed/Eh1qgOurDxU?si=lz1JypmIJZ15OY4g" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
      */
      return (
        <div className="position-relative overflow-hidden" style={{ paddingBottom: '56.25%', maxWidth: '100%', height: '0' }}>
          <iframe
            style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
            src={src}
            title="YouTube video player"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
    if (alt === 'video') {
      return <video controls src={src} style={{ maxWidth: '100%' }} />;
    }
    return <img src={src} alt={alt} {...props} />;
  };

  return (
    <div className='pb-4'>
      <div className="fixed-top">
        <div className="bg-light">
          <BackButton entity={entity} />
        </div>
      </div>
      <div id="top"></div>
      {errorLoadingFile ? (
        <>
          <div className="errorloadingspacer"></div>
          <h1 className="ps-3 pe-3 pt-3 pb-1">{clonedStep.name}</h1>
          <button
            className="w-100 nav-item rounded-0 nav-link btn btn-success test"
            onClick={() => {
              dispatch({
                type: 'remixide/displayFile',
                payload: clonedStep,
              })
            }}
          >
            Load the file
          </button>
          <div className="mb-4"></div>
        </>
      ) : (
        <>
          <div className="menuspacer"></div>
          <h1 className="pe-3 ps-3 pt-3 pb-1">{clonedStep.name}</h1>
        </>
      )}
      <div className="container-fluid">
        <ReactMarkdown
          remarkPlugins={[[remarkGfm, { }]]}
          remarkRehypeOptions={{
          }}
          rehypePlugins={[rehypeRaw, rehypeSanitize]}
          linkTarget="_blank"
          components={{
          // Code blocks and inline code
            code({ node, inline, className, children, ...props }) {
              const text = String(children).replace(/\n$/, '')
              const match = /language-(\w+)/.exec(className || '')
              const language = match ? match[1] : ''
              if (inline) {
                return (
                  <code className="ai-inline-code" {...props}>
                    {text}
                  </code>
                )
              }
              return (
                <div className="ai-code-block-wrapper">
                  {language && (
                    <div className={`ai-code-header ${themeTracker?.name === 'Dark' ? 'text-white' : 'text-dark'}`}>
                      <span className="ai-code-language">{language}</span>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-info border border-info"
                        onClick={() => copy(text)}
                        title="Copy code"
                      >
                        <i className="fa-regular fa-copy"></i>
                      </button>
                    </div>
                  )}
                  {!language && (
                    <button
                      type="button"
                      className="ai-copy-btn ai-copy-btn-absolute"
                      onClick={() => copy(text)}
                      title="Copy code"
                    >
                      <i className="fa-regular fa-copy"></i>
                    </button>
                  )}
                  <pre className="ai-code-pre">
                    <code className={className}>{text}</code>
                  </pre>
                </div>
              )
            },
            img: VideoRenderer,
            // Paragraphs
            p: ({ node, ...props }) => (
              <p className="ai-paragraph" {...props} />
            ),
            // Headings
            h1: ({ node, ...props }) => (
              <h1 className="ai-heading ai-h1 fs-5 mb-1" {...props} />
            ),
            h2: ({ node, ...props }) => (
              <h2 className="ai-heading ai-h2 fs-5 mb-1" {...props} />
            ),
            h3: ({ node, ...props }) => (
              <h3 className="ai-heading ai-h3 fs-5 mb-1" {...props} />
            ),
            h4: ({ node, ...props }) => (
              <h4 className="ai-heading ai-h4 fs-6 mb-1" {...props} />
            ),
            h5: ({ node, ...props }) => (
              <h5 className="ai-heading ai-h5 fs-6 mb-1" {...props} />
            ),
            h6: ({ node, ...props }) => (
              <h6 className="ai-heading ai-h6 fs-6 mb-1" {...props} />
            ),
            // Lists
            ul: ({ node, ...props }) => (
              <ul className="ai-list ai-list-unordered" {...props} />
            ),
            ol: ({ node, ...props }) => (
              <ol className="ai-list ai-list-ordered" {...props} />
            ),
            li: ({ node, ...props }) => (
              <li className="ai-list-item" {...props} />
            ),
            // Links
            a: ({ node, ...props }) => (
              <a className="ai-link" target="_blank" rel="noopener noreferrer" {...props} />
            ),
            // Blockquotes
            blockquote: ({ node, ...props }) => (
              <blockquote className="ai-blockquote" {...props} />
            ),
            // Tables
            table: ({ node, ...props }) => (
              <div className="ai-table-wrapper">
                <table className="ai-table" {...props} />
              </div>
            ),
            thead: ({ node, ...props }) => (
              <thead className="ai-table-head" {...props} />
            ),
            tbody: ({ node, ...props }) => (
              <tbody className="ai-table-body" {...props} />
            ),
            tr: ({ node, ...props }) => (
              <tr className="ai-table-row" {...props} />
            ),
            th: ({ node, ...props }) => (
              <th className="ai-table-header-cell" {...props} />
            ),
            td: ({ node, ...props }) => (
              <td className="ai-table-cell" {...props} />
            ),
            // Horizontal rule
            hr: ({ node, ...props }) => (
              <hr className="ai-divider" {...props} />
            ),
            // Strong and emphasis
            strong: ({ node, ...props }) => (
              <strong className="ai-strong" {...props} />
            ),
            em: ({ node, ...props }) => (
              <em className="ai-emphasis" {...props} />
            )
          }}
        >
          {normalizeMarkdown(clonedStep.markdown?.content)}
        </ReactMarkdown>
      </div>
      {clonedStep.test?.content ? (
        <>
          <div className="mt-3 px-2">
            <nav className="nav nav-pills nav-fill">
              {errorLoadingFile ? (
                <button
                  className="nav-item rounded-0 nav-link btn btn-warning test"
                  onClick={() => {
                    dispatch({
                      type: 'remixide/displayFile',
                      payload: clonedStep,
                    })
                  }}
                >
                  Load the file
                </button>
              ) : (
                <>
                  {!errorLoadingFile ? (
                    <>
                      <button
                        className="nav-item rounded-0 nav-link btn btn-info test"
                        onClick={() => {
                          dispatch({
                            type: 'remixide/testStep',
                            payload: clonedStep,
                          })
                        }}
                      >
                        Check Answer
                      </button>
                      {clonedStep.answer?.content && (
                        <button
                          className="nav-item rounded-0 nav-link btn btn-warning test"
                          onClick={() => {
                            dispatch({
                              type: 'remixide/showAnswer',
                              payload: clonedStep,
                            })
                          }}
                        >
                          Show answer
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {!errorLoadingFile && (
                        <>
                          <button
                            className="nav-item rounded-0 nav-link btn btn-success test"
                            onClick={() => {
                              navigate(stepId === steps.length - 1 ? `/list?id=${id}` : `/detail?id=${id}&stepId=${stepId + 1}`)
                            }}
                          >
                            Next
                          </button>
                          {clonedStep.answer?.content && (
                            <button
                              className="nav-item rounded-0 nav-link btn btn-warning test"
                              onClick={() => {
                                dispatch({
                                  type: 'remixide/showAnswer',
                                  payload: clonedStep,
                                })
                              }}
                            >
                              Show answer
                            </button>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </nav>
            {success && (
              <button
                className="w-100 rounded-0 nav-item nav-link btn btn-success"
                onClick={() => {
                  navigate(stepId === steps.length - 1 ? `/list?id=${id}` : `/detail?id=${id}&stepId=${stepId + 1}`)
                }}
              >
                Next
              </button>
            )}
          </div>
          <div id="errors">
            {success && (
              <div className="alert rounded-0 alert-success mb-0 mt-0" role="alert">
                Well done! No errors.
              </div>
            )}
            {errors.length > 0 && (
              <>
                {!success && (
                  <div className="alert rounded-0 alert-danger mb-0 mt-0" role="alert">
                    Errors
                  </div>
                )}
                {errors.map((error: string, index: number) => (
                  <div key={index} className="alert rounded-0 alert-warning mb-0 mt-0">
                    {error}
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="mt-3 px-2">
            <nav className="nav nav-pills nav-fill">
              {!errorLoadingFile && clonedStep.answer?.content && (
                <button
                  className="nav-item rounded-0 nav-link btn btn-warning test"
                  onClick={() => {
                    dispatch({
                      type: 'remixide/showAnswer',
                      payload: clonedStep,
                    })
                  }}
                >
                  Show answer
                </button>
              )}
            </nav>
            {stepId < steps.length - 1 && (
              <button
                className="w-100 btn btn-success mt-3"
                onClick={() => {
                  navigate(`/detail?id=${id}&stepId=${stepId + 1}`);
                  trackMatomoEvent(remixClient, { 
                    category: 'learneth', 
                    action: 'navigate_next', 
                    name: `${id}/${stepId + 1}`, 
                    isClick: true 
                  })
                }}
              >
                Next
              </button>
            )}
            {stepId === steps.length - 1 && (
              <button
                className="w-100 btn btn-success"
                onClick={() => {
                  // Save tutorial completion to localStorage
                  const completedTutorials = JSON.parse(localStorage.getItem('learneth_completed_tutorials') || '{}');
                  completedTutorials[id] = true;
                  localStorage.setItem('learneth_completed_tutorials', JSON.stringify(completedTutorials));

                  navigate(`/list?id=${id}`);
                  trackMatomoEvent(remixClient, {
                    category: 'learneth',
                    action: 'navigate_finish',
                    name: id,
                    isClick: true
                  })
                }}
              >
                Finish tutorial
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default StepDetailPage
