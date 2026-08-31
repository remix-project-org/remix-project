import React, { useState, useEffect, useRef, useCallback } from 'react'
import { trackMatomoEvent } from '@remix-api'
import {
  enumerateSelectableChecklistPaths,
  buildAuditTaxonomy,
  AuditMatch,
  AuditMatchResult
} from '@remix/remix-ai-core/audit-taxonomy'
import './remix-ui-checklist-explorer-modal.css'

interface ChecklistItem {
  id: string
  question: string
  description: string
  remediation?: string
  references?: string[]
  tags?: string[]
}

interface ChecklistCategory {
  category: string
  description: string
  data: (ChecklistItem | ChecklistCategory)[]
}

interface ChecklistData {
  category: string
  description: string
  data: (ChecklistItem | ChecklistCategory)[]
}

export interface RemixUiChecklistExplorerModalProps {
  isOpen: boolean
  onClose: () => void
  plugin?: any // Plugin instance to access fileManager
}

// Helper function to check if an item is a ChecklistItem or ChecklistCategory
const isChecklistItem = (item: ChecklistItem | ChecklistCategory): item is ChecklistItem => {
  return 'id' in item && 'question' in item
}

// Helper function to recursively collect all checklist items from nested categories
const collectChecklistItems = (data: (ChecklistItem | ChecklistCategory)[]): ChecklistItem[] => {
  const items: ChecklistItem[] = []

  for (const item of data) {
    if (isChecklistItem(item)) {
      items.push(item)
    } else {
      // It's a category, recurse into its data
      items.push(...collectChecklistItems(item.data))
    }
  }

  return items
}

// Helper function to count total items in a category (including nested)
const countTotalItems = (data: (ChecklistItem | ChecklistCategory)[]): number => {
  return collectChecklistItems(data).length
}

const categoryFileToken = (categoryPath: string): string => {
  const raw = categoryPath.includes('::') ? categoryPath.split('::').join('-') : categoryPath
  return raw
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

const computeLoadedCategories = (data: ChecklistData[], files: string[]): Set<string> => {
  const haystack = files.join('\n')
  const loaded = new Set<string>()
  enumerateSelectableChecklistPaths(data).forEach(path => {
    const token = categoryFileToken(path)
    if (token && haystack.includes(token)) loaded.add(path)
  })
  return loaded
}

export function RemixUiChecklistExplorerModal(props: RemixUiChecklistExplorerModalProps) {
  const { isOpen, onClose, plugin } = props
  const [checklistData, setChecklistData] = useState<ChecklistData[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [loadedCategories, setLoadedCategories] = useState<Set<string>>(new Set())
  const [wizardStep, setWizardStep] = useState<'browse' | 'confirm' | 'saving'>('browse')
  const [saving, setSaving] = useState<boolean>(false)
  // AI match. `aiMatchedPaths` is a provenance overlay on selectedCategories,
  // which stays the single source of truth so the whole save path is untouched.
  const [matching, setMatching] = useState<boolean>(false)
  const [matchSlow, setMatchSlow] = useState<boolean>(false)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [aiMatchedPaths, setAiMatchedPaths] = useState<Map<string, AuditMatch>>(new Map())
  const [matchSummary, setMatchSummary] = useState<{ file: string; count: number; discarded: number; skippedReason?: string } | null>(null)
  const [solCandidates, setSolCandidates] = useState<string[]>([])
  const [matchTarget, setMatchTarget] = useState<string>('')
  const [contractNamesByFile, setContractNamesByFile] = useState<Record<string, string[]>>({})
  const containerRef = useRef<HTMLDivElement>(null)
  const matchRunId = useRef(0)

  const fetchChecklistData = async (): Promise<ChecklistData[]> => {
    const response = await fetch('https://raw.githubusercontent.com/Cyfrin/audit-checklist/main/checklist.json')
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    if (!Array.isArray(data)) {
      throw new Error('Invalid checklist format - expected array')
    }
    return data
  }

  const ensureDirectoryExists = async (dirPath: string) => {
    try {
      await plugin.call('fileManager', 'mkdir', dirPath)
    } catch (e) {
      // Directory may already exist
    }
  }

  /**
   * Solidity files worth matching against, best first. Resolved once when the
   * modal opens — no polling: the modal can be opened from the home tab or a
   * slash command with nothing in focus, so we look progressively wider.
   *
   */
  const resolveSolCandidates = async (): Promise<{ candidates: string[]; namesByFile: Record<string, string[]> }> => {
    if (!plugin) return { candidates: [], namesByFile: {} }
    const ordered: string[] = []
    const push = (file?: string) => {
      if (typeof file === 'string' && file.endsWith('.sol') && !ordered.includes(file)) ordered.push(file)
    }

    try { push(await plugin.call('fileManager', 'getCurrentFile')) } catch (e) { /* nothing in focus */ }
    try { Object.keys(await plugin.call('fileManager', 'getOpenedFiles') || {}).forEach(push) } catch (e) { /* none open */ }

    // Compilation pass: order files by how many deployable contracts they hold,
    // and remember each file's contract names for the prompt. Keyed by file
    // because the user can switch target in the picker after this runs.
    const namesByFile: Record<string, string[]> = {}
    try {
      const result = await plugin.call('solidity', 'getCompilationResult')
      const contracts = result?.data?.contracts || {}
      const deployableFor = (file: string): string[] => {
        const ast = result?.data?.sources?.[file]?.ast
        const definitions = ast?.nodes?.filter((node: any) => node.nodeType === 'ContractDefinition') || []
        return Object.keys(contracts[file] || {}).filter(name => {
          const bytecode = contracts[file][name]?.evm?.bytecode?.object
          if (!bytecode || bytecode.length === 0) return false
          const definition = definitions.find((node: any) => node.name === name)
          if (definition?.contractKind === 'library' || definition?.abstract === true) return false
          return true
        })
      }
      const compiled = Object.keys(contracts).filter(f => f.endsWith('.sol'))
      compiled.forEach(file => { namesByFile[file] = deployableFor(file) })
      compiled
        .map(file => ({ file, deployable: namesByFile[file].length }))
        .sort((a, b) => b.deployable - a.deployable)
        .forEach(entry => push(entry.file))
    } catch (e) { /* never compiled, or the compiler plugin is inactive */ }

    if (ordered.length === 0) {
      try {
        const tree = await plugin.call('fileManager', 'copyFolderToJson', '/')
        // copyFolderToJson keys are already FULL paths (see fileProvider's
        // `json[curPath] = file`), so they must be used as-is — deriving a path
        // from the parent key produced `contracts/contracts/Foo.sol`.
        const skip = /^(\.|node_modules$|tests?$|scripts?$)/
        const walk = (node: any) => {
          if (ordered.length >= 50) return
          Object.keys(node || {}).forEach(fullPath => {
            const child = node[fullPath]
            if (skip.test(fullPath.split('/').pop() ?? '')) return
            if (child?.content !== undefined) push(fullPath)
            else if (child?.children) walk(child.children)
          })
        }
        walk(tree)
      } catch (e) { /* workspace unreadable — the button stays disabled */ }
    }

    return { candidates: ordered.slice(0, 50), namesByFile }
  }

  /**
   * Ask the model which categories apply, then merge the answer into the
   * existing selection. Never throws out of here: every failure becomes in-band
   * state so the list stays usable and manual selection still works.
   */
  const handleAiMatch = useCallback(async () => {
    if (!plugin || !matchTarget || matching) return
    const runId = ++matchRunId.current
    setMatching(true)
    setMatchSlow(false)
    setMatchError(null)
    trackMatomoEvent(plugin, { category: 'ai', action: 'remixAI', name: 'audit_ai_match_click', isClick: true })

    const slowTimer = setTimeout(() => { if (matchRunId.current === runId) setMatchSlow(true) }, 10000)
    try {
      const source = await plugin.call('fileManager', 'getFile', matchTarget)
      if (!source || !source.trim()) throw new Error('That file is empty.')
      const { ContractSkeletonExtractor } = await import('@remix/remix-ai-core')
      const skeleton = ContractSkeletonExtractor.skeletonToString(ContractSkeletonExtractor.extractSkeleton(source))

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('AI_MATCH_TIMEOUT')), 60000)
      )
      const result: AuditMatchResult | null = await Promise.race([
        plugin.call('remixAI', 'audit_category_match', {
          contract: { path: matchTarget, skeleton, contractNames: contractNamesByFile[matchTarget] ?? []},
          taxonomy: buildAuditTaxonomy(checklistData as any),
          maxMatches: 12
        }),
        timeout
      ])
      if (matchRunId.current !== runId) return
      if (!result) {
        setMatchError('AI match needs a signed-in account with the AI Auditor feature.')
        return
      }

      const matched = new Map(result.matches.map(m => [m.path, m]))
      setSelectedCategories(prev => {
        const next = new Set(prev)
        // Supersede the previous run's untouched picks, then union the new ones.
        aiMatchedPaths.forEach((_, path) => { if (!matched.has(path)) next.delete(path) })
        matched.forEach((_, path) => next.add(path))
        return next
      })
      setAiMatchedPaths(matched)
      setMatchSummary({
        file: matchTarget,
        count: matched.size,
        discarded: result.discarded.length,
        skippedReason: result.skippedReason
      })
      trackMatomoEvent(plugin, {
        category: 'ai',
        action: 'remixAI',
        name: matched.size === 0
          ? 'audit_ai_match_no_usable'
          : `audit_ai_match_${result.source}_${matched.size}`,
        isClick: false
      })
    } catch (err: any) {
      if (matchRunId.current !== runId) return
      setMatchError(
        err?.message === 'AI_MATCH_TIMEOUT'
          ? 'AI match timed out. The assistant may be busy — try again.'
          : err?.aiError?.message ?? err?.message ?? 'AI match failed.'
      )
      trackMatomoEvent(plugin, { category: 'ai', action: 'remixAI', name: 'audit_ai_match_error', isClick: false })
    } finally {
      clearTimeout(slowTimer)
      if (matchRunId.current === runId) {
        setMatching(false)
        setMatchSlow(false)
      }
    }
  }, [plugin, matchTarget, matching, contractNamesByFile, checklistData, aiMatchedPaths])

  /** Deselect only the AI's picks; anything hand-toggled is already untracked. */
  const clearAiMatch = () => {
    setSelectedCategories(prev => {
      const next = new Set(prev)
      aiMatchedPaths.forEach((_, path) => next.delete(path))
      return next
    })
    setAiMatchedPaths(new Map())
    setMatchSummary(null)
    setMatchError(null)
    trackMatomoEvent(plugin, { category: 'ai', action: 'remixAI', name: 'audit_ai_match_cleared', isClick: true })
  }

  const fetchExistingChecklistFiles = async (): Promise<string[]> => {
    if (!plugin) return []
    try {
      const entries = await plugin.call('fileManager', 'readdir', 'audits')
      return Object.keys(entries || {})
    } catch (e) {
      return []
    }
  }

  // Clear the AI spinner if the user cancels the request from the assistant.
  useEffect(() => {
    if (!isOpen || !plugin) return
    const onCancelled = () => {
      matchRunId.current++
      setMatching(false)
      setMatchSlow(false)
      setMatchError('The AI request was cancelled.')
    }
    plugin.on('remixAI', 'requestCancelled', onCancelled)
    return () => { try { plugin.off('remixAI', 'requestCancelled', onCancelled) } catch (e) { /* already torn down */ } }
  }, [isOpen, plugin])

  useEffect(() => {
    if (isOpen) {
      setWizardStep('browse')
      setSelectedCategories(new Set())
      setExpandedCategories(new Set())
      setLoadedCategories(new Set())
      setSearchTerm('')
      setError(null)
      matchRunId.current++
      setMatching(false)
      setMatchSlow(false)
      setMatchError(null)
      setAiMatchedPaths(new Map())
      setMatchSummary(null)

      resolveSolCandidates().then(({ candidates, namesByFile }) => {
        setSolCandidates(candidates)
        setMatchTarget(candidates[0] ?? '')
        setContractNamesByFile(namesByFile)
      }).catch(() => {
        setSolCandidates([])
        setMatchTarget('')
        setContractNamesByFile({})
      })

      const load = async () => {
        setLoading(true)
        try {
          const data = await fetchChecklistData()
          setChecklistData(data)
          // Highlight categories whose checklist is already saved in the workspace
          const existingFiles = await fetchExistingChecklistFiles()
          setLoadedCategories(computeLoadedCategories(data, existingFiles))
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load checklist')
        } finally {
          setLoading(false)
        }
      }
      load()
    }
  }, [isOpen])

  const toggleCategory = (categoryPath: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev)
      next.has(categoryPath) ? next.delete(categoryPath) : next.add(categoryPath)
      return next
    })
    // Once the user touches a row it is their pick, not the AI's: drop the
    // provenance so the badge disappears and a re-match won't supersede it.
    setAiMatchedPaths(prev => {
      if (!prev.has(categoryPath)) return prev
      const next = new Map(prev)
      next.delete(categoryPath)
      return next
    })
  }

  const toggleExpanded = (categoryPath: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      next.has(categoryPath) ? next.delete(categoryPath) : next.add(categoryPath)
      return next
    })
  }

  // Helper function to recursively generate markdown with nested categories
  const generateNestedMarkdown = (data: (ChecklistItem | ChecklistCategory)[], basePath: string = '', level: number = 4): string => {
    let markdown = ''
    let itemIndex = 1

    for (const item of data) {
      if (isChecklistItem(item)) {
        // It's a checklist item
        const headerLevel = '#'.repeat(level)
        markdown += `${headerLevel} ${itemIndex}. ${item.question}\n\n`
        markdown += `**Category Path:** ${basePath}\n\n`
        markdown += `**Description:** ${item.description}\n\n`

        if (item.remediation) {
          markdown += `**Remediation:** ${item.remediation}\n\n`
        }

        if (item.references && item.references.length > 0) {
          markdown += `**References:**\n`
          item.references.forEach(ref => {
            markdown += `- [${ref}](${ref})\n`
          })
          markdown += `\n`
        }

        markdown += `- [ ] **Status:** Not Checked\n`
        markdown += `- [ ] **Finding:** N/A\n`
        markdown += `- [ ] **Notes:** \n\n`
        markdown += `---\n\n`
        itemIndex++
      } else {
        // It's a nested category
        const headerLevel = '#'.repeat(level)
        const newPath = basePath ? `${basePath} → ${item.category}` : item.category

        markdown += `${headerLevel} ${item.category}\n\n`
        if (item.description) {
          markdown += `${item.description}\n\n`
        }

        // Recursively process nested data
        markdown += generateNestedMarkdown(item.data, newPath, level + 1)
      }
    }

    return markdown
  }

  const generateChecklistMarkdown = (): string => {
    const selectedData = checklistData.filter(mainCat => {
      // Check if main category is selected (for direct checklist items)
      if (selectedCategories.has(mainCat.category)) {
        return true
      }
      // Check if any sub-categories are selected (for nested structure)
      return mainCat.data.some(item => {
        if (!isChecklistItem(item)) {
          return selectedCategories.has(`${mainCat.category}::${item.category}`)
        }
        return false
      })
    })

    let markdown = `# Audit Checklist\n\n`
    markdown += `Generated on: ${new Date().toISOString().split('T')[0]}\n\n`

    selectedData.forEach(mainCategory => {
      markdown += `## ${mainCategory.category}\n\n`
      if (mainCategory.description) {
        markdown += `${mainCategory.description}\n\n`
      }

      // Check if this main category was directly selected (contains direct checklist items)
      if (selectedCategories.has(mainCategory.category)) {
        // Generate markdown for direct items in this category
        markdown += generateNestedMarkdown(mainCategory.data, mainCategory.category)
      } else {
        // Handle sub-categories
        const selectedSubCategories = mainCategory.data.filter(item =>
          !isChecklistItem(item) && selectedCategories.has(`${mainCategory.category}::${item.category}`)
        ) as ChecklistCategory[]

        selectedSubCategories.forEach(subCategory => {
          markdown += `### ${subCategory.category}\n\n`
          if (subCategory.description) {
            markdown += `${subCategory.description}\n\n`
          }

          // Generate nested markdown with proper category paths
          markdown += generateNestedMarkdown(subCategory.data, `${mainCategory.category} → ${subCategory.category}`)
        })
      }
    })

    return markdown
  }

  const handleLoadSelected = () => {
    if (selectedCategories.size === 0) return
    setWizardStep('confirm')
  }

  const handleConfirmChecklist = async () => {
    if (!plugin) {
      setError('Plugin not available')
      return
    }
    setWizardStep('saving')
    setSaving(true)

    try {
      await ensureDirectoryExists('audits')

      const timestamp = new Date().toISOString().split('T')[0]

      // Generate filename with selected categories
      const selectedCategoryNames = Array.from(selectedCategories).map(categoryPath => {
        if (categoryPath.includes('::')) {
          const [mainCat, subCat] = categoryPath.split('::')
          return `${mainCat}-${subCat}`
        } else {
          return categoryPath
        }
      }).join('_')

      // Clean the category names for filename (remove special characters and spaces)
      const cleanCategoryNames = selectedCategoryNames
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .substring(0, 100) // Limit length

      const filename = `audit-checklist-${cleanCategoryNames}-${timestamp}.md`
      const checklistContent = generateChecklistMarkdown()

      await plugin.call('fileManager', 'writeFile', `audits/${filename}`, checklistContent)

      // Post a summary into the chat so completion isn't silent — especially for
      // /load-audit-checklist, where nothing else is sent after the modal closes.
      try {
        let itemCount = 0
        const categoryLabels: string[] = []
        Array.from(selectedCategories).forEach(path => {
          if (path.includes('::')) {
            const [mainName, subName] = path.split('::')
            const main = checklistData.find(c => c.category === mainName)
            const sub = main?.data.find(i => !isChecklistItem(i) && (i as ChecklistCategory).category === subName) as ChecklistCategory | undefined
            if (sub) { itemCount += countTotalItems(sub.data); categoryLabels.push(subName) }
          } else {
            const main = checklistData.find(c => c.category === path)
            if (main) { itemCount += countTotalItems(main.data); categoryLabels.push(path) }
          }
        })
        const labelText = categoryLabels.join(', ') || 'selected'
        const summary = `Created \`audits/${filename}\` with the ${labelText} checklist (${itemCount} item${itemCount === 1 ? '' : 's'})`
        await plugin.call('remixaiassistant', 'handleExternalMessage', summary)
      } catch (e) {
        // assistant panel unavailable — the file is still created
      }

      setSaving(false)
      handleOk()
    } catch (err) {
      setSaving(false)
      setError(err instanceof Error ? err.message : 'Failed to save checklist')
      setWizardStep('confirm')
    }
  }

  const handleOk = () => {
    onClose()
    Promise.resolve(plugin?.call('remixaiassistant', 'submitChatInput')).catch(() => {
      // assistant plugin unavailable — modal is already closed
    })
  }

  const handleBack = () => {
    setWizardStep('browse')
    setError(null)
  }

  // Helper function to recursively filter data based on search term
  const filterData = (data: (ChecklistItem | ChecklistCategory)[], searchTerm: string): (ChecklistItem | ChecklistCategory)[] => {
    const filtered: (ChecklistItem | ChecklistCategory)[] = []

    for (const item of data) {
      if (isChecklistItem(item)) {
        // It's a checklist item, check if it matches the search
        if (
          item.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.description.toLowerCase().includes(searchTerm.toLowerCase())
        ) {
          filtered.push(item)
        }
      } else {
        // It's a category, check if it or its children match
        const filteredSubData = filterData(item.data, searchTerm)
        if (
          filteredSubData.length > 0 ||
          item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.description.toLowerCase().includes(searchTerm.toLowerCase())
        ) {
          filtered.push({
            ...item,
            data: filteredSubData
          })
        }
      }
    }

    return filtered
  }

  const filteredData = checklistData.map(mainCat => {
    const filteredSubData = filterData(mainCat.data, searchTerm)
    return {
      ...mainCat,
      data: filteredSubData
    }
  }).filter(mainCat =>
    mainCat.data.length > 0 ||
    mainCat.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    mainCat.description.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (!isOpen) return null

  const showBackButton = wizardStep !== 'browse'
  const isProcessing = saving

  return (
    <section data-id="checklist-explorer-modal-react" className="checklist-explorer-modal-background" style={{ zIndex: 8888 }}>
      <div ref={containerRef} className="checklist-explorer-modal-container border bg-dark p-2">

        {/* Header */}
        <div className="checklist-explorer-modal-close-container bg-dark mb-3 w-100 d-flex flex-row justify-content-between align-items-center">
          {showBackButton ? (
            <div className="d-flex flex-row gap-2 w-100 mx-1 my-2">
              <button className="btn" onClick={handleBack} disabled={isProcessing}>
                <i className="fa-solid fa-arrow-left"></i>
              </button>
              {wizardStep === 'confirm' && (
                <span className="text-body align-self-center">
                  Generate Audit Checklist
                </span>
              )}
              {wizardStep === 'saving' && (
                <span className="text-body align-self-center">Saving Checklist...</span>
              )}
            </div>
          ) : (
            <div className="d-flex flex-row gap-2 w-100 mx-3 my-2">
              <input
                type="text"
                data-id="checklist-explorer-search-input"
                placeholder="Search audit items..."
                className="form-control checklist-explorer-modal-search-input ps-5 fw-light"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {solCandidates.length > 0 && (
                <div className="ai-match-target align-self-center" style={{ width: '13rem' }}>
                  <select
                    data-id="checklist-explorer-ai-match-target"
                    className="form-select"
                    value={matchTarget}
                    onChange={(e) => setMatchTarget(e.target.value)}
                    disabled={matching}
                    title="Which contract to match against"
                    aria-label="Contract to match against"
                  >
                    {solCandidates.map(file => (
                      <option key={file} value={file} title={file}>{file.split('/').pop()}</option>
                    ))}
                  </select>
                  <i className="fa-solid fa-caret-down ai-match-target-caret" aria-hidden="true"></i>
                </div>
              )}
              <button
                data-id="checklist-explorer-ai-match"
                className="btn btn-sm btn-primary text-nowrap align-self-center"
                onClick={handleAiMatch}
                disabled={matching || loading || !!error || !matchTarget}
                title={matchTarget
                  ? `Let AI preselect categories for ${matchTarget.split('/').pop()}`
                  : 'Open a Solidity file in the workspace to use AI match'}
              >
                {matching ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    {matchSlow ? 'Still working…' : 'Matching…'}
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-wand-magic-sparkles me-1"></i>
                    AI match
                  </>
                )}
              </button>
            </div>
          )}
          <button
            data-id="checklist-explorer-modal-close-button"
            className="checklist-explorer-modal-close-button"
            onClick={onClose}
            disabled={isProcessing}
          >
            <i className="fa-solid fa-xmark text-dark"></i>
          </button>
        </div>

        <div className="checklist-explorer-container">

          {/* Step 1: Browse and select categories */}
          {wizardStep === 'browse' && (
            <>
              {loading && (
                <div className="d-flex justify-content-center align-items-center py-5">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading checklist...</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="alert alert-danger" role="alert">
                  <i className="fa-solid fa-exclamation-triangle me-2"></i>
                  {error}
                </div>
              )}

              {matchError && (
                <div className="alert alert-warning py-2 d-flex justify-content-between align-items-center" role="alert">
                  <span><i className="fa-solid fa-triangle-exclamation me-2"></i>{matchError}</span>
                  <button className="btn btn-link btn-sm p-0" onClick={handleAiMatch} disabled={matching || !matchTarget}>
                    Retry
                  </button>
                </div>
              )}

              {matchSummary && !matchError && (
                <div
                  data-id="checklist-explorer-ai-match-summary"
                  className={`alert py-2 d-flex justify-content-between align-items-center ${matchSummary.count === 0 ? 'alert-warning' : 'alert-info'}`}
                  role="alert"
                >
                  <span>
                    <i className="fa-solid fa-wand-magic-sparkles me-2"></i>
                    {matchSummary.count === 0 ? (
                      <>
                        No categories matched <code>{matchSummary.file.split('/').pop()}</code>
                        {matchSummary.skippedReason ? ` — ${matchSummary.skippedReason}` : ''}. Pick manually or retry.
                      </>
                    ) : (
                      <>
                        Matched <strong>{matchSummary.count}</strong> categor{matchSummary.count === 1 ? 'y' : 'ies'} from{' '}
                        <code>{matchSummary.file.split('/').pop()}</code>. Review and adjust before generating.
                      </>
                    )}
                    {matchSummary.discarded > 0 && (
                      <span className="ms-2 small opacity-75">
                        ({matchSummary.discarded} unrecognised suggestion{matchSummary.discarded === 1 ? '' : 's'} ignored)
                      </span>
                    )}
                  </span>
                  {aiMatchedPaths.size > 0 && (
                    <button
                      data-id="checklist-explorer-clear-ai-match"
                      className="btn btn-link btn-sm p-0 text-nowrap"
                      onClick={clearAiMatch}
                    >
                      Clear AI matches
                    </button>
                  )}
                </div>
              )}

              {!loading && !error && (
                <>
                  <div className="category-title">Audit Checklist Categories</div>
                  <div className="category-description mb-4">
                    Select audit categories to include in your checklist
                    {loadedCategories.size > 0 && (
                      <span className="ms-2 badge bg-success text-white small">
                        <i className="fa-solid fa-check me-1"></i>
                        already in workspace
                      </span>
                    )}
                  </div>

                  {filteredData.length === 0 ? (
                    <div className="text-center py-5 text-muted">
                      <i className="fa-solid fa-search fa-3x mb-3"></i>
                      <div>No checklist items found matching your search</div>
                    </div>
                  ) : (
                    <div className="checklist-categories">
                      {filteredData.map((mainCategory) => {
                        // Check if this category has direct checklist items (no sub-categories)
                        const hasDirectItems = mainCategory.data.some(item => isChecklistItem(item))
                        const subCategories = mainCategory.data.filter(item => !isChecklistItem(item)) as ChecklistCategory[]

                        if (hasDirectItems && subCategories.length === 0) {
                          // Category with only direct checklist items
                          const isSelected = selectedCategories.has(mainCategory.category)
                          const isExpanded = expandedCategories.has(mainCategory.category)
                          const isLoaded = loadedCategories.has(mainCategory.category)
                          // Provenance only counts while the row is still selected.
                          const aiMatch = isSelected ? aiMatchedPaths.get(mainCategory.category) : undefined

                          return (
                            <div key={mainCategory.category} className="main-category mb-3">
                              <div
                                className={`main-category-header p-3 d-flex justify-content-between align-items-center cursor-pointer bg-secondary text-body`}
                                onClick={() => toggleCategory(mainCategory.category)}
                                style={aiMatch ? { boxShadow: 'inset 4px 0 0 var(--bs-success)' } : isSelected ? { boxShadow: 'inset 4px 0 0 var(--bs-primary)' } : isLoaded ? { boxShadow: 'inset 4px 0 0 var(--bs-success)' } : {}}
                              >
                                <div className="flex-grow-1">
                                  <div className="d-flex align-items-center mb-1">
                                    <h5 className="mb-0">{mainCategory.category}</h5>
                                    {isSelected && (
                                      <i className="fa-solid fa-circle-check ms-2"></i>
                                    )}
                                    {aiMatch && (
                                      <span className="badge bg-success text-white small ms-2" title={aiMatch.reason}>
                                        <i className="fa-solid fa-wand-magic-sparkles me-1"></i>
                                        AI · {aiMatch.confidence}
                                      </span>
                                    )}
                                    {isLoaded && (
                                      <span className="badge bg-success text-white small ms-2" title="A checklist for this category is already saved in audits/">
                                        <i className="fa-solid fa-check me-1"></i>
                                        in workspace
                                      </span>
                                    )}
                                  </div>
                                  {aiMatch?.reason && (
                                    <p className="mb-0 small fst-italic ai-match-reason">{aiMatch.reason}</p>
                                  )}
                                  <p className="mb-0 small opacity-75">{mainCategory.description}</p>
                                  <span className="badge bg-light text-dark small mt-1">{countTotalItems(mainCategory.data)} items</span>
                                </div>
                                <button
                                  className="btn btn-sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleExpanded(mainCategory.category)
                                  }}
                                >
                                  <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} text-white`}></i>
                                </button>
                              </div>

                              {isExpanded && (
                                <div className="category-items p-3 bg-light border border-secondary rounded-bottom">
                                  {collectChecklistItems(mainCategory.data).slice(0, 3).map((item) => (
                                    <div key={item.id} className="item-preview mb-2 p-2 border rounded">
                                      <div className="fw-bold small text-dark">{item.question}</div>
                                      <div className="text-muted small">{item.description.substring(0, 100)}...</div>
                                    </div>
                                  ))}
                                  {countTotalItems(mainCategory.data) > 3 && (
                                    <div className="text-muted small">...and {countTotalItems(mainCategory.data) - 3} more items</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        } else {
                          // Category with sub-categories (original structure)
                          return (
                            <div key={mainCategory.category} className="main-category mb-3">
                              <div className="main-category-header bg-secondary text-body p-2 rounded-top">
                                <h5 className="mb-1">{mainCategory.category}</h5>
                                <p className="mb-0 small text-body">{mainCategory.description}</p>
                              </div>

                              <div className="sub-categories border border-secondary rounded-bottom">
                                {subCategories.map((subCategory) => {
                                  const categoryPath = `${mainCategory.category}::${subCategory.category}`
                                  const isSelected = selectedCategories.has(categoryPath)
                                  const isExpanded = expandedCategories.has(categoryPath)
                                  const isLoaded = loadedCategories.has(categoryPath)
                                  const aiMatch = isSelected ? aiMatchedPaths.get(categoryPath) : undefined

                                  return (
                                    <div key={categoryPath} className="sub-category border-bottom">
                                      <div
                                        className={`sub-category-header p-3 d-flex justify-content-between align-items-center cursor-pointer`}
                                        onClick={() => toggleCategory(categoryPath)}
                                        style={aiMatch ? { backgroundColor: 'rgba(var(--bs-success-rgb), 0.12)', boxShadow: 'inset 4px 0 0 var(--bs-success)' } : isSelected ? { backgroundColor: 'rgba(var(--bs-primary-rgb), 0.12)', boxShadow: 'inset 4px 0 0 var(--bs-primary)' } : isLoaded ? { boxShadow: 'inset 4px 0 0 var(--bs-success)' } : {}}
                                      >
                                        <div className="flex-grow-1">
                                          <div className="d-flex align-items-center mb-1">
                                            <h6 className="text-dark mb-0">{subCategory.category}</h6>
                                            {isSelected && (
                                              <i className="fa-solid fa-circle-check text-primary ms-2"></i>
                                            )}
                                            {aiMatch && (
                                              <span className="badge bg-success text-white small ms-2" title={aiMatch.reason}>
                                                <i className="fa-solid fa-wand-magic-sparkles me-1"></i>
                                                AI · {aiMatch.confidence}
                                              </span>
                                            )}
                                            {isLoaded && (
                                              <span className="badge bg-success text-white small ms-2" title="A checklist for this category is already saved in audits/">
                                                <i className="fa-solid fa-check me-1"></i>
                                                in workspace
                                              </span>
                                            )}
                                          </div>
                                          {aiMatch?.reason && (
                                            <p className="mb-0 small fst-italic ai-match-reason">{aiMatch.reason}</p>
                                          )}
                                          <p className="text-muted mb-0 small">{subCategory.description}</p>
                                          <span className="badge bg-primary text-white small">{countTotalItems(subCategory.data)} items</span>
                                        </div>
                                        <button
                                          className="btn btn-sm"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            toggleExpanded(categoryPath)
                                          }}
                                        >
                                          <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                                        </button>
                                      </div>

                                      {isExpanded && (
                                        <div className="category-items p-3">
                                          {collectChecklistItems(subCategory.data).slice(0, 3).map((item) => (
                                            <div key={item.id} className="item-preview mb-2 p-2 border rounded">
                                              <div className="fw-bold small text-dark">{item.question}</div>
                                              <div className="text-muted small">{item.description.substring(0, 100)}...</div>
                                            </div>
                                          ))}
                                          {countTotalItems(subCategory.data) > 3 && (
                                            <div className="text-muted small">...and {countTotalItems(subCategory.data) - 3} more items</div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        }
                      })}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* Step 2: Confirm */}
          {wizardStep === 'confirm' && (
            <div className="confirm-checklist-step">
              <div className="d-flex flex-column align-items-center py-5">
                <i className="fa-solid fa-list-check fa-3x mb-4 text-primary"></i>
                <h3 className="mb-3">Generate Audit Checklist</h3>
                <div className="checklist-details mb-4 text-center">
                  <div className="mb-3">
                    <strong className="text-body">{selectedCategories.size} categories selected</strong>
                  </div>
                  <div className="selected-categories">
                    {Array.from(selectedCategories).map(categoryPath => {
                      if (categoryPath.includes('::')) {
                        const [mainCat, subCat] = categoryPath.split('::')
                        return (
                          <div key={categoryPath} className="mb-1">
                            <span className="text-muted small">{mainCat} →</span>
                            <span className="text-primary fw-semibold ms-1">{subCat}</span>
                            {aiMatchedPaths.get(categoryPath) && (
                              <span className="ms-2 small fst-italic ai-match-reason">
                                <i className="fa-solid fa-wand-magic-sparkles me-1"></i>
                                {aiMatchedPaths.get(categoryPath).reason}
                              </span>
                            )}
                          </div>
                        )
                      } else {
                        return (
                          <div key={categoryPath} className="mb-1">
                            <span className="text-primary fw-semibold">{categoryPath}</span>
                            {aiMatchedPaths.get(categoryPath) && (
                              <span className="ms-2 small fst-italic ai-match-reason">
                                <i className="fa-solid fa-wand-magic-sparkles me-1"></i>
                                {aiMatchedPaths.get(categoryPath).reason}
                              </span>
                            )}
                          </div>
                        )
                      }
                    })}
                  </div>
                </div>
                <div className="alert alert-info mb-4">
                  <i className="fa-solid fa-info-circle me-2"></i>
                  {(() => {
                    const timestamp = new Date().toISOString().split('T')[0]
                    const selectedCategoryNames = Array.from(selectedCategories).map(categoryPath => {
                      if (categoryPath.includes('::')) {
                        const [mainCat, subCat] = categoryPath.split('::')
                        return `${mainCat}-${subCat}`
                      } else {
                        return categoryPath
                      }
                    }).join('_')
                    const cleanCategoryNames = selectedCategoryNames
                      .replace(/[^a-zA-Z0-9_-]/g, '_')
                      .replace(/_+/g, '_')
                      .replace(/^_|_$/g, '')
                      .substring(0, 50) // Shorter for display
                    return (
                      <span>This will create a markdown checklist in <code>audits/audit-checklist-{cleanCategoryNames}-{timestamp}.md</code></span>
                    )
                  })()}
                </div>
                {error && (
                  <div className="alert alert-danger mb-3" role="alert">
                    <i className="fa-solid fa-exclamation-triangle me-2"></i>
                    <pre className="mb-0 small">{error}</pre>
                  </div>
                )}
                <div className="d-flex gap-3">
                  <button className="btn btn-secondary" onClick={handleBack}>Cancel</button>
                  <button
                    data-id="checklist-explorer-confirm-generate"
                    className="btn btn-primary"
                    onClick={handleConfirmChecklist}
                  >
                    Generate Checklist
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Saving */}
          {wizardStep === 'saving' && (
            <div className="saving-checklist-step">
              <div className="d-flex flex-column align-items-center py-5">
                <div className="spinner-border text-primary fa-3x mb-4" role="status">
                  <span className="visually-hidden">Saving checklist...</span>
                </div>
                <h3 className="mb-3">Generating Checklist</h3>
                <p className="text-muted">
                  Creating your audit checklist file...
                </p>
              </div>
            </div>
          )}

        </div>

        {/* Fixed footer */}
        {wizardStep === 'browse' && !loading && !error && selectedCategories.size > 0 && (
          <div className="checklist-explorer-modal-footer">
            <button
              data-id="checklist-explorer-generate-selected"
              className="btn btn-primary"
              onClick={handleLoadSelected}
            >
              <i className="fa-solid fa-list-check me-2"></i>
              Generate Checklist ({selectedCategories.size} categories
              {aiMatchedPaths.size > 0 && ` · ${aiMatchedPaths.size} AI-matched`})
            </button>
          </div>
        )}
      </div>
    </section>
  )
}