import React, { useEffect, useState, useRef } from 'react'
import { Features } from '@remix-api'

export interface Command {
  name: string
  description: string
  shortcut?: string
  category?: string
  action?: () => void
  disabled?: boolean
  requiredFeatures: string[] // List of required features for this command
  /** Contextual hint shown below the input after the command is inserted (prompt-template commands only) */
  hint?: string
}

interface AutocompletePanelProps {
  isVisible: boolean
  searchTerm: string
  onSelect: (command: Command) => void
  position?: { top: number; left: number }
  themeTracker?: any
  selectedIndex: number
  onSelectedIndexChange: (index: number) => void
  extraCommands?: Command[]
  /** Predicate telling whether the signed-in user has a given feature. Defaults to always-true. */
  hasFeature?: (feature: string) => boolean
  /** Whether the user is signed in. When false, locked commands surface a "Sign in" badge instead of a plan name. */
  isAuthenticated?: boolean
  /** Called when the user picks a command they are not entitled to. Receives the missing feature key. */
  onUpgradeRequired?: (command: Command, missingFeature: string) => void
  /** Resolves a missing feature to the cheapest plan that grants it (e.g. "Pro") for the upsell badge. */
  getRequiredPlanName?: (feature: string) => string | null
}

// Available commands - this could be moved to a config file or fetched dynamically
export const AVAILABLE_COMMANDS: Command[] = [
  // Core commands
  // { name: 'generate', description: 'Generate smart contracts or code', shortcut: '/g', category: 'Generate' },
  // { name: 'workspace', description: 'Generate a new workspace', shortcut: '/w', category: 'Generate' },
  // { name: 'setAssistant', description: 'Set AI assistant provider', category: 'Settings' },
  // { name: 'ollama', description: 'Configure Ollama integration', category: 'Settings' },

  // Compilation & Analysis
  { name: 'compile', description: 'Compile contract', category: 'Build', hint: 'optional instructions, or leave blank to compile the current file', requiredFeatures: [Features.AI_SOLCODER]},
  // { name: 'slither', description: 'Run Slither security analysis', category: 'Analysis' },
  // { name: 'mythril', description: 'Run Mythril security scan', category: 'Analysis' },

  // Deployment & Verification
  { name: 'deploy', description: 'Deploy contract to network', category: 'Deploy', hint: 'name the contract and any constructor arguments, or leave blank to deploy the current one', requiredFeatures: [Features.AI_SOLCODER]},
  { name: 'etherscan', description: 'Fetch contract from Etherscan and call the Etherscan service', category: 'Import', hint: 'paste a contract address (with network) to fetch and analyze it', requiredFeatures: [Features.MCP_ETHERSCAN]},
  // { name: 'verify', description: 'Verify contract on block explorer', category: 'Deploy' },

  // Testing & Debugging
  // { name: 'test', description: 'Run contract tests', category: 'Test' },
  // { name: 'debug', description: 'Debug transaction', category: 'Debug' },

  // DeFi & Integrations
  { name: 'thegraph', description: 'Fetch data from The Graph', category: 'Data', hint: 'describe the data to query from a subgraph', requiredFeatures: [Features.MCP_THEGRAPH]},
  { name: 'alchemy', description: 'Fetch data from Alchemy', category: 'Data', hint: 'describe the on-chain data to fetch (address, network, …)', requiredFeatures: [Features.MCP_ALCHEMY]},
  { name: 'circle', description: 'Circle integration', category: 'DeFi', hint: 'describe the Circle API task', requiredFeatures: [Features.MCP_CIRCLE]},
  // { name: 'uniswap', description: 'Uniswap integration', category: 'DeFi' },
  // { name: 'aave', description: 'Aave integration', category: 'DeFi' },

  // Documentation & Help
  // { name: 'help', description: 'Show available commands', category: 'Help' },
  // { name: 'docs', description: 'Open documentation', category: 'Help' },

  // Frontend & UI
  { name: 'create-dapp', description: 'Create a DApp frontend (QuickDapp agent)', category: 'Frontend', hint: 'describe your DApp, or leave blank to build from your deployed contracts', requiredFeatures: [Features.DAPP_QUICKDAPP]},
]

