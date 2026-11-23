/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import copy from 'copy-to-clipboard'
import { loader } from '@monaco-editor/react'
import { normalizeMarkdown } from 'libs/remix-ui/helper/src/lib/components/remix-md-renderer'

/** Blocks longer than this many lines start folded… */
const FOLD_OVER = 15
/** …showing this many. */
const FOLDED_LINES = 12

// Answers say `solidity` or `sol`; the editor registers the language as `remix-solidity`.
const monacoLanguage = (language: string) => (language === 'sol' || language === 'solidity' ? 'remix-solidity' : language)

/**
 * Syntax colours from the editor's own tokenizer, so they follow the editor
 * theme. Null until Monaco has coloured exactly this text, and for languages
 * Monaco doesn't know: the block then shows plain text.
 */
const useColorized = (code: string, language: string): string | null => {
  const [colored, setColored] = useState<{ code: string, html: string } | null>(null)
  useEffect(() => {
    const lang = monacoLanguage(language)
    if (!lang) return
    let cancelled = false
    loader.init()
      .then(monaco => monaco.languages.getLanguages().some(l => l.id === lang) ? monaco.editor.colorize(code, lang, {}) : null)
      .then(html => { if (!cancelled && html) setColored({ code, html }) })
      .catch(() => { /* plain text it is */ })
    return () => { cancelled = true }
  }, [code, language])
  return colored && colored.code === code ? colored.html : null
}

/** A fenced code block: language and Copy in a header, long blocks folded. */
export const CodeBlock: React.FC<{ code: string, language: string }> = ({ code, language }) => {
  // Per block: one block's "Copied" must not light up the others.
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const lines = code.split('\n')
  const foldable = lines.length > FOLD_OVER
  const folded = foldable && !expanded
  const visible = folded ? lines.slice(0, FOLDED_LINES).join('\n') : code
  const html = useColorized(visible, language)

  return (
    <div className="ai-code" data-id="ai-code-block">
      <div className="ai-code-head">
        <span>{language}</span>
        <button
          type="button"
          className="ai-code-btn"
          data-id="ai-code-copy"
          onClick={() => {
            copy(code)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <><i className="fas fa-check"></i>Copied</> : <><i className="far fa-copy"></i>Copy</>}
        </button>
      </div>
      <pre className={`ai-code-body ${folded ? 'is-folded' : ''}`}>
        {html ? <code dangerouslySetInnerHTML={{ __html: html }} /> : <code>{visible}</code>}
      </pre>
      {foldable && (
        <button type="button" className="ai-code-more" data-id="ai-code-fold" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Show less' : `Show all ${lines.length} lines`}
          <i className={`fas fa-chevron-${expanded ? 'up' : 'down'}`}></i>
        </button>
      )}
    </div>
  )
}

/** Markdown of an answer. Plain elements, styled by `.ai-md` in remix-ai-assistant.css. */
export const AiMarkdown: React.FC<{ content: string }> = ({ content }) => (
  <div className="ai-md">
    <ReactMarkdown
      remarkPlugins={[[remarkGfm, {}]]}
      remarkRehypeOptions={{}}
      rehypePlugins={[rehypeRaw, rehypeSanitize]}
      linkTarget="_blank"
      components={{
        code({ node, inline, className, children, ...props }) {
          const text = String(children).replace(/\n$/, '')
          if (inline) return <code {...props}>{text}</code>
          const language = /language-(\w+)/.exec(className || '')?.[1] ?? ''
          return <CodeBlock code={text} language={language} />
        },
        // The code block brings its own frame.
        pre: ({ children }) => <>{children}</>,
        a: ({ node, ...props }) => <a target="_blank" rel="noopener noreferrer" {...props} />,
        table: ({ node, ...props }) => (
          <div className="ai-md-table">
            <table {...props} />
          </div>
        )
      }}
    >
      {normalizeMarkdown(content)}
    </ReactMarkdown>
  </div>
)
