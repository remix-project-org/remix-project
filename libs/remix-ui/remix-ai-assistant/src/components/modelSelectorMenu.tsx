import React, { Dispatch, useEffect, useMemo, useRef, useState } from 'react'
import { SiOpenai, SiAnthropic, SiOllama, SiAmazonwebservices } from 'react-icons/si'
import { LockedPillState } from './contextOptMenu'
import { groupListType } from '../types/componentTypes'
import { AIModel, modelKey, byokKeyState, isAutoModelId, isCheapModel, modelVendor, type ByokKeyState } from '@remix/remix-ai-core'

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  mistralai: 'Mistral AI',
  openrouter: 'OpenRouter',
  bedrock: 'AWS Bedrock',
  ollama: 'Local (Ollama)'
}

const providerLabel = (provider: string) => PROVIDER_LABELS[provider] ?? provider

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

const isSignInModel = (model: AIModel) => model.id === '__signin__'

const isAutoModel = (model: AIModel) => isAutoModelId(model.id)

/** Backend descriptions carry markdown emphasis; a one-line row shows plain text. */
const plainText = (text: string) => (text || '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim()

/** The shape the locked / API key hand-offs expect (shared with GroupListMenu). */
const toItem = (model: AIModel): groupListType => {
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

/**
 * BYOK state of a whole provider section: `own-key` as soon as one of its rows
 * runs on the user's key, `needs-key` when the section is only waiting for one.
 */
const groupKeyState = (
  models: AIModel[],
  keyPresence: Partial<Record<AIModel['provider'], boolean>>
): ByokKeyState | undefined => {
  const states = models.map(model => byokKeyState(model, keyPresence))
  if (states.some(state => state === 'own-key')) return 'own-key'
  return states.some(state => state === 'needs-key') ? 'needs-key' : undefined
}

/** One entry the keyboard can land on, in screen order. */
interface MenuRow {
  key: string
  model?: AIModel
  pick: () => void
}

interface ModelRowProps {
  model: AIModel
  selected: boolean
  active: boolean
  needsKey: boolean
  /** Text before the description of a locked row ("Requires Pro", "Coming soon"). */
  lockNote?: string
  indent: boolean
  onHover: () => void
  onPick: () => void
}

const ModelRow: React.FC<ModelRowProps> = ({ model, selected, active, needsKey, lockNote, indent, onHover, onPick }) => {
  const item = toItem(model)
  const description = plainText(model.description)
  const title = needsKey
    ? 'Add your API key to use this model'
    : lockNote ? [lockNote, description].filter(Boolean).join(' · ') : description
  return (
    <button
      type="button"
      className={`rai-mm-row ${indent ? 'is-indented' : ''} ${active ? 'is-active' : ''} ${needsKey ? 'is-dim' : ''}`}
      data-id={item.dataId}
      data-row={item.stateValue}
      data-locked={item.isLocked ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      title={title || undefined}
      onMouseMove={onHover}
      onClick={onPick}
    >
      <span className="rai-mm-text">
        <span className="rai-mm-name">{model.displayName}</span>
        {(lockNote || description) && (
          <span className="rai-mm-desc">
            {lockNote && <span className="rai-mm-req">{lockNote}{description ? ' · ' : ''}</span>}
            {description}
          </span>
        )}
      </span>
      {selected && <i className="fa-solid fa-check rai-mm-check"></i>}
      {lockNote && <i className="fa-solid fa-lock rai-mm-lock"></i>}
    </button>
  )
}

interface ProviderGroup {
  provider: string
  models: AIModel[]
  minSortOrder: number
}

export interface ModelSelectorMenuProps {
  availableModels: AIModel[]
  /** `'auto'` or `modelKey(selectedModel)` — the currently active choice. */
  currentChoice: string
  setChoice: Dispatch<React.SetStateAction<any>>
  setShowOptions: Dispatch<React.SetStateAction<boolean>>
  onLockedItemClick?: (item: groupListType) => void
  upgradePillState?: LockedPillState
  buyCreditsPillState?: LockedPillState
  /** Transport provider → whether the user has stored a key for it. Drives the
   *  "Your API key" / "Add key" notes on provider headers. */
  byokKeyPresence?: Partial<Record<AIModel['provider'], boolean>>
  /** Hand-off to the API key settings, from a header or row waiting for a key. */
  onAddApiKeyClick?: (item: groupListType) => void
  /** Plan that unlocks a feature, for "Requires <plan>" on locked rows. */
  getRequiredPlanName?: (feature: string) => string | null
  cheapOnly?: boolean
  /** Rendered between the search field and the list (the low-cost switch). */
  children?: React.ReactNode
  /** Shown under the open "Local (Ollama)" group: the installed local models. */
  ollamaSection?: React.ReactNode
}

export default function ModelSelectorMenu(props: ModelSelectorMenuProps) {
  const [query, setQuery] = useState('')
  // The filter is driven from the composer's toggle, so the menu only reads it.
  const cheapOnly = !!props.cheapOnly
  const keyPresence = props.byokKeyPresence ?? {}

  // Locked rows lead to the plan page. When neither the upgrade nor the
  // buy-credits path is offered, they lead nowhere and stay hidden, except
  // "Coming soon" ones, which say so.
  const upgradeState: LockedPillState = props.upgradePillState ?? 'available'
  const buyCreditsState: LockedPillState = props.buyCreditsPillState ?? 'hidden'
  const lockedLeadsToPlans = upgradeState === 'available' || buyCreditsState === 'available'
  const lockedComingSoon = !lockedLeadsToPlans && (upgradeState === 'coming_soon' || buyCreditsState === 'coming_soon')

  const needsKey = (model: AIModel) => byokKeyState(model, keyPresence) === 'needs-key'

  /** A locked row stays visible only if it has somewhere to send the user. */
  const isVisible = (model: AIModel) =>
    model.available || needsKey(model) || lockedLeadsToPlans || lockedComingSoon

  const lockNote = (model: AIModel): string | undefined => {
    if (model.available || needsKey(model)) return undefined
    if (lockedComingSoon) return 'Coming soon'
    const plan = model.requiredFeature ? props.getRequiredPlanName?.(model.requiredFeature) : null
    return plan ? `Requires ${plan}` : 'Requires an upgrade'
  }

  // Ungrouped row shown above the providers when signed out.
  const signInModels = useMemo(
    () => props.availableModels.filter(isSignInModel),
    [props.availableModels]
  )

  // The OpenRouter auto entry, hoisted out of its provider group.
  const autoModel = useMemo(
    () => props.availableModels.find(m => !isSignInModel(m) && isAutoModel(m)),
    [props.availableModels]
  )

  const groups = useMemo<ProviderGroup[]>(() => {
    const byProvider = new Map<string, AIModel[]>()
    for (const model of props.availableModels) {
      if (isSignInModel(model) || isAutoModel(model)) continue
      if (cheapOnly && !isCheapModel(model)) continue
      const vendor = modelVendor(model)
      const list = byProvider.get(vendor) ?? []
      list.push(model)
      byProvider.set(vendor, list)
    }
    return Array.from(byProvider.entries())
      .map(([provider, models]) => ({
        provider,
        models: [...models].sort((a, b) => a.sortOrder - b.sortOrder),
        minSortOrder: models.reduce((min, m) => Math.min(min, m.sortOrder), Number.POSITIVE_INFINITY)
      }))
      .sort((a, b) => a.minSortOrder - b.minSortOrder)
  }, [props.availableModels, cheapOnly])

  const selectedModel = useMemo(() => {
    if (!props.currentChoice || props.currentChoice === 'auto') return undefined
    return props.availableModels.find(m => !isSignInModel(m) && !isAutoModel(m) && modelKey(m) === props.currentChoice)
  }, [props.availableModels, props.currentChoice])
  const selectedProvider = selectedModel ? modelVendor(selectedModel) : undefined

  const [expanded, setExpanded] = useState<string | null>(selectedProvider ?? null)

  useEffect(() => {
    setExpanded(selectedProvider ?? null)
  }, [selectedProvider])

  const normalizedQuery = query.trim().toLowerCase()
  const searching = !!normalizedQuery
  const matchesQuery = (model: AIModel) =>
    !searching ||
    model.displayName.toLowerCase().includes(normalizedQuery) ||
    (model.description || '').toLowerCase().includes(normalizedQuery)

  // Rows each provider shows; a search opens every provider with a hit.
  const shownGroups = groups
    .map(group => ({ ...group, rows: group.models.filter(m => isVisible(m) && matchesQuery(m)) }))
    .filter(group => group.rows.length > 0)
  const isOpen = (provider: string) => searching || expanded === provider

  const close = () => props.setShowOptions(false)

  const pickModel = (model: AIModel) => {
    const item = toItem(model)
    if (needsKey(model) && props.onAddApiKeyClick) {
      // Missing key, not a missing entitlement: send the user to the key
      // settings rather than the plan page.
      close()
      props.onAddApiKeyClick(item)
    } else if (!model.available) {
      if (lockedComingSoon && !isSignInModel(model)) return
      close()
      props.onLockedItemClick?.(item)
    } else {
      close()
      props.setChoice(item.stateValue)
    }
  }

  const autoValue = autoModel ? modelKey(autoModel) : 'auto'
  const showAutoRow = !!autoModel && (!cheapOnly || isCheapModel(autoModel)) && matchesQuery(autoModel)
  const autoSelected = props.currentChoice === autoValue

  // Rows the arrow keys walk through, in screen order.
  const rows: MenuRow[] = [
    ...(showAutoRow ? [{ key: autoValue, pick: () => { close(); props.setChoice(autoValue) } }] : []),
    ...(searching ? [] : signInModels).map(model => ({ key: modelKey(model), model, pick: () => pickModel(model) })),
    ...shownGroups.flatMap(group => isOpen(group.provider)
      ? group.rows.map(model => ({ key: modelKey(model), model, pick: () => pickModel(model) }))
      : [])
  ]
  const [active, setActive] = useState(-1)
  const activeKey = rows[active]?.key
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setActive(searching ? 0 : -1)
  }, [normalizedQuery, cheapOnly])

  useEffect(() => {
    if (!activeKey) return
    const el = Array.from(scrollRef.current?.querySelectorAll<HTMLElement>('[data-row]') ?? [])
      .find(row => row.dataset.row === activeKey)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeKey])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(i => Math.min(rows.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && rows[active]) {
      e.preventDefault()
      rows[active].pick()
    }
  }

  const hover = (key: string) => () => {
    const index = rows.findIndex(row => row.key === key)
    if (index !== active) setActive(index)
  }

  const renderRow = (model: AIModel, indent: boolean) => {
    const key = modelKey(model)
    return (
      <ModelRow
        key={key}
        model={model}
        selected={model.available && props.currentChoice === key}
        active={activeKey === key}
        needsKey={needsKey(model)}
        lockNote={isSignInModel(model) ? undefined : lockNote(model)}
        indent={indent}
        onHover={hover(key)}
        onPick={() => pickModel(model)}
      />
    )
  }

  return (
    <div
      data-id="ai-model-selector-menu"
      onKeyDown={handleKeyDown}
      className="d-flex flex-column"
      style={{ flex: '1 1 auto', minHeight: 0, overflow: 'hidden' }}
    >
      <div className="rai-mm-search flex-shrink-0">
        <i className="fa-solid fa-magnifying-glass"></i>
        <input
          type="text"
          data-id="ai-model-search"
          placeholder="Search models…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {props.children}

      {/* One scroll area for the whole list, so the wheel never reaches the
          chat behind it (#7928). Provider headers stick while their models scroll. */}
      <div className="rai-mm-scroll" ref={scrollRef}>
        {showAutoRow && (
          <button
            type="button"
            className={`rai-mm-row rai-mm-auto ${activeKey === autoValue ? 'is-active' : ''}`}
            data-id="ai-model-auto"
            data-row={autoValue}
            data-selected={autoSelected ? 'true' : 'false'}
            onMouseMove={hover(autoValue)}
            onClick={() => {
              close()
              props.setChoice(autoValue)
            }}
          >
            <span className="rai-mm-brand rai-mm-auto-icon"><i className="fa-solid fa-magic-wand-sparkles"></i></span>
            <span className="rai-mm-text">
              <span className="rai-mm-name">{autoModel?.displayName || 'Auto'}<span className="rai-mm-rec">Recommended</span></span>
              {autoModel?.description && <span className="rai-mm-desc" title={plainText(autoModel.description)}>{plainText(autoModel.description)}</span>}
            </span>
            {autoSelected && <i className="fa-solid fa-check rai-mm-check"></i>}
          </button>
        )}

        {!searching && signInModels.map(model => renderRow(model, false))}

        {cheapOnly && groups.length === 0 && (
          <div className="rai-mm-empty" data-id="ai-model-cheap-empty">
            No low-cost model is available on your plan
          </div>
        )}

        {searching && shownGroups.length === 0 && !showAutoRow && (
          <div className="rai-mm-empty" data-id="ai-model-search-empty">
            No model matches “{query.trim()}”
          </div>
        )}

        {shownGroups.map((group) => {
          const label = providerLabel(group.provider)
          const open = isOpen(group.provider)
          const ownsSelection = group.provider === selectedProvider
          const keyState = groupKeyState(group.models, keyPresence)
          return (
            <div key={group.provider} className="rai-mm-group" data-id={`ai-provider-group-${group.provider}`}>
              <button
                type="button"
                className="rai-mm-head"
                data-id={`ai-provider-header-${group.provider}`}
                data-owns-selection={ownsSelection ? 'true' : 'false'}
                aria-expanded={open}
                onClick={() => setExpanded(prev => (prev === group.provider ? null : group.provider))}
              >
                <span className={`rai-mm-brand ${ownsSelection ? 'is-on' : ''}`}>{providerIcon(group.provider)}</span>
                <span className="rai-mm-head-text">
                  <span className="rai-mm-head-name">{label}</span>
                  {ownsSelection && !open && selectedModel && (
                    <span className="rai-mm-head-sub">{selectedModel.displayName}</span>
                  )}
                </span>
                {keyState === 'own-key' && (
                  <span
                    className="rai-mm-key-own"
                    data-id={`ai-provider-key-${group.provider}`}
                    data-key-state={keyState}
                    title="Runs on your API key"
                  >
                    <i className="fa-solid fa-key"></i>Your API key
                  </span>
                )}
                {keyState === 'needs-key' && (
                  <span
                    role="button"
                    className="rai-mm-key-link"
                    data-id={`ai-provider-key-${group.provider}`}
                    data-key-state={keyState}
                    title={`Add your ${label} API key`}
                    onClick={(e) => {
                      // The note sits inside the header: don't also toggle it.
                      e.stopPropagation()
                      close()
                      props.onAddApiKeyClick?.(toItem(group.models[0]))
                    }}
                  >
                    <i className="fa-solid fa-key"></i>Add key
                  </span>
                )}
                <span className="rai-mm-count">{group.rows.length}</span>
                <i className={`fa-solid fa-chevron-${open ? 'down' : 'right'} rai-mm-chev`}></i>
              </button>
              {open && (
                <div className="rai-mm-models">
                  {group.rows.map(model => renderRow(model, true))}
                  {group.provider === 'ollama' && props.ollamaSection}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
