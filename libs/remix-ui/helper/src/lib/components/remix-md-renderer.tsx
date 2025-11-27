import copy from 'copy-to-clipboard'
import React from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import '../css/helper.css'

export function normalizeMarkdown(input: string): string {
  return input
    .trim()
    .replace(/\n{2,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
}

export function RemixMdRenderer({ markDownContent, theme }: { markDownContent: string, theme: string }): React.ReactNode {

  return (
    <ReactMarkdown
      remarkPlugins={[[remarkGfm, {}]]}
      remarkRehypeOptions={{}}
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
                <div className={`ai-code-header ${theme === 'Dark' ? 'text-white' : 'text-dark'}`}>
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
        li: ({ node, ordered, ...props }) => (
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
      {normalizeMarkdown(markDownContent)}
    </ReactMarkdown>
  )
}