export const AutocompletePanel: React.FC<AutocompletePanelProps> = ({
  isVisible,
  searchTerm,
  onSelect,
  position,
  themeTracker,
  selectedIndex,
  onSelectedIndexChange,
  extraCommands = [],
  hasFeature,
  isAuthenticated = true,
  onUpgradeRequired,
  getRequiredPlanName
}) => {
  const [filteredCommands, setFilteredCommands] = useState<Command[]>([])
  const panelRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  // Returns the first required feature the user is missing, or null when the
  // command is fully unlocked. When no predicate is supplied we assume the
  // user is entitled (keeps the panel usable in tests / standalone previews).
  const getMissingFeature = (cmd: Command): string | null => {
    if (!hasFeature || !cmd.requiredFeatures?.length) return null
    return cmd.requiredFeatures.find((f) => !hasFeature(f)) ?? null
  }

  useEffect(() => {
    if (!searchTerm || !searchTerm.startsWith('/')) {
      setFilteredCommands([])
      return
    }

    const allCommands = [...AVAILABLE_COMMANDS, ...extraCommands]
    const search = searchTerm.toLowerCase().slice(1) // Remove the '/' prefix

    // If search is empty (just '/'), show all commands
    const filtered = search.length === 0
      ? allCommands
      : allCommands.filter(cmd =>
        cmd.name.toLowerCase().includes(search.toLowerCase()) ||
          cmd.shortcut?.toLowerCase().includes(search.toLowerCase()) ||
          cmd.description.toLowerCase().includes(search.toLowerCase())
      )

    // Sort by relevance only if there's a search term
    if (search.length > 0) {
      filtered.sort((a, b) => {
        const aName = a.name.toLowerCase()
        const bName = b.name.toLowerCase()
        const aShortcut = a.shortcut?.toLowerCase() || ''
        const bShortcut = b.shortcut?.toLowerCase() || ''

        // Exact match
        if (aName === search || aShortcut === search) return -1
        if (bName === search || bShortcut === search) return 1

        // Prefix match
        if (aName.startsWith(search) || aShortcut.startsWith(search)) return -1
        if (bName.startsWith(search) || bShortcut.startsWith(search)) return 1

        // Alphabetical
        return aName.localeCompare(bName)
      })
    }

    setFilteredCommands(filtered)
  }, [searchTerm, extraCommands])

  useEffect(() => {
    // Ensure selected item is visible
    if (selectedIndex >= 0 && selectedIndex < itemRefs.current.length) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      })
    }
  }, [selectedIndex])

  useEffect(() => {
    // Reset selected index when filtered commands change
    if (selectedIndex >= filteredCommands.length) {
      onSelectedIndexChange(Math.max(0, filteredCommands.length - 1))
    }
  }, [filteredCommands.length, selectedIndex, onSelectedIndexChange])

  if (!isVisible || filteredCommands.length === 0) {
    return null
  }

  const isDarkTheme = themeTracker?.name?.toLowerCase() === 'dark'
  const backgroundColor = 'var(--bs-body-bg)'
  const borderColor = 'var(--bs-border-color)'
  const hoverColor = 'var(--custom-onsurface-layer-1)'
  const selectedColor = 'var(--custom-onsurface-layer-1)'
  const textColor = 'var(--bs-emphasis-color)'
  const secondaryTextColor = 'var(--bs-body-color)'
  const categoryColor = 'var(--bs-gray)'

  // Group commands by category
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    const category = cmd.category || 'Other'
    if (!acc[category]) acc[category] = []
    acc[category].push(cmd)
    return acc
  }, {} as Record<string, Command[]>)

  // Create flat list of commands for index tracking
  const flatCommands = Object.entries(groupedCommands).flatMap(([_, commands]) => commands)

  return (
    <div
      ref={panelRef}
      className="position-absolute rounded-3 shadow-lg overflow-hidden"
      style={{
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: '8px',
        maxHeight: '350px',
        backgroundColor,
        border: `1px solid ${borderColor}`,
        zIndex: 1000,
        boxShadow: isDarkTheme
          ? '0 10px 25px rgba(0, 0, 0, 0.5), 0 5px 10px rgba(0, 0, 0, 0.3)'
          : '0 10px 25px rgba(0, 0, 0, 0.1), 0 5px 10px rgba(0, 0, 0, 0.05)'
      }}
      data-id="autocomplete-panel"
    >
      <div className="px-2 py-2 border-bottom d-flex align-items-center" style={{
        backgroundColor: 'var(--custom-onsurface-layer-1)',
        borderColor,
        color: secondaryTextColor,
        fontSize: '0.85rem'
      }}>
        <span style={{ opacity: 0.9 }}>Choose an action and complete with your prompt</span>
      </div>
      <div className="overflow-auto" style={{ maxHeight: '300px' }}>
        {Object.entries(groupedCommands).map(([category, commands]) => {
          return (
            <div className='py-1 px-1 border-bottom border-[#3F4455]' key={category}>
              <div
                className="px-2 py-1 small font-weight-bold text-uppercase"
                style={{
                  color: categoryColor,
                  fontSize: '0.7rem',
                  letterSpacing: '0.05em',
                  backgroundColor: 'var(--bs-body-bg)',
                }}
              >
                {category === 'Build'}
                {category === 'Deploy'}
                {category === 'Import'}
                {category === 'Data'}
                {category === 'DeFi'}
                {category === 'Frontend'}
                {category}
              </div>
              {commands.map((cmd) => {
                const index = flatCommands.indexOf(cmd)
                const isSelected = index === selectedIndex
                const missingFeature = getMissingFeature(cmd)
                const isLocked = missingFeature !== null
                // Cheapest plan that unlocks this command (e.g. "Pro"),
                // falls back to a generic "Upgrade" label when unknown.
                const planName = isLocked ? getRequiredPlanName?.(missingFeature as string) ?? null : null

                return (
                  <button
                    key={cmd.name}
                    ref={(el) => itemRefs.current[index] = el}
                    className="d-flex align-items-center justify-content-between w-100 px-2 py-1 border-0 rounded-1 text-left"
                    style={{
                      backgroundColor: isSelected ? selectedColor : 'var(--bs-body-bg)',
                      color: cmd.disabled ? 'var(--bs-secondary-color)' : textColor,
                      cursor: cmd.disabled ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s ease',
                      borderLeft: isSelected ? '3px solid var(--custom-ai-color)' : '3px solid transparent',
                      opacity: cmd.disabled ? 0.6 : 1
                    }}
                    onMouseEnter={(e) => {
                      if (!cmd.disabled) {
                        e.currentTarget.style.backgroundColor = isSelected ? selectedColor : hoverColor
                        onSelectedIndexChange(index)
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!cmd.disabled) {
                        e.currentTarget.style.backgroundColor = isSelected ? selectedColor : 'var(--bs-body-bg)'
                      }
                    }}
                    onClick={() => {
                      if (cmd.disabled) return
                      // A locked command (missing entitlement) routes to the
                      // plan manager instead of running. We never execute it.
                      if (isLocked) {
                        onUpgradeRequired?.(cmd, missingFeature as string)
                        return
                      }
                      onSelect(cmd)
                    }}
                    data-id={`autocomplete-item-${cmd.name}`}
                    disabled={cmd.disabled}
                  >
                    <div className="d-flex flex-column">
                      <div className="d-flex align-items-center">
                        <span className="font-weight-medium" style={{ fontSize: '0.78rem', opacity: cmd.disabled ? 0.6 : 1 }}>
                      /{cmd.name}
                        </span>
                        {isLocked && (
                          <i
                            className="fa-solid fa-lock ms-2"
                            style={{ color: 'var(--bs-gray)', fontSize: '0.65rem' }}
                            aria-hidden="true"
                          />
                        )}
                        {cmd.shortcut && (
                          <span
                            className="ms-2 px-2 py-1 rounded-pill small"
                            style={{
                              backgroundColor: 'var(--bs-body-bg)',
                              color: 'var(--custom-ai-color)',
                              fontSize: '0.7rem',
                              fontWeight: 500
                            }}
                          >
                            {cmd.shortcut}
                          </span>
                        )}
                      </div>
                      <span
                        className="small"
                        style={{
                          color: cmd.disabled ? 'var(--bs-warning)' : secondaryTextColor,
                          fontSize: '0.78rem',
                          marginTop: '2px',
                          opacity: cmd.disabled ? 1 : 0.85,
                          textAlign: 'left',
                          fontStyle: cmd.disabled ? 'italic' : 'normal'
                        }}
                      >
                        {cmd.description}
                      </span>
                    </div>
                    {isLocked ? (
                      <span
                        className="badge rounded-pill ms-2"
                        style={{
                          backgroundColor: 'var(--custom-ai-color)',
                          color: 'var(--bs-body-bg)',
                          fontSize: '0.65rem',
                          padding: '3px 8px',
                          fontWeight: 'normal',
                          whiteSpace: 'nowrap'
                        }}
                        data-id={`autocomplete-upgrade-${cmd.name}`}
                      >
                        {!isAuthenticated ? 'Sign in' : (planName ?? 'Upgrade')}
                      </span>
                    ) : isSelected && !cmd.disabled && (
                      <span
                        className="badge rounded-pill ms-2"
                        style={{
                          backgroundColor: 'var(--custom-primary)',
                          color: 'var(--bs-body-bg)',
                          fontSize: '0.65rem',
                          padding: '3px 8px',
                          fontWeight: 'normal'
                        }}
                      >
                    ↵ Enter
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}