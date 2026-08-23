import React, { Dispatch, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SiOpenai, SiAnthropic, SiOllama, SiAmazonwebservices } from 'react-icons/si'
import GroupListMenu, { LockedPillState } from './contextOptMenu'
import { groupListType } from '../types/componentTypes'
import { AIModel, modelKey } from '@remix/remix-ai-core'

/**
 * Display metadata for each provider section header (label + subtitle). The
 * brand icon is resolved separately by `providerIcon`. Unknown providers fall
 * back to `DEFAULT_PROVIDER_META`.
 */
const PROVIDER_META: Record<string, { label: string; subtitle: string }> = {
  anthropic: { label: 'Anthropic', subtitle: 'Claude models' },
  openai: { label: 'OpenAI', subtitle: 'GPT models' },
  mistralai: { label: 'Mistral AI', subtitle: 'Mistral models' },
  moonshot: { label: 'Moonshot AI', subtitle: 'Kimi models' },
  openrouter: { label: 'OpenRouter', subtitle: 'Many models via one route' },
  bedrock: { label: 'AWS Bedrock', subtitle: 'Models hosted on AWS' },
  ollama: { label: 'Local (Ollama)', subtitle: 'Run on your machine' }
}

const DEFAULT_PROVIDER_META = { label: 'Other', subtitle: '' }

const providerMeta = (provider: string) => PROVIDER_META[provider] ?? { ...DEFAULT_PROVIDER_META, label: provider }

/**
 * Brand mark per provider. OpenAI / Anthropic / Ollama / AWS come from
 * `react-icons` (Simple Icons). Mistral, Moonshot and OpenRouter have no Simple
 * Icons entry in the installed version, so we render small inline brand-evoking
 * marks. All icons inherit the current text colour via `currentColor`.
 */
const providerIcon = (provider: string): React.ReactNode => {
  switch (provider) {
  case 'openai':
    return <SiOpenai />
  case 'anthropic':
    return <SiAnthropic />
  case 'ollama':
    return <SiOllama />
  case 'bedrock':
    return <SiAmazonwebservices />
  case 'mistralai':
    // Mistral's ladder/grid mark: three columns crossed by two bands.
    return (
      <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
        <rect x="2" y="3" width="4" height="18" />
        <rect x="10" y="3" width="4" height="18" />
        <rect x="18" y="3" width="4" height="18" />
        <rect x="2" y="3" width="20" height="4" />
        <rect x="2" y="10.5" width="20" height="4" />
      </svg>
    )
  case 'moonshot':
    // Crescent — Moonshot's brand identity.
    return (
      <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true">
        <path d="M13 2a10 10 0 1 0 8.5 15.2A8 8 0 0 1 13 2z" />
      </svg>
    )
  case 'openrouter':
    // Routing hub: one node fanning out to two.
    return (
      <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="5" cy="12" r="2.5" />
        <circle cx="19" cy="6" r="2.5" />
        <circle cx="19" cy="18" r="2.5" />
        <path d="M7.4 10.8 16.6 6.6M7.4 13.2 16.6 17.4" />
      </svg>
    )
  default:
    return <i className="fa-solid fa-microchip" />
  }
}

/** The anonymous sign-in placeholder is rendered ungrouped (like Auto Mode). */
const isSignInModel = (model: AIModel) => model.id === '__signin__'

const isAutoModel = (model: AIModel) => {
  const id = model.id.toLowerCase()
  return id === 'auto' || id === 'openrouter/auto' || id.endsWith('/auto')
}

/** Map an AIModel to the row shape consumed by GroupListMenu. */
const toRow = (model: AIModel): groupListType => {
  const key = modelKey(model)
  return {
    label: model.displayName,
    bodyText: model.description,
    icon: 'fa-solid fa-check',
    stateValue: key,
    dataId: `ai-model-${key.replace(/[^a-zA-Z0-9]/g, '-')}`,
    isLocked: !model.available
  }
}

/** A provider never shows more than this many model rows before scrolling. */
const MAX_VISIBLE_MODELS = 6

/**
 * Model rows for one provider, clamped to `MAX_VISIBLE_MODELS` rows with their
 * own scrollbar. Row heights vary (descriptions wrap), so the cap is measured
 * off the rendered rows rather than assumed from a fixed row height.
 */
const ProviderModelList: React.FC<{ rows: groupListType[]; groupListProps: any }> = ({ rows, groupListProps }) => {
  const listRef = useRef<HTMLDivElement>(null)
  const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined)
  const rowsKey = rows.map(r => r.stateValue).join('|')

  useLayoutEffect(() => {
    const container = listRef.current
    if (!container) return
    const measure = () => {
      const buttons = Array.from(container.querySelectorAll<HTMLElement>('.btn-group-vertical > button'))
      if (buttons.length <= MAX_VISIBLE_MODELS) {
        setMaxHeight(undefined)
        return
      }
      const first = buttons[0]
      const last = buttons[MAX_VISIBLE_MODELS - 1]
      setMaxHeight(last.offsetTop + last.offsetHeight - first.offsetTop)
    }
    measure()
    // Observe the inner list (not the clipped wrapper) so applying maxHeight
    // doesn't feed back into the observer.
    const inner = container.firstElementChild
    if (!inner || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(inner)
    return () => observer.disconnect()
  }, [rowsKey])

  return (
    <div ref={listRef} className="rai-model-list" style={{ maxHeight, overflowY: maxHeight ? 'auto' : undefined }}>
      <GroupListMenu {...groupListProps} groupList={rows} />
    </div>
  )
}

interface ProviderGroup {
  provider: string
  models: AIModel[]
  minSortOrder: number
}

export interface ModelSelectorMenuProps {
  availableModels: AIModel[]
  autoModeAvailable: boolean
  autoModeEnabled: boolean
  /** `'auto'` or `modelKey(selectedModel)` — the currently active choice. */
  currentChoice: string
  setChoice: Dispatch<React.SetStateAction<any>>
  setShowOptions: Dispatch<React.SetStateAction<boolean>>
  onLockedItemClick?: (item: groupListType) => void
  upgradePillState?: LockedPillState
  buyCreditsPillState?: LockedPillState
  onBuyCreditsClick?: (item: groupListType) => void
}

export default function ModelSelectorMenu(props: ModelSelectorMenuProps) {
  const [query, setQuery] = useState('')

  // Ungrouped rows shown above the provider accordion (sign-in placeholder).
  const signInModels = useMemo(
    () => props.availableModels.filter(isSignInModel),
    [props.availableModels]
  )

  // The OpenRouter auto entry, hoisted out of its provider group.
  const autoModel = useMemo(
    () => props.availableModels.find(m => !isSignInModel(m) && isAutoModel(m)),
    [props.availableModels]
  )

  // Group the remaining models by provider, ordered by the lowest sortOrder in
  // each group (keeps the backend's ordering intent; Ollama's 1000 lands last).
  const groups = useMemo<ProviderGroup[]>(() => {
    const byProvider = new Map<string, AIModel[]>()
    for (const model of props.availableModels) {
      if (isSignInModel(model) || isAutoModel(model)) continue
      const list = byProvider.get(model.provider) ?? []
      list.push(model)
      byProvider.set(model.provider, list)
    }
    return Array.from(byProvider.entries())
      .map(([provider, models]) => ({
        provider,
        models: [...models].sort((a, b) => a.sortOrder - b.sortOrder),
        minSortOrder: models.reduce((min, m) => Math.min(min, m.sortOrder), Number.POSITIVE_INFINITY)
      }))
      .sort((a, b) => a.minSortOrder - b.minSortOrder)
  }, [props.availableModels])

  const selectedModel = useMemo(() => {
    if (!props.currentChoice || props.currentChoice === 'auto') return undefined
    return props.availableModels.find(m => !isSignInModel(m) && !isAutoModel(m) && modelKey(m) === props.currentChoice)
  }, [props.availableModels, props.currentChoice])
  const selectedProvider = selectedModel?.provider

  const [expanded, setExpanded] = useState<string | null>(selectedProvider ?? null)

  useEffect(() => {
    setExpanded(selectedProvider ?? null)
  }, [selectedProvider])

  const toggle = (provider: string) => {
    setExpanded(prev => (prev === provider ? null : provider))
  }

  const normalizedQuery = query.trim().toLowerCase()
  const matchesQuery = (model: AIModel) =>
    !normalizedQuery ||
    model.displayName.toLowerCase().includes(normalizedQuery) ||
    (model.description || '').toLowerCase().includes(normalizedQuery)

  // Follow the query: as soon as the open provider has no hits, jump to the
  // first one that does, so results are always on screen. The user stays in
  // control — headers remain clickable while searching.
  useEffect(() => {
    if (!normalizedQuery) return
    const openStillMatches = groups.some(g => g.provider === expanded && g.models.some(matchesQuery))
    if (openStillMatches) return
    const firstMatch = groups.find(g => g.models.some(matchesQuery))
    setExpanded(firstMatch ? firstMatch.provider : null)
  }, [normalizedQuery, groups])

  const groupListProps = {
    choice: props.currentChoice,
    setChoice: props.setChoice,
    setShowOptions: props.setShowOptions,
    onLockedItemClick: props.onLockedItemClick,
    upgradePillState: props.upgradePillState,
    buyCreditsPillState: props.buyCreditsPillState,
    onBuyCreditsClick: props.onBuyCreditsClick
  }

  const autoValue = autoModel ? modelKey(autoModel) : 'auto'
  const showAutoRow = !!autoModel || props.autoModeAvailable
  const autoSelected = props.currentChoice === autoValue || props.autoModeEnabled
  const autoDescription = autoModel?.description || 'Automatically select the best model based on your prompt'

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      props.setShowOptions(false)
    }
  }

  return (
    <div
      data-id="ai-model-selector-menu"
      onKeyDown={handleKeyDown}
      className="d-flex flex-column"
      style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}
    >
      <div className="px-2 pb-2 pt-1 rai-search-bar flex-shrink-0">
        <div className="position-relative">
          <i
            className="fa-solid fa-magnifying-glass position-absolute text-muted"
            style={{ left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem' }}
          ></i>
          <input
            type="text"
            className="form-control form-control-sm ps-4"
            data-id="ai-model-search"
            placeholder="Search models…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      {/* Only one provider is open at a time and its list caps at
          MAX_VISIBLE_MODELS rows, so this region needs no scrollbar of its own.
          Overflow stays reachable (wheel/trackpad) but paints no chrome — see
          .rai-model-scroll in remix-ai-assistant.css. */}
      <div className="rai-model-scroll" style={{ flex: '1 1 auto', minHeight: 0 }}>
        {/* Auto Mode is the first entry of the list, sitting at the same level
            as the provider headers. It sticks to the top so it stays visible
            while the list scrolls, and is highlighted as the recommended pick. */}
        {showAutoRow && (
          <button
            type="button"
            className="btn border-0 w-100 d-flex align-items-center justify-content-between py-2 rai-auto-row"
            data-id="ai-model-auto"
            data-selected={autoSelected ? 'true' : 'false'}
            onClick={() => {
              props.setShowOptions(false)
              props.setChoice(autoValue)
            }}
          >
            <span className="d-flex align-items-center text-start">
              <span
                className="me-2 d-inline-flex align-items-center justify-content-center rai-auto-icon"
                style={{ width: '1.1rem', fontSize: '0.95rem' }}
              >
                <i className="fa-solid fa-magic-wand-sparkles"></i>
              </span>
              <span className="d-flex flex-column">
                <span className="d-flex align-items-center">
                  <span className="fw-bold small rai-auto-title">Auto Mode</span>
                  <span className="badge ms-2 rai-auto-badge">Recommended</span>
                </span>
                <span className="text-wrap rai-auto-subtitle" style={{ fontSize: '0.7rem' }}>
                  {autoDescription}
                </span>
              </span>
            </span>
            {autoSelected && <i className="fa-solid fa-check rai-auto-title"></i>}
          </button>
        )}

        {/* Sign-in placeholder */}
        {signInModels.length > 0 && !normalizedQuery && (
          <GroupListMenu {...groupListProps} groupList={signInModels.map(toRow)} />
        )}

        {normalizedQuery && !groups.some(g => g.models.some(matchesQuery)) && (
          <div className="px-3 py-3 small text-muted text-center" data-id="ai-model-search-empty">
            No model matches “{query.trim()}”
          </div>
        )}

        {/* Provider accordion */}
        {groups.map((group) => {
          const meta = providerMeta(group.provider)
          const filtered = group.models.filter(matchesQuery)
          if (normalizedQuery && filtered.length === 0) return null
          const isOpen = expanded === group.provider
          const ownsSelection = group.provider === selectedProvider
          // When a provider owns the active model but is collapsed, surface that
          // model's name in the subtitle so the current choice is visible without
          // expanding.
          const subtitle = ownsSelection && !isOpen && selectedModel ? selectedModel.displayName : meta.subtitle
          return (
            <div key={group.provider} className="rai-provider-group" data-id={`ai-provider-group-${group.provider}`}>
              <button
                type="button"
                className="btn btn-light border-0 w-100 d-flex align-items-center justify-content-between py-2"
                data-id={`ai-provider-header-${group.provider}`}
                data-owns-selection={ownsSelection ? 'true' : 'false'}
                aria-expanded={isOpen}
                onClick={() => toggle(group.provider)}
              >
                <span className="d-flex align-items-center text-start">
                  <span
                    className={`me-2 d-inline-flex align-items-center justify-content-center ${ownsSelection ? 'text-primary' : 'text-muted'}`}
                    style={{ width: '1.1rem', fontSize: '0.95rem' }}
                  >
                    {providerIcon(group.provider)}
                  </span>
                  <span className="d-flex flex-column">
                    <span className={`fw-bold small ${ownsSelection ? 'text-primary' : ''}`}>{meta.label}</span>
                    {subtitle && <span className={ownsSelection && !isOpen ? 'small fst-italic' : 'text-muted'} style={{ fontSize: '0.7rem' }}>{subtitle}</span>}
                  </span>
                </span>
                <span className="d-flex align-items-center">
                  <span className="badge bg-secondary me-2" style={{ fontSize: '0.6rem' }}>{filtered.length}</span>
                  <i className={`fa-solid ${isOpen ? 'fa-chevron-down' : 'fa-chevron-right'} text-muted`} style={{ fontSize: '0.7rem' }}></i>
                </span>
              </button>
              {isOpen && (
                <ProviderModelList rows={filtered.map(toRow)} groupListProps={groupListProps} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
