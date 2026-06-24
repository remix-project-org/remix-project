import React, { useState, useRef, useEffect, useContext } from 'react'
import { AIEvent } from '@remix-api'
import type { IPosition } from 'monaco-editor'
//@ts-ignore
import { TrackingContext } from '@remix-ide/tracking'

// Risk configuration for code analysis badges
const RISK_CONFIG = {
  critical: { badge: "danger", icon: "fas fa-shield-virus", label: "Critical Security Issue" },
  high: { badge: "danger", icon: "fas fa-exclamation-triangle", label: "High Risk" },
  medium: { badge: "warning", icon: "fas fa-exclamation-circle", label: "Medium Risk" },
  low: { badge: "info", icon: "fas fa-info-circle", label: "Low Risk" },
  info: { badge: "secondary", icon: "fas fa-lightbulb", label: "Best Practice" },
  performance: { badge: "primary", icon: "fas fa-bolt", label: "Performance" }
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
  risk: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'performance'
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

// ===== RESPONSE CACHING IMPLEMENTATION =====

interface CacheEntry {
  data: KeywordData
  timestamp: number
  accessCount: number
  lastAccessed: number
}

interface CacheStats {
  hits: number
  misses: number
  size: number
  evictions: number
}

// In-memory cache for analysis results
const analysisCache = new Map<string, CacheEntry>()

// Cache configuration
const CACHE_CONFIG = {
  MAX_SIZE: 100, // Maximum number of cached entries
  MAX_AGE_MS: 30 * 60 * 1000, // 30 minutes cache TTL
  CLEANUP_INTERVAL: 5 * 60 * 1000 // Clean up stale entries every 5 minutes
}

// Cache statistics
const cacheStats: CacheStats = {
  hits: 0,
  misses: 0,
  size: 0,
  evictions: 0
}

/**
 * Generate a unique cache key based on keyword, context, and file type
 * Case-sensitive to distinguish between different code elements (e.g., Transfer vs transfer)
 */
const getCacheKey = (keyword: string, contextLines: string | undefined, fileType: string): string => {
  const normalizedKeyword = keyword.trim()
  const normalizedContext = contextLines?.trim() || ''
  // Create a hash-like key to keep it concise
  return `${fileType}::${normalizedKeyword}::${normalizedContext}`
}

/**
 * Get cached analysis result if available and not expired
 */
const getCachedAnalysis = (cacheKey: string): KeywordData | null => {
  const entry = analysisCache.get(cacheKey)

  if (!entry) {
    cacheStats.misses++
    return null
  }

  // Check if entry has expired
  const now = Date.now()
  const age = now - entry.timestamp

  if (age > CACHE_CONFIG.MAX_AGE_MS) {
    // Entry expired, remove it
    analysisCache.delete(cacheKey)
    cacheStats.misses++
    cacheStats.evictions++
    cacheStats.size = analysisCache.size
    return null
  }

  // Update access metadata
  entry.accessCount++
  entry.lastAccessed = now

  cacheStats.hits++
  return entry.data
}

/**
 * Store analysis result in cache with LRU eviction if needed
 */
const setCachedAnalysis = (cacheKey: string, data: KeywordData): void => {
  // Check if we need to evict entries (LRU-based)
  if (analysisCache.size >= CACHE_CONFIG.MAX_SIZE && !analysisCache.has(cacheKey)) {
    // Find least recently used entry
    let lruKey: string | null = null
    let lruTime = Infinity

    for (const [key, entry] of analysisCache.entries()) {
      if (entry.lastAccessed < lruTime) {
        lruTime = entry.lastAccessed
        lruKey = key
      }
    }

    if (lruKey) {
      analysisCache.delete(lruKey)
      cacheStats.evictions++
    }
  }

  // Store new entry
  const now = Date.now()
  analysisCache.set(cacheKey, {
    data,
    timestamp: now,
    lastAccessed: now,
    accessCount: 1
  })

  cacheStats.size = analysisCache.size
}

/**
 * Periodic cleanup of expired cache entries
 */
let cleanupInterval: NodeJS.Timeout | null = null

const startCacheCleanup = () => {
  if (cleanupInterval) return // Already running

  cleanupInterval = setInterval(() => {
    const now = Date.now()
    let removedCount = 0

    for (const [key, entry] of analysisCache.entries()) {
      const age = now - entry.timestamp
      if (age > CACHE_CONFIG.MAX_AGE_MS) {
        analysisCache.delete(key)
        removedCount++
      }
    }

    if (removedCount > 0) {
      cacheStats.evictions += removedCount
      cacheStats.size = analysisCache.size
    }
  }, CACHE_CONFIG.CLEANUP_INTERVAL)
}

// Start cleanup on module load
startCacheCleanup()

// Stop cleanup on page unload (good practice)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (cleanupInterval) {
      clearInterval(cleanupInterval)
      cleanupInterval = null
    }
  })
}

