import React, { useMemo, useState, useEffect } from 'react'
import { CustomTooltip } from "@remix-ui/helper"
import { Link, useLocation, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import copy from 'copy-to-clipboard'
import BackButton from '../../components/BackButton'
import SlideIn from '../../components/SlideIn'
import { useAppSelector } from '../../redux/hooks'
import { trackMatomoEvent } from '@remix-api'
import remixClient from '../../remix-client'
import './index.scss'

const LEVEL_LABEL: Record<'1'|'2'|'3', string> = { '1': 'Beginner', '2': 'Intermediate', '3': 'Advanced' }

export function normalizeMarkdown(input: string): string {
  return input
    .trim()
    .replace(/\n{2,}/g, "\n\n")
    .replace(/[ \t]+$/gm, "");
}

const Antenna = ({ level }: { level: number }) => {
  const active = Math.min(Math.max(level, 0), 3)
  return (
    <span className="antenna d-inline-flex align-items-end">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className={`antenna-bar ${i < active ? 'bg-primary' : 'bg-secondary'}`}
          style={{ height: `${8 + i * 4}px` }}
        />
      ))}
    </span>
  )
}

export default function StepListPage(): JSX.Element {
  const [completedTutorials, setCompletedTutorials] = useState<Record<string, boolean>>({})
  const [themeTracker, setThemeTracker] = useState(null)
  
  useEffect(() => {
    remixClient.on('theme', 'themeChanged', (theme) => {
      setThemeTracker(theme)
    })
    return () => {
      remixClient.off('theme', 'themeChanged')
    }
  }, [])

  useEffect(() => {
    // Load completed tutorials from localStorage
    const completed = JSON.parse(localStorage.getItem('learneth_completed_tutorials') || '{}')
    setCompletedTutorials(completed)
  }, [])

  const location = useLocation()
  const queryParams = new URLSearchParams(location.search)
  const id = queryParams.get('id') as string
  const { detail, selectedId } = useAppSelector((s) => s.workshop)
  const repo = detail[selectedId]
  const entity = repo?.entities?.[id] || {}

  const navigate = useNavigate()

  const [isExpanded, setIsExpanded] = useState(false)

  const { levelNum, levelText } = useMemo(() => { 
    let found: string | undefined
    if (repo?.group) {
      for (const key of Object.keys(repo.group)) {
        if ((repo.group[key] || []).some((it: any) => it.id === id)) { found = key; break }
      }
    }
    const k = (found as '1'|'2'|'3') || '1'
    return { levelNum: Number(k), levelText: LEVEL_LABEL[k] }
  }, [repo, id])

  const steps = entity?.steps || []
  const stepsLen = steps.length

  const fullDescription = entity?.text || entity?.description?.content || ''
  const needsExpansionButton = fullDescription.length > 200

  const TRUNCATE_LENGTH = 150
  const needsTruncation = fullDescription.length > TRUNCATE_LENGTH

  const stepMinutes = (step: any): string => {
    const m = step?.metadata?.data?.minutes ?? step?.metadata?.data?.durationMinutes
    return typeof m === 'number' && m > 0 ? `${m} min` : ''
  }

  return (
    <div className="mb-5">
      <div className="fixed-top">
        <div className="bg-light">
          <BackButton />
        </div>
      </div>

      <div className="menuspacer" />

      <div className="container-fluid">
        <article className="card course-hero mb-3 border border-secondary">
          <div className="card-body">
            {entity?.id && completedTutorials[entity?.id] && (
                <CustomTooltip
                placement={"auto"}
                tooltipId="tutorialCompletedTooltip"
                tooltipClasses="text-nowrap"
                tooltipText={<span>{'Completed'}</span>}
              ><span className="badge bg-success float-end">Completed</span></CustomTooltip>                      
              )}
            <h2 className="h4 mb-2">{entity?.name}</h2>            
            <div className={`description-wrapper ${!isExpanded && needsExpansionButton ? 'truncated' : ''}`}>
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
                {normalizeMarkdown(fullDescription)}
              </ReactMarkdown>
            </div>

            {needsTruncation && (
              <button 
                className="btn btn-link more-button p-0"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? 'less' : 'more'}
              </button>
            )}

            <button
              type="button"
              className="btn btn-primary no-wiggle-btn btn-sm w-100 d-flex align-items-center justify-content-center mt-3"
              onClick={() => {
                trackMatomoEvent(remixClient, { 
                  category: 'learneth', 
                  action: 'start_course', 
                  name: id, 
                  isClick: true 
                })
                navigate(`/detail?id=${id}&stepId=0`)
              }}
            >
              <span className="no-wiggle-label">Start the course now</span>
              <i className="fas fa-play no-wiggle-icon" aria-hidden="true"></i>
            </button>
          </div>
        </article>
 
        <section className="stats-row">
          <div className="stat">
            <Antenna level={levelNum} />  
            <div>
              <div className="stat-label">Level</div>
              <div className="stat-value">{levelText}</div>
            </div>
          </div>
          <div className="stat">
            <i className="fas fa-book stat-icon" aria-hidden="true" />
            <div>
              <div className="stat-label">Chapters</div>
              <div className="stat-value">{stepsLen || 0}</div>
            </div>
          </div> 
        </section>

        <hr className="hr-themed mb-3 mt-0" />

        <div className="d-flex align-items-baseline justify-content-between mb-2">
          <h3 className="h6 m-0">Syllabus</h3>
          <div className="small text-muted">{stepsLen} chapters</div>
        </div>

        <SlideIn>
          <div className="list-group syllabus-list">
            {steps.map((step: any, i: number) => (
              <Link
                key={i}
                to={`/detail?id=${id}&stepId=${i}`}
                className="list-group-item list-group-item-action d-flex align-items-center justify-content-between syllabus-item"
                onClick={() => trackMatomoEvent(remixClient, { 
                  category: 'learneth', 
                  action: 'step_slide_in', 
                  name: `${id}/${i}/${step.name}`, 
                  isClick: true 
                })}
              >
                <span className="text-truncate">{step.name}</span>
                <span className="d-flex align-items-center text-muted">
                  <span className="small mr-2">{stepMinutes(step)}</span>
                  <i className="fas fa-chevron-right opacity-75" aria-hidden="true"></i>
                </span>
              </Link>
            ))}
          </div>
        </SlideIn>
      </div>
    </div>
  )
}