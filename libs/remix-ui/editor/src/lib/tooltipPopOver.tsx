import React, { useState, useRef, useEffect, useContext } from 'react'
import { AIEvent } from '@remix-api'
import type { IPosition } from 'monaco-editor'
//@ts-ignore
import { TrackingContext } from '@remix-ide/tracking'

// Risk configuration for code analysis badges
const RISK_CONFIG = {
  high: { badge: "danger", icon: "fas fa-exclamation-triangle" },
  medium: { badge: "warning", icon: "fas fa-exclamation-circle" },
  low: { badge: "info", icon: "fas fa-info-circle" },
}

export interface TooltipPopOverProps {
  keyword: string
  position: { x: number; y: number }
  onClose: () => void
  onClearSelection?: () => void
  visible: boolean
  plugin?: any
  contextLines?: string
  isSelectedText?: boolean
}

interface KeywordData {
  title: string
  body: string
  risk: 'high' | 'medium' | 'low'
  riskLabel: string
}

// Utility function to open contextual tooltip
// In-memory flag for hiding popover (resets on page reload)
let isPopoverDisabledFlag = false

// Check if popover is disabled for this session
export const isPopoverDisabled = (): boolean => {
  return isPopoverDisabledFlag
}

// Disable popover for this session
export const disablePopoverForSession = (): void => {
  isPopoverDisabledFlag = true
}

// Helper function to detect language from filename
const getLanguageFromFilename = (filename: string): { label: string; code: string } => {
  if (!filename) return { label: 'code', code: '' }

  if (filename.endsWith('.sol')) return { label: 'Solidity', code: 'solidity' }
  if (filename.endsWith('.js')) return { label: 'JavaScript', code: 'javascript' }
  if (filename.endsWith('.ts') || filename.endsWith('.tsx')) return { label: 'TypeScript', code: 'typescript' }
  if (filename.endsWith('.py')) return { label: 'Python', code: 'python' }
  if (filename.endsWith('.vy')) return { label: 'Vyper', code: 'vyper' }
  if (filename.endsWith('.cairo')) return { label: 'Cairo', code: 'cairo' }
  if (filename.endsWith('.rs')) return { label: 'Rust', code: 'rust' }
  if (filename.endsWith('.move')) return { label: 'Move', code: 'move' }

  return { label: 'code', code: '' }
}

export const openContextualTooltip = (
  position: IPosition,
  editorRef: any,
  monacoRef: any,
  setTooltipData: (data: any) => void,
  trackMatomoEvent: (event: any) => void
) => {
  // Check if popover is disabled for this session
  if (isPopoverDisabled()) return

  if (!editorRef.current) return
  const model = editorRef.current.getModel()
  if (!model) return

  // Check if there's selected text first
  const selection = editorRef.current.getSelection()
  const selectedText = selection && !selection.isEmpty()
    ? model.getValueInRange(selection)
    : null

  // Only proceed if user has selected text
  if (!selectedText || selectedText.trim().length === 0) return

  const selectedExpression = selectedText.trim()
  let contextLines = ''

  // Check if it's a single word selection (no spaces, newlines, or special chars except dots)
  const isSingleWord = /^[a-zA-Z0-9_.]+$/.test(selectedExpression) && !selectedExpression.includes('\n')

  if (isSingleWord) {
    // For single word selection, include nearby context lines for better analysis
    const selectionStartLine = selection.getStartPosition().lineNumber
    const lineContent = model.getLineContent(selectionStartLine)
    const lineAbove = selectionStartLine > 1
      ? model.getLineContent(selectionStartLine - 1)
      : ''
    const lineBelow = selectionStartLine < model.getLineCount()
      ? model.getLineContent(selectionStartLine + 1)
      : ''

    contextLines = `${lineAbove ? `Line above: ${lineAbove}\n` : ''}Current line: ${lineContent}\n${lineBelow ? `Line below: ${lineBelow}` : ''}`
  }
  // else: multi-word/multi-line selection - no context needed, analyze the selection directly

  // Get screen position for tooltip at the center of the selection
  const editorElement = editorRef.current.getDomNode()
  const editorRect = editorElement?.getBoundingClientRect()

  if (editorRect && monacoRef.current) {
    const lineHeight = editorRef.current.getOption(monacoRef.current.editor.EditorOption.lineHeight)
    const selectionStartPos = selection.getStartPosition()
    const selectionEndPos = selection.getEndPosition()
    const startColumn = (selectionStartPos.column + selectionEndPos.column) / 2
    const startLine = selectionStartPos.lineNumber

    const x = editorRect.left + (startColumn - 1) * 8
    const y = editorRect.top + (startLine - 1) * lineHeight + lineHeight

    setTooltipData({
      keyword: selectedExpression,
      position: { x, y },
      contextLines: contextLines || undefined,
      isSelectedText: true
    })

    // Track popup appearance
    trackMatomoEvent({
      category: 'ai',
      action: 'remixAI',
      name: isSingleWord ? 'contextual_popup_single_word_shown' : 'contextual_popup_multi_word_shown',
      isClick: false,
      value: selectedExpression
    })
  }
}

