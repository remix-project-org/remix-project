import React, { useState, useEffect, useRef, useCallback } from 'react'
import { trackMatomoEvent } from '@remix-api'
import {
  buildAuditTaxonomy,
  categoryFileToken,
  deriveContractName,
  computeLoadedCategories,
  AuditMatch,
  AuditMatchResult
} from '@remix/remix-ai-core/audit-taxonomy'
import { frontierAlternativesFor, frontierFamilyOf } from '@remix/remix-ai-core/model-tiers'
import {
  ChecklistItem,
  ChecklistCategory,
  ChecklistData,
  isChecklistItem,
  collectChecklistItems,
  countTotalItems
} from './helpers'
import './remix-ui-checklist-explorer-modal.css'

export interface RemixUiChecklistExplorerModalProps {
  isOpen: boolean
  onClose: () => void
  plugin?: any // Plugin instance to access fileManager
  /**
   * Why the modal was opened. `audit` (from /audit) finishes by running the
   * audit; `checklist` (from /load-audit-checklist or the home tab) just saves
   * the checklist files and closes.
   */
  mode?: 'audit' | 'checklist'
}

/** Human label for a selectable path: `Main::Sub` reads as just `Sub`. */
const categoryLabel = (path: string): string => (path.includes('::') ? path.split('::')[1] : path)

/**
 * Dropdown label for a candidate: the basename, widened with its parent folder
 * only when another candidate shares that basename (the full workspace sweep
 * makes `Token.sol` in two folders a common case).
 */
const candidateLabel = (file: string, all: string[]): string => {
  const name = file.split('/').pop() ?? file
  const ambiguous = all.filter(other => (other.split('/').pop() ?? other) === name).length > 1
  if (!ambiguous) return name
  const parts = file.split('/')
  return parts.length > 1 ? `${parts[parts.length - 2]}/${name}` : name
}