// ===== END RESPONSE CACHING IMPLEMENTATION =====

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

export const openContextualTooltip = async (
  position: IPosition,
  editorRef: any,
  monacoRef: any,
  setTooltipData: (data: any) => void,
  trackMatomoEvent: (event: any) => void,
  plugin?: any
) => {
  // Check if popover is disabled for this session
  if (isPopoverDisabled()) return

  // Check if popover is disabled in settings (persistent)
  if (plugin) {
    try {
      const isEnabled = await plugin.call('settings', 'get', 'settings/editor/code-analysis-popover')
      // Default to true if undefined, but respect explicit false
      const shouldShow = isEnabled !== false
      if (!shouldShow) {
        console.log('[CodeAnalysisPopover] Disabled in settings, not showing popover')
        return
      }
    } catch (error) {
      // If there's an error reading the setting, default to showing the popover
      console.warn('Failed to read code analysis popover setting:', error)
    }
  }

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
    const selectionEndPos = selection.getEndPosition()

    // Use Monaco's getScrolledVisiblePosition to get accurate screen coordinates
    // This accounts for scrolling and gives us the exact position
    const positionToUse = {
      lineNumber: selectionEndPos.lineNumber,
      column: selectionEndPos.column
    }

    const coordinates = editorRef.current.getScrolledVisiblePosition(positionToUse)

    // If coordinates are not available (e.g., position is scrolled out of view),
    // don't show tooltip
    if (!coordinates) {
      return
    }

    const x = editorRect.left + coordinates.left
    const y = editorRect.top + coordinates.top

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
  const [fromCache, setFromCache] = useState(false)
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

        // Generate cache key
        const cacheKey = getCacheKey(keyword, contextLines, fileLanguage)

        // Check cache first
        const cachedResult = getCachedAnalysis(cacheKey)
        if (cachedResult) {
          setData(cachedResult)
          setFromCache(true)
          setLoading(false)
          return
        }

        setFromCache(false)

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
  "risk": "critical|high|medium|low|info|performance",
  "riskLabel": "Short risk description"
}

Choose risk level based on severity: critical for security vulnerabilities, high for dangerous patterns, medium for warnings, low for minor issues, info for best practices, performance for gas optimization.

Focus on security implications and provide practical guidance for smart contract developers. The body should contain max 50 words.`
            : `Analyze this ${fileLanguage} code snippet:

${keyword}

Return a JSON response with the following structure:
{
  "title": "Code Analysis",
  "body": "Brief explanation of what this code does and any potential issues or best practices",
  "risk": "critical|high|medium|low|info|performance",
  "riskLabel": "Short risk description"
}

Choose risk level based on severity: critical for major bugs/security, high for dangerous patterns, medium for warnings, low for minor issues, info for tips, performance for optimization.

Focus on code quality, potential issues, and best practices for ${fileLanguage}. The body should contain max 50 words.`
          : // Single word selection - analyze with context lines
          isSolidityFile
            ? `Analyze this Web3/Solidity code snippet focusing on the keyword "${keyword}":

${contextLines}

Return a JSON response with the following structure:
{
  "title": "Code Analysis",
  "body": "Brief explanation of what "${keyword}" does and any security implications in this context",
  "risk": "critical|high|medium|low|info|performance",
  "riskLabel": "Short risk description"
}

Choose risk level based on severity: critical for security vulnerabilities, high for dangerous patterns, medium for warnings, low for minor issues, info for best practices, performance for gas optimization.

Focus on security implications and provide practical guidance for smart contract developers. The body should contain max 40 words. Consider the surrounding code context.`
            : `Analyze this ${fileLanguage} code snippet focusing on the keyword "${keyword}":

${contextLines}

Return a JSON response with the following structure:
{
  "title": "Code Analysis",
  "body": "Brief explanation of what "${keyword}" does and any potential issues in this context",
  "risk": "critical|high|medium|low|info|performance",
  "riskLabel": "Short risk description"
}

Choose risk level based on severity: critical for major bugs/security, high for dangerous patterns, medium for warnings, low for minor issues, info for tips, performance for optimization.

Focus on code quality, potential issues, and best practices for ${fileLanguage}. The body should contain max 40 words. Consider the surrounding code context.`

        // Wrap API call with timeout to detect if AI is busy
        const apiCallPromise = plugin.call('remixAI', 'basic_prompt', prompt)
        const busyTimeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('AI_BUSY')), 5000) // 5 second timeout to detect busy state
        })

        let response
        try {
          response = await Promise.race([apiCallPromise, busyTimeoutPromise])
        } catch (error: any) {
          if (error?.message === 'AI_BUSY') {
            // API is taking too long, likely processing another request
            setFromCache(false)
            setData({
              title: 'RemixAI Assistant Busy',
              body: 'The RemixAI assistant is currently processing another request. Please try again once it becomes available.',
              risk: 'low' as const,
              riskLabel: 'Busy'
            })
            setLoading(false)
            return
          }
          throw error // Re-throw other errors
        }

        // Parse the JSON response
        let parsedData: KeywordData
        try {
          let jsonStr = response.result || response
          const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            jsonStr = jsonMatch[0]
          }

          parsedData = JSON.parse(jsonStr)
          if (!parsedData.title || !parsedData.body || !parsedData.risk || !parsedData.riskLabel) {
            throw new Error('Missing required fields in response')
          }
        } catch (parseError) {
          parsedData = {
            title: 'Code Analysis',
            body: `Unable to parse analysis for ${keyword}`,
            risk: 'medium' as const,
            riskLabel: 'Review needed'
          }
        }

        // Cache the successful result
        setCachedAnalysis(cacheKey, parsedData)
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
              <div className="d-flex align-items-center">
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
                {fromCache && (
                  <span
                    title="Loaded from cache"
                    style={{
                      fontSize: '0.7rem',
                      opacity: 0.6,
                      marginLeft: '6px',
                      color: 'var(--bs-warning)'
                    }}
                  >
                    <i className="fas fa-bolt"></i>
                  </span>
                )}
              </div>
              {risk && data.riskLabel && (
                <div className="mt-1">
                  <span className={`badge bg-${risk.badge} d-flex align-items-start gap-1`}
                    style={{
                      fontSize: "0.65rem",
                      fontWeight: 600,
                      width: 'fit-content',
                      maxWidth: '100%',
                      whiteSpace: 'normal',
                      wordBreak: 'break-word'
                    }}>
                    <i className={`${risk.icon}`} style={{ fontSize: "0.6rem", flexShrink: 0, marginTop: '1px' }}></i>
                    <span>
                      {data.riskLabel}
                    </span>
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
                  Open in RemixAI Assistant
              </button>
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
                  if (plugin) {
                    try {
                      // Track button click
                      trackMatomoEvent({
                        category: 'ai',
                        action: 'remixAI',
                        name: 'contextual_popup_analyze_complete_file_clicked',
                        isClick: true,
                        value: keyword
                      })

                      // Get current file to determine language
                      const currentFile = await plugin.call('fileManager', 'getCurrentFile')
                      if (!currentFile) {
                        console.error('No file is currently open')
                        return
                      }

                      // Read the entire file content
                      const fileContent = await plugin.call('fileManager', 'readFile', currentFile)
                      const isSolidityFile = currentFile.endsWith('.sol')
                      const { label: languageLabel, code: language } = getLanguageFromFilename(currentFile)

                      // Extract filename from path for display
                      const fileName = currentFile.split('/').pop() || currentFile

                      const wholeFilePrompt = isSolidityFile
                        ? `Analyse this complete Solidity smart contract file for security implications, best practices, and potential vulnerabilities. Provide a comprehensive review covering:
- Security issues and vulnerabilities
- Gas optimization opportunities
- Code quality and maintainability
- Best practices and recommendations

File: ${fileName}

\`\`\`solidity
${fileContent}
\`\`\``
                        : `Analyse this complete ${languageLabel} file for potential issues, best practices, and code quality improvements. Provide a comprehensive review covering:
- Potential bugs and issues
- Code quality and maintainability
- Performance considerations
- Best practices and recommendations

File: ${fileName}

\`\`\`${language}
${fileContent}
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
                        await plugin.call('remixaiassistant', 'chatPipe', wholeFilePrompt, true)
                      }, 500)

                      // Close the tooltip
                      onClose()
                    } catch (error) {
                      console.error('Failed to analyze whole file:', error)
                    }
                  }
                }}
              >
                <i className="fas fa-file-code me-1" style={{ fontSize: "0.65rem" }}></i>
                  Analyze complete file
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