export const TooltipPopOver: React.FC<TooltipPopOverProps> = ({
  keyword,
  position,
  onClose,
  onClearSelection,
  visible,
  plugin,
  contextLines,
  isSelectedText = false
}) => {
  //@ts-ignore
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends AIEvent = AIEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const popRef = useRef<HTMLDivElement>(null)
  const [adjustedPosition, setAdjustedPosition] = useState(position)
  const [data, setData] = useState<KeywordData | null>(null)
  const [loading, setLoading] = useState(true)
  const risk = data ? RISK_CONFIG[data.risk] : null

  // Fetch keyword data from remixAI
  useEffect(() => {
    if (!visible || !plugin || !keyword) return
    const fetchKeywordInfo = async () => {
      setLoading(true)
      try {
        // Get current file to determine language context
        const currentFile = await plugin.call('fileManager', 'getCurrentFile')
        const isSolidityFile = currentFile?.endsWith('.sol')
        const { label: fileLanguage } = getLanguageFromFilename(currentFile)

        // Determine if we have context (single word selection) or not (multi-word selection)
        const hasContext = contextLines && contextLines.length > 0

        const prompt = isSelectedText && !hasContext
          ? // Multi-word/multi-line selection - analyze the code snippet directly
          isSolidityFile
            ? `Analyze this Web3/Solidity code snippet:

${keyword}

Return a JSON response with the following structure:
{
  "title": "Code Analysis",
  "body": "Brief explanation of what this code does and any security implications",
  "risk": "high|medium|low",
  "riskLabel": "Short risk description"
}

Focus on security implications and provide practical guidance for smart contract developers. The body should contain max 50 words.`
            : `Analyze this ${fileLanguage} code snippet:

${keyword}

Return a JSON response with the following structure:
{
  "title": "Code Analysis",
  "body": "Brief explanation of what this code does and any potential issues or best practices",
  "risk": "high|medium|low",
  "riskLabel": "Short risk description"
}

Focus on code quality, potential issues, and best practices for ${fileLanguage}. The body should contain max 50 words.`
          : // Single word selection - analyze with context lines
          isSolidityFile
            ? `Analyze this Web3/Solidity code snippet focusing on the keyword "${keyword}":

${contextLines}

Return a JSON response with the following structure:
{
  "title": "Code Analysis",
  "body": "Brief explanation of what "${keyword}" does and any security implications in this context",
  "risk": "high|medium|low",
  "riskLabel": "Short risk description"
}

Focus on security implications and provide practical guidance for smart contract developers. The body should contain max 40 words. Consider the surrounding code context.`
            : `Analyze this ${fileLanguage} code snippet focusing on the keyword "${keyword}":

${contextLines}

Return a JSON response with the following structure:
{
  "title": "Code Analysis",
  "body": "Brief explanation of what "${keyword}" does and any potential issues in this context",
  "risk": "high|medium|low",
  "riskLabel": "Short risk description"
}

Focus on code quality, potential issues, and best practices for ${fileLanguage}. The body should contain max 40 words. Consider the surrounding code context.`
        const response = await plugin.call('remixAI', 'basic_prompt', prompt)

        // Parse the JSON response
        let parsedData: KeywordData
        try {
          // Try to extract JSON from the response
          const jsonMatch = response.result.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            parsedData = JSON.parse(jsonMatch[0])
          } else {
            // Fallback if no JSON found
            parsedData = {
              title: 'Code Analysis',
              body: response || `Information about ${keyword}`,
              risk: 'medium' as const,
              riskLabel: 'Review needed'
            }
          }
        } catch (parseError) {
          // Fallback for parsing errors
          parsedData = {
            title: 'Code Analysis',
            body: response || `Information about ${keyword}`,
            risk: 'medium' as const,
            riskLabel: 'Review needed'
          }
        }

        setData(parsedData)
      } catch (error) {
        console.error('Failed to fetch keyword info:', error)
        // Fallback data
        setData({
          title: 'Code Analysis',
          body: `Unable to fetch information about ${keyword}`,
          risk: 'medium' as const,
          riskLabel: 'Unknown'
        })
      } finally {
        setLoading(false)
      }
    }

    fetchKeywordInfo()
  }, [keyword, visible, plugin, contextLines, isSelectedText])

  // Position adjustment effect
  useEffect(() => {
    if (!popRef.current || !visible) return

    const popup = popRef.current
    const rect = popup.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let { x, y } = position
    const margin = 10

    // Adjust horizontal position if popup would overflow
    if (x + rect.width > viewportWidth - margin) {
      x = viewportWidth - rect.width - margin
    }
    if (x < margin) {
      x = margin
    }

    // Adjust vertical position if popup would overflow
    // Position above the cursor to avoid mouse leave issues
    y = position.y - rect.height - 10 // Position above cursor with small offset

    // If positioning above would go off screen, position below but closer to cursor
    if (y < margin) {
      y = position.y + 25 // Position closer below cursor
    }
    setAdjustedPosition({ x, y })
  }, [position, visible, data])

  // Add click outside listener for selected text tooltips
  useEffect(() => {
    if (!visible || !isSelectedText) return

    const handleClickOutside = (event: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    // Add delay to avoid immediate closing when tooltip appears
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 200)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [visible, isSelectedText, onClose])

  if (!visible) return null

  return (
    <div
      ref={popRef}
      className="web3-tooltip-popup"
      style={{
        position: 'fixed',
        top: adjustedPosition.y,
        left: adjustedPosition.x,
        zIndex: 10000,
        pointerEvents: 'auto', // Enable pointer events for button interactions
      }}
      onMouseLeave={() => {
        // For selected text, don't close automatically on mouse leave
        // User needs to click elsewhere or press Escape to close
        if (!isSelectedText) {
          setTimeout(() => {
            onClose()
          }, 100)
        }
      }}
    >
      <div className="web3-tooltip-inner" style={{ position: 'relative' }}>
        {loading ? (
          <div className="d-flex align-items-center gap-2">
            <div className="spinner-border spinner-border-sm" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <span style={{ fontSize: "0.8rem" }}>
                Analyzing <b>"{isSelectedText && keyword.length > 20
                ? `${keyword.substring(0, 20)}...`
                : keyword
              }"</b>
            </span>
          </div>
        ) : data ? (
          <>
            {/* Close button - only shown when data is loaded */}
            <button
              className="web3-tooltip-close"
              onClick={(e) => {
                e.stopPropagation()
                onClose()
              }}
            >
              <i className="fas fa-times"></i>
            </button>
            <div className="mb-2" style={{ paddingRight: '16px' }}>
              <div className="d-flex align-items-center justify-content-between">
                <code className="web3-tooltip-title" style={{
                  maxWidth: isSelectedText ? '200px' : 'auto',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {isSelectedText && data.title && data.title.length > 30
                    ? `${data.title.substring(0, 30)}...`
                    : data.title
                  }
                </code>
              </div>
              {risk && data.riskLabel && (
                <div className="mt-1">
                  <span className={`badge bg-${risk.badge} d-flex align-items-center gap-1`}
                    style={{ fontSize: "0.65rem", fontWeight: 600, width: 'fit-content' }}>
                    <i className={`${risk.icon}`} style={{ fontSize: "0.6rem" }}></i>
                    {data.riskLabel}
                  </span>
                </div>
              )}
            </div>
            <p className="web3-tooltip-body mb-2">{data.body}</p>
            <div className="d-flex flex-column gap-2">
              <button
                className="btn btn-link p-0 text-start"
                style={{
                  fontSize: "0.7rem",
                  color: "var(--bs-primary)",
                  textDecoration: "none",
                  pointerEvents: "auto" // Enable pointer events for this button
                }}
                onClick={async (e) => {
                  e.stopPropagation()
                  if (plugin && data) {
                    try {
                      // Track button click
                      trackMatomoEvent({
                        category: 'ai',
                        action: 'remixAI',
                        name: 'contextual_popup_open_remixai_clicked',
                        isClick: true,
                        value: keyword
                      })

                      // Get current file to determine language
                      const currentFile = await plugin.call('fileManager', 'getCurrentFile')
                      const isSolidityFile = currentFile?.endsWith('.sol')
                      const { label: languageLabel, code: language } = getLanguageFromFilename(currentFile)

                      // Use contextLines if available (single word selection), otherwise use keyword (multi-word selection)
                      const codeToAnalyze = contextLines || keyword
                      const analysisContext = contextLines
                        ? `focusing on the keyword "${keyword}"`
                        : ''

                      const deeperPrompt = isSolidityFile
                        ? `Analyse this code snippet ${analysisContext} for security implications, and its safer use in smart contract development. If applicable, provide best practices and common pitfalls to avoid.

\`\`\`solidity
${codeToAnalyze}
\`\`\``
                        : `Analyse this ${languageLabel} code snippet ${analysisContext} for potential issues, best practices, and code quality improvements. If applicable, highlight any security concerns or common pitfalls to avoid.

\`\`\`${language}
${codeToAnalyze}
\`\`\``

                      // Clear the selection in the editor to prevent popover from re-appearing
                      if (onClearSelection) {
                        onClearSelection()
                      }

                      await plugin.call('manager', 'activatePlugin', 'remixaiassistant')
                      await plugin.call('menuicons', 'select', 'remixaiassistant')
                      await plugin.call('remixaiassistant', 'newConversation')

                      // Small delay to ensure panel is open
                      setTimeout(async () => {
                        // Call RemixAI with editor code analysis flag
                        await plugin.call('remixaiassistant', 'chatPipe', deeperPrompt, true)
                      }, 500)

                      // Close the tooltip
                      onClose()
                    } catch (error) {
                      console.error('Failed to open RemixAI:', error)
                    }
                  }
                }}
              >
                <i className="fas fa-external-link-alt me-1" style={{ fontSize: "0.65rem" }}></i>
                  Open in RemixAI
              </button>
              <button
                className="btn btn-link p-0 text-start"
                style={{
                  fontSize: "0.65rem",
                  color: "var(--bs-body-color)",
                  textDecoration: "none",
                  pointerEvents: "auto",
                  opacity: 0.7
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  // Track button click
                  trackMatomoEvent({
                    category: 'ai',
                    action: 'remixAI',
                    name: 'contextual_popup_hide_for_session_clicked',
                    isClick: true,
                    value: keyword
                  })
                  // Disable popover for this session
                  disablePopoverForSession()
                  // Close the tooltip
                  onClose()
                }}
              >
                <i className="fas fa-eye-slash me-1" style={{ fontSize: "0.6rem" }}></i>
                  Do not show analysis for this session
              </button>
            </div>
          </>
        ) : (
          <div style={{ fontSize: "0.8rem", color: "var(--bs-secondary)" }}>
              Failed to load information for {keyword}
          </div>
        )}
      </div>
    </div>
  )
}