export function RemixUiChecklistExplorerModal(props: RemixUiChecklistExplorerModalProps) {
  const { isOpen, onClose, plugin, mode = 'checklist' } = props
  const isAuditMode = mode === 'audit'
  const [checklistData, setChecklistData] = useState<ChecklistData[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [loadedCategories, setLoadedCategories] = useState<Set<string>>(new Set())
  const [wizardStep, setWizardStep] = useState<'browse' | 'model' | 'confirm' | 'saving'>('browse')
  /**
   * Frontier models offered before an audit starts, and which launch path is
   * waiting on that choice.
   *
   * On Auto the router often lands on a small route that skims an audit, and
   * the user only finds out from a thin report. Asking here is the one moment
   * a switch is safe: once the run is going, changing model rebuilds the
   * DeepAgent and orphans it. A tag rather than a stashed callback, so the pick
   * dispatches into the current closure.
   */
  const [modelChoices, setModelChoices] = useState<any[]>([])
  const [pendingAudit, setPendingAudit] = useState<'new' | 'existing' | null>(null)
  const [switchingModel, setSwitchingModel] = useState<boolean>(false)
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
  /**
   * Plays the one-shot ring on the contract dropdown when the modal opens.
   *
   * The control sits in a busy toolbar and decides where everything is saved,
   * yet it is easy to miss — and the focused file is preselected, so a user who
   * never looks at it can audit the wrong contract. Cleared the moment they
   * touch it, so it never nags.
   */
  const [highlightTarget, setHighlightTarget] = useState<boolean>(false)
  const [contractNamesByFile, setContractNamesByFile] = useState<Record<string, string[]>>({})
  const [currentSolFile, setCurrentSolFile] = useState<string>('')
  const containerRef = useRef<HTMLDivElement>(null)
  const matchRunId = useRef(0)

  // The contract the checklists are saved against: it names the folder, so every
  // save path and every "already saved" lookup is scoped through it.
  const contractName = deriveContractName(matchTarget, contractNamesByFile)
  const contractDir = contractName ? `audits/${contractName}` : ''
  /** Basename of the picked file — what the audit button names. */
  const selectedFileName = matchTarget ? (matchTarget.split('/').pop() ?? matchTarget) : ''
  /**
   * Every checklist the audit will cover: those already saved in the contract's
   * folder plus those just ticked. Both audit buttons run the agent over the
   * whole folder, so neither may describe only half of what is in there.
   */
  const auditScopePaths = Array.from(new Set([...Array.from(loadedCategories), ...Array.from(selectedCategories)]))
  const auditScopeLabels = auditScopePaths.map(categoryLabel)

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
  const resolveSolCandidates = async (): Promise<{ candidates: string[]; namesByFile: Record<string, string[]>; currentFile: string }> => {
    if (!plugin) return { candidates: [], namesByFile: {}, currentFile: '' }
    const ordered: string[] = []
    const push = (file?: string) => {
      if (typeof file === 'string' && file.endsWith('.sol') && !ordered.includes(file)) ordered.push(file)
    }

    // The file in focus, when it is a Solidity file, becomes the default target.
    let currentFile = ''
    try {
      const focused = await plugin.call('fileManager', 'getCurrentFile')
      if (typeof focused === 'string' && focused.endsWith('.sol')) currentFile = focused
      push(focused)
    } catch (e) { /* nothing in focus */ }
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

    // Always sweep the workspace, not only when nothing else was found: every
    // Solidity file has to stay pickable even while a file is in focus. The
    // passes above only decide the ORDER, so the focused/compiled files keep
    // their head positions and the rest of the workspace follows.
    try {
      const tree = await plugin.call('fileManager', 'copyFolderToJson', '/')
      // copyFolderToJson keys are already FULL paths (see fileProvider's
      // `json[curPath] = file`), so they must be used as-is — deriving a path
      // from the parent key produced `contracts/contracts/Foo.sol`.
      const skip = /^(\.|node_modules$)/
      const walk = (node: any) => {
        if (ordered.length >= 200) return
        Object.keys(node || {}).forEach(fullPath => {
          const child = node[fullPath]
          if (skip.test(fullPath.split('/').pop() ?? '')) return
          if (child?.content !== undefined) push(fullPath)
          else if (child?.children) walk(child.children)
        })
      }
      walk(tree)
    } catch (e) { /* workspace unreadable — fall back to whatever was found above */ }

    return { candidates: ordered.slice(0, 200), namesByFile, currentFile }
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

  const fetchExistingChecklistFiles = async (dir: string): Promise<string[]> => {
    if (!plugin || !dir) return []
    try {
      const entries = await plugin.call('fileManager', 'readdir', dir)
      return Object.keys(entries || {})
    } catch (e) {
      // The contract has no checklists saved yet — the folder simply isn't there.
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
      setHighlightTarget(true)
      matchRunId.current++
      setMatching(false)
      setMatchSlow(false)
      setMatchError(null)
      setAiMatchedPaths(new Map())
      setMatchSummary(null)

      resolveSolCandidates().then(({ candidates, namesByFile, currentFile }) => {
        setSolCandidates(candidates)
        setCurrentSolFile(currentFile)
        setMatchTarget(currentFile && candidates.includes(currentFile) ? currentFile : '')
        setContractNamesByFile(namesByFile)
      }).catch(() => {
        setSolCandidates([])
        setCurrentSolFile('')
        setMatchTarget('')
        setContractNamesByFile({})
      })

      const load = async () => {
        setLoading(true)
        try {
          const data = await fetchChecklistData()
          setChecklistData(data)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to load checklist')
        } finally {
          setLoading(false)
        }
      }
      load()
    }
  }, [isOpen])

  // "in workspace" badges are per contract now, so they have to follow the
  // contract dropdown and not just the modal opening.
  useEffect(() => {
    if (!isOpen || !checklistData.length) return
    let cancelled = false
    if (!contractDir) {
      setLoadedCategories(new Set())
      return
    }
    fetchExistingChecklistFiles(contractDir).then(files => {
      if (!cancelled) setLoadedCategories(computeLoadedCategories(checklistData, files))
    })
    return () => { cancelled = true }
  }, [isOpen, checklistData, contractDir])

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

  /**
   * One markdown document for a single selected category path. Each checklist is
   * saved on its own now, so the whole-selection document is gone — but the
   * per-item body below is byte-for-byte what it always was, because the auditor
   * subagent reads these files and keys off that shape.
   */
  const generateCategoryMarkdown = (categoryPath: string): string => {
    const [mainName, subName] = categoryPath.includes('::') ? categoryPath.split('::') : [categoryPath, '']
    const mainCategory = checklistData.find(c => c.category === mainName)
    if (!mainCategory) return ''

    const title = subName ? `${mainName} → ${subName}` : mainName
    let markdown = `# Audit Checklist — ${title}\n\n`
    if (contractName) markdown += `Contract: ${contractName} (${matchTarget})\n\n`
    markdown += `Generated on: ${new Date().toISOString().split('T')[0]}\n\n`

    if (!subName) {
      if (mainCategory.description) markdown += `${mainCategory.description}\n\n`
      markdown += generateNestedMarkdown(mainCategory.data, mainName)
      return markdown
    }

    const subCategory = mainCategory.data.find(
      item => !isChecklistItem(item) && (item as ChecklistCategory).category === subName
    ) as ChecklistCategory | undefined
    if (!subCategory) return ''

    if (subCategory.description) markdown += `${subCategory.description}\n\n`
    markdown += generateNestedMarkdown(subCategory.data, `${mainName} → ${subName}`)
    return markdown
  }

  /** Items in one selected category — drives the confirm step and the chat summary. */
  const countItemsForCategory = (categoryPath: string): number => {
    const [mainName, subName] = categoryPath.includes('::') ? categoryPath.split('::') : [categoryPath, '']
    const mainCategory = checklistData.find(c => c.category === mainName)
    if (!mainCategory) return 0
    if (!subName) return countTotalItems(mainCategory.data)
    const subCategory = mainCategory.data.find(
      item => !isChecklistItem(item) && (item as ChecklistCategory).category === subName
    ) as ChecklistCategory | undefined
    return subCategory ? countTotalItems(subCategory.data) : 0
  }

  /**
   * Frontier models worth offering, or [] when there is nothing to ask about.
   *
   * Only speaks up on Auto: a user who already picked a concrete model has made
   * the choice. Fails open — a catalogue hiccup must never block an audit.
   */
  const loadAuditModelChoices = async (): Promise<any[]> => {
    if (!plugin) return []
    try {
      const currentId = await plugin.call('remixAI', 'getSelectedModel')
      const models = await plugin.call('assistantState', 'getAvailableModels')
      return frontierAlternativesFor(currentId, models)
    } catch (e) {
      return []
    }
  }

  /** Both audit launch paths funnel through here so neither can skip the prompt. */
  const gateAudit = async (which: 'new' | 'existing', launch: () => void | Promise<void>) => {
    const choices = await loadAuditModelChoices()
    if (!choices.length) {
      await launch()
      return
    }
    setModelChoices(choices)
    setPendingAudit(which)
    setWizardStep('model')
  }

  /**
   * Apply the pick (or keep Auto) and resume the audit that was waiting.
   *
   * `setModel` is awaited before launching: it rebuilds the DeepAgent, and
   * firing chatPipe in parallel would race that teardown and drop the audit.
   */
  const handleAuditModelPick = async (model: any | null) => {
    if (switchingModel) return
    setSwitchingModel(true)
    if (model) {
      try {
        await plugin.call('remixAI', 'setModel', model.id, model.provider)
        trackMatomoEvent(plugin, {
          category: 'ai', action: 'remixAI', name: 'audit_model_switch',
          value: `${model.provider}::${model.id}`, isClick: true
        })
      } catch (e) {
        // A failed switch must not swallow the audit — carry on with Auto.
        trackMatomoEvent(plugin, {
          category: 'ai', action: 'remixAI', name: 'audit_model_switch_failed',
          value: `${model.provider}::${model.id}`, isClick: false
        })
      }
    } else {
      trackMatomoEvent(plugin, {
        category: 'ai', action: 'remixAI', name: 'audit_model_keep_auto', value: 'auto', isClick: true
      })
    }
    const which = pendingAudit
    setPendingAudit(null)
    setSwitchingModel(false)
    if (which === 'new') await handleConfirmChecklist()
    else if (which === 'existing') await runAuditExisting()
  }

  const handleLoadSelected = () => {
    if (selectedCategories.size === 0) return
    // The contract names the folder, so it is required before anything is written.
    if (!contractDir) {
      setError('Select the contract these checklists belong to')
      return
    }
    setError(null)
    // Audit mode has no confirm screen: the button already says what it will do
    // and names the contract, so a second screen restating it just adds a click.
    if (isAuditMode) {
      void gateAudit('new', handleConfirmChecklist)
      return
    }
    setWizardStep('confirm')
  }

  const newRunId = (): string => {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `run-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  }

  const auditInstruction = (checklistLabels: string, runId: string): string =>
    `Use the Comprehensive_Auditor subagent to audit this contract, passing it these values verbatim:\n`
    + `\nCONTRACT: ${contractName}\n`
    + `\nFILE: ${matchTarget}\n`
    + `\nCHECKLISTS: ${contractDir}/ (${checklistLabels})\n`
    + `\nRUN: ${runId}`

  const handleConfirmChecklist = async () => {
    if (!plugin) {
      setError('Plugin not available')
      return
    }
    if (!contractDir) {
      setError('Select the contract these checklists belong to')
      setWizardStep('browse')
      return
    }
    // Audit mode never shows the generate-checklist screens. The user asked for
    // an audit, not for files, so writing them is an implementation detail:
    // close immediately and let the writes finish in the background. Checklist
    // mode keeps the wizard, where the files ARE the deliverable.
    if (isAuditMode) onClose()
    else {
      setWizardStep('saving')
      setSaving(true)
    }

    try {
      await ensureDirectoryExists('audits')
      await ensureDirectoryExists(contractDir)

      // One file per checklist, so the auditor can work through them one at a
      // time and report per checklist.
      const written: { label: string; items: number }[] = []
      for (const categoryPath of Array.from(selectedCategories)) {
        const content = generateCategoryMarkdown(categoryPath)
        if (!content) continue
        const filePath = `${contractDir}/${categoryFileToken(categoryPath)}.md`
        await plugin.call('fileManager', 'writeFile', filePath, content)
        written.push({
          label: categoryPath.includes('::') ? categoryPath.split('::')[1] : categoryPath,
          items: countItemsForCategory(categoryPath)
        })
      }

      if (!written.length) throw new Error('No checklist could be generated for the selection')

      // Say what landed on disk — a UI-only bubble, so the audit instruction
      // below has to repeat the contract rather than rely on it.
      const itemCount = written.reduce((total, entry) => total + entry.items, 0)
      const labelText = written.map(entry => entry.label).join(', ')
      try {
        const summary = `Saved ${written.length} checklist${written.length === 1 ? '' : 's'} for \`${contractName}\` (${matchTarget}) in \`${contractDir}/\` — ${labelText} (${itemCount} item${itemCount === 1 ? '' : 's'} total).`
        await plugin.call('remixaiassistant', 'handleExternalMessage', summary)
      } catch (e) {
        // assistant panel unavailable — the files are still created
      }

      // No state updates in audit mode — the modal unmounted when we closed it.
      if (!isAuditMode) setSaving(false)
      // Checklist mode stops here: the files are the deliverable.
      // The audit covers the whole folder, so it is named with the full scope —
      // the checklists just written plus any that were already saved.
      if (isAuditMode) startAudit(auditInstruction(auditScopeLabels.join(', '), newRunId()))
      else onClose()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save checklist'
      // The modal is already gone in audit mode, so the chat is the only place
      // left to report this — failing silently would start no audit and say
      // nothing about why.
      if (isAuditMode) {
        try {
          await plugin.call('remixaiassistant', 'handleExternalMessage', `Could not save the checklists in \`${contractDir}/\`: ${message}. The audit was not started.`)
        } catch (e) {
          // assistant panel unavailable too — nothing more we can surface
        }
        return
      }
      setSaving(false)
      setError(message)
      setWizardStep('confirm')
    }
  }

  /**
   * Close the modal and hand the audit off to the assistant.
   *
   * The instruction has to name the contract itself. This dropdown is the only
   * place that choice is made, and the summary posted next to it is a UI-only
   * assistant bubble (`addAssistantMessage` just calls `setMessages`) that the
   * model never sees — so anything not in this string is invisible to the run.
   * That is why it goes through `chatPipe` (which reaches `sendChat`) rather
   * than `submitChatInput`, which would send whatever generic text the slash
   * command happened to leave in the composer.
   */
  const startAudit = (instruction: string) => {
    onClose()
    Promise.resolve(
      plugin?.call('remixaiassistant', 'chatPipe', instruction, false, {
        source: 'checklist-explorer',
        presetId: 'audit-contract',
        displayText: `Auditing \`${contractName}\` (${matchTarget}) with ${auditScopeLabels.length} checklist${auditScopeLabels.length === 1 ? '' : 's'} (${auditScopeLabels.join(', ')})...`
      })
    ).catch(() => {
      // assistant plugin unavailable — modal is already closed
    })
  }

  /**
   * Skip the selection step and audit against what is already saved.
   *
   * Offered only when the contract's folder already holds checklists and the
   * user has picked nothing new: at that point selecting categories again is
   * busywork. It hands off exactly like the footer's audit button — summary
   * into the chat, then startAudit — so both routes produce the same run and
   * report. The only thing it skips is writing files that are already there.
   */
  const runAuditExisting = async () => {
    if (!plugin || !contractDir) return
    trackMatomoEvent(plugin, {
      category: 'ai',
      action: 'remixAI',
      name: 'audit_existing_checklists',
      value: `${auditScopePaths.length}`,
      isClick: true
    })

    // Only reachable with nothing newly ticked — the button hides as soon as the
    // user picks a category, because from then on the footer's audit button
    // carries the whole scope (and writes the new picks before auditing).
    try {
      const itemCount = auditScopePaths.reduce((total, path) => total + countItemsForCategory(path), 0)
      const summary = `Reusing ${auditScopeLabels.length} checklist${auditScopeLabels.length === 1 ? '' : 's'} already saved for \`${contractName}\` (${matchTarget}) in \`${contractDir}/\` — ${auditScopeLabels.join(', ')} (${itemCount} item${itemCount === 1 ? '' : 's'} total).`
      await plugin.call('remixaiassistant', 'handleExternalMessage', summary)
    } catch (e) {
      // assistant panel unavailable — still hand off below
    }

    startAudit(auditInstruction(auditScopeLabels.join(', '), newRunId()))
  }

  const handleBack = () => {
    setPendingAudit(null)
    setModelChoices([])
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
  const isProcessing = saving || switchingModel

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
              {wizardStep === 'model' && (
                <span className="text-body align-self-center">Choose the audit model</span>
              )}
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
            <div className="d-flex flex-column gap-2 w-100 mx-3 my-2">
              {/* Row 1 — search. It filters the checklist below and nothing
                  else, so it owns its own row: sharing one with the contract
                  picker made the picker read as a search scope. */}
              <div className="checklist-explorer-search">
                <i className="fa-solid fa-magnifying-glass checklist-explorer-search-icon" aria-hidden="true"></i>
                <input
                  type="text"
                  data-id="checklist-explorer-search-input"
                  placeholder="Search audit items..."
                  className="form-control checklist-explorer-modal-search-input ps-5 fw-light"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    type="button"
                    data-id="checklist-explorer-search-clear"
                    className="checklist-explorer-search-clear"
                    onClick={() => setSearchTerm('')}
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                  </button>
                )}
              </div>

              {/* Row 2 — the contract the checklists are saved for and that AI
                  match runs against. Bonded into one labelled cluster so the
                  dropdown reads as the button's target, not a search filter. */}
              <div className="checklist-explorer-target-bar d-flex flex-row align-items-center gap-2">
                <span className="checklist-explorer-target-label text-nowrap">
                  <i className="fa-solid fa-file-code me-1" aria-hidden="true"></i>
                  Contract
                </span>
                {solCandidates.length > 0 && (
                  <div
                    className={`ai-match-target align-self-center${highlightTarget ? ' needs-contract' : ''}`}
                    style={{ width: '13rem' }}
                  >
                    <select
                      data-id="checklist-explorer-ai-match-target"
                      className="form-select"
                      value={matchTarget}
                      onChange={(e) => { setMatchTarget(e.target.value); setHighlightTarget(false) }}
                      onFocus={() => setHighlightTarget(false)}
                      disabled={matching}
                      title={matchTarget
                        ? `Checklists will be saved in ${contractDir}/, and AI match runs against ${matchTarget}. Pick another file to change the contract.`
                        : 'Select the contract to save the checklists for'}
                      aria-label="Select the contract to save the checklists for"
                    >
                      <option value="" disabled>Select a contract…</option>
                      {solCandidates.map(file => (
                        <option key={file} value={file} title={file}>
                          {candidateLabel(file, solCandidates)}{file === currentSolFile ? ' (current)' : ''}
                        </option>
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
                    : solCandidates.length > 0
                      ? 'Select a Solidity file first to use AI match'
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
                {matchTarget && (
                  <span
                    className="checklist-explorer-target-hint text-truncate"
                    title={`Checklists will be saved in ${contractDir}/`}
                  >
                    saved in {contractDir}/
                  </span>
                )}
              </div>
            </div>
          )}
          <button
            data-id="checklist-explorer-modal-close-button"
            className={`checklist-explorer-modal-close-button${showBackButton ? '' : ' align-self-start mt-2'}`}
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
                  <div className="category-description mb-4 d-flex align-items-center flex-wrap gap-2">
                    <span>Select audit categories to include in your checklist</span>
                    {loadedCategories.size > 0 && (
                      <span className="badge bg-success text-white small">
                        <i className="fa-solid fa-check me-1"></i>
                        {loadedCategories.size} already in workspace
                      </span>
                    )}
                    {/* Only while nothing new is ticked: once it is, the footer
                        button carries the whole scope and two buttons offering
                        the same run would just be noise. */}
                    {loadedCategories.size > 0 && isAuditMode && selectedCategories.size === 0 && (
                      <>
                        {/* Nothing left to pick: the contract already has
                            checklists, so offer the audit straight away. */}
                        <button
                          data-id="checklist-explorer-audit-existing"
                          className="btn btn-sm btn-primary text-nowrap"
                          onClick={() => void gateAudit('existing', runAuditExisting)}
                          title={`Audit ${contractName} against the ${auditScopePaths.length} checklist${auditScopePaths.length === 1 ? '' : 's'} already saved in ${contractDir}/`}
                        >
                          <i className="fa-solid fa-shield-halved me-1"></i>
                          Audit with these {auditScopePaths.length} checklist{auditScopePaths.length === 1 ? '' : 's'}
                        </button>
                      </>
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
                                      <span className="badge bg-success text-white small ms-2" title={`A checklist for this category is already saved in ${contractDir}/`}>
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
                                              <span className="badge bg-success text-white small ms-2" title={`A checklist for this category is already saved in ${contractDir}/`}>
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

          {/* Step 1b: pick a model (Auto only) */}
          {wizardStep === 'model' && (
            <div className="confirm-checklist-step">
              <div className="d-flex flex-column align-items-center py-5">
                <i className="fa-solid fa-microchip fa-3x mb-4 text-primary"></i>
                <h3 className="mb-3">Choose the audit model</h3>
                <div className="checklist-details mb-4 text-center">
                  <p className="text-muted mb-4">
                    You are on <strong>Auto</strong>, which often routes to a small model.
                    An audit reasons over {selectedFileName || 'the contract'} against every
                    checklist item at once — a frontier model catches noticeably more.
                    Your pick becomes your model selection everywhere.
                  </p>
                  <div className="d-flex flex-column gap-2 align-items-stretch">
                    {modelChoices.map(model => (
                      <button
                        key={`${model.provider}::${model.id}`}
                        data-id={`audit-model-choice-${model.id}`}
                        className="btn btn-primary d-flex justify-content-between align-items-center"
                        onClick={() => handleAuditModelPick(model)}
                        disabled={switchingModel}
                      >
                        <span>{model.displayName || model.id}</span>
                        <span className="badge bg-light text-dark small ms-2">{frontierFamilyOf(model.id) || model.provider}</span>
                      </button>
                    ))}
                    <button
                      data-id="audit-model-keep-auto"
                      className="btn btn-secondary"
                      onClick={() => handleAuditModelPick(null)}
                      disabled={switchingModel}
                    >
                      Keep Auto
                    </button>
                  </div>
                  {switchingModel && (
                    <div className="text-muted small mt-3">
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Switching model and starting the audit...
                    </div>
                  )}
                </div>
              </div>
            </div>
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
                  <span>
                    This will create one markdown checklist per category in <code>{contractDir}/</code>:
                  </span>
                  <ul className="mb-0 mt-2 small">
                    {Array.from(selectedCategories).map(categoryPath => (
                      <li key={categoryPath}>
                        <code>{categoryFileToken(categoryPath)}.md</code>
                        <span className="ms-2 opacity-75">{countItemsForCategory(categoryPath)} items</span>
                      </li>
                    ))}
                  </ul>
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
                    {isAuditMode ? `Audit ${selectedFileName || 'contract'}` : 'Generate Checklist'}
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
                <h3 className="mb-3">{isAuditMode ? 'Starting Audit' : 'Generating Checklists'}</h3>
                <p className="text-muted">
                  Saving one checklist file per category in {contractDir}/...
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
              disabled={!contractDir}
              title={contractDir
                ? isAuditMode
                  ? `Save the ${selectedCategories.size} newly picked checklist${selectedCategories.size === 1 ? '' : 's'} in ${contractDir}/ and audit ${selectedFileName} against all ${auditScopePaths.length}`
                  : `Checklists will be saved in ${contractDir}/`
                : 'Select the contract these checklists belong to first'}
            >
              <i className={`fa-solid ${isAuditMode ? 'fa-shield-halved' : 'fa-list-check'} me-2`}></i>
              {/* Audit mode counts the full scope — newly picked plus whatever is
                  already saved — because that is what the run covers. Checklist
                  mode only writes the new picks, so it counts just those. */}
              {isAuditMode
                ? `Audit ${selectedFileName || 'contract'} (${auditScopePaths.length} checklist${auditScopePaths.length === 1 ? '' : 's'}`
                : `Generate Checklist (${selectedCategories.size} categories`}
              {aiMatchedPaths.size > 0 && ` · ${aiMatchedPaths.size} AI-matched`})
            </button>
            {!contractDir && (
              <span className="text-muted small ms-3 align-self-center">
                Select a contract above to choose where the checklists are saved.
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  )
}