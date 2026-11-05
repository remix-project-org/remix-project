import React, { useState } from 'react'
import { Features } from '@remix-api'
import { CustomTooltip } from '@remix-ui/helper'
import { Command } from './AutocompletePanel'

// A shortcut prompt is either a plain prompt string (always available) or an
// object that additionally lists the features required to use it. Gated
// prompts behave like the permission-locked slash commands (e.g. Load Skills):
// when the user lacks a required feature they see a lock + upsell/sign-in badge
// and clicking routes to the plan manager instead of filling the composer.
type ShortcutPrompt = string | { text: string; requiredFeatures?: string[] }

interface ShortcutCategory {
  id: string
  label: string
  prompts: ShortcutPrompt[]
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    id: 'code',
    label: 'Code',
    prompts: [
      { text: 'Write a Solidity ERC20 token with mint and burn functions', requiredFeatures: [Features.AI_SOLCODER]},
      { text: 'Add an ownable access control to a contract', requiredFeatures: [Features.AI_SOLCODER]},
      { text: '/compile fix any errors in the active file', requiredFeatures: [Features.AI_SOLCODER]},
    ],
  },
  {
    id: 'explain',
    label: 'Explain',
    prompts: [
      { text: 'Explain what this contract does line by line', requiredFeatures: [Features.AI_SOLCODER]},
      { text: 'What are the security risks in this code?', requiredFeatures: [Features.AI_SOLCODER]},
      { text: 'What does this function return and when does it revert?', requiredFeatures: [Features.AI_SOLCODER]},
    ],
  },
  {
    id: 'learn',
    label: 'Learn',
    prompts: [
      { text: 'What is a smart contract?', requiredFeatures: [Features.AI_SOLCODER]},
      { text: 'How does gas work in Ethereum?', requiredFeatures: [Features.AI_SOLCODER]},
      { text: 'What is the difference between memory and storage in Solidity?', requiredFeatures: [Features.AI_SOLCODER]},
    ],
  },
  {
    id: 'deploy',
    label: 'Deploy',
    prompts: [
      { text: '/deploy this contract to Sepolia testnet', requiredFeatures: [Features.AI_SOLCODER]},
      { text: 'How do I verify my contract on Etherscan?', requiredFeatures: [Features.AI_SOLCODER]},
      { text: 'What network should I use for testing?', requiredFeatures: [Features.AI_SOLCODER]},
    ],
  },
]

export interface ComposerActionGroup {
  id: string
  label: string
  commands: Command[]
}

interface ComposerMenuProps {
  /** Command groups (Audit, Skills…). A group with one command runs it directly. */
  actionGroups: ComposerActionGroup[]
  hasFeature: (feature: string) => boolean
  isAuthenticated: boolean
  getRequiredPlanName?: (feature: string) => string | null
  onUpgradeRequired?: (name: string, missingFeature: string) => void
  /** Fills the input with a canned prompt. */
  onPickPrompt: (text: string, categoryId: string, index: number) => void
  onRunCommand: (command: Command) => void
  onOpenGroup?: (groupId: string) => void
  onClose: () => void
  // Attach rows: left out when the host has no attachment support.
  attach?: { enabled: boolean, hint: string, onClick: () => void }
  screenshot?: { enabled: boolean, hint: string, onClick: () => void }
}

/** Command name in AI colour, the rest of a "/cmd text" prompt as plain text. */
const PromptText = ({ text }: { text: string }) => {
  if (!text.startsWith('/')) return <>{text}</>
  const space = text.indexOf(' ')
  return space === -1
    ? <span className="ai-cmd">{text}</span>
    : <><span className="ai-cmd">{text.slice(0, space)}</span>{text.slice(space)}</>
}

/**
 * The composer's "+" menu: attachments, canned prompts and the tool commands,
 * opening upward over the chat. Two levels: categories, then their rows.
 */
export function ComposerMenu(props: ComposerMenuProps) {
  const [groupId, setGroupId] = useState<string | null>(null)
  const openGroup = (id: string) => {
    setGroupId(id)
    props.onOpenGroup?.(id)
  }

  const missingOf = (requiredFeatures?: string[]) => requiredFeatures?.find((f) => !props.hasFeature(f)) ?? null
  const lockBadge = (missing: string, dataId: string) => (
    <span className="badge rounded-pill ai-menu-lock" data-id={dataId}>
      {!props.isAuthenticated ? 'Sign in' : (props.getRequiredPlanName?.(missing) ?? 'Upgrade')}
    </span>
  )

  const runCommand = (cmd: Command) => {
    props.onClose()
    const missing = missingOf(cmd.requiredFeatures)
    if (missing) {
      props.onUpgradeRequired?.(cmd.name, missing)
      return
    }
    props.onRunCommand(cmd)
  }

  const category = SHORTCUT_CATEGORIES.find((c) => c.id === groupId)
  const actionGroup = props.actionGroups.find((g) => g.id === groupId)

  if (category || actionGroup) {
    return (
      <div className="ai-menu" data-id="remix-ai-composer-menu" role="menu">
        <button type="button" className="ai-menu-back" onClick={() => setGroupId(null)} data-id="remix-ai-composer-menu-back">
          <i className="fas fa-chevron-left"></i>{category ? category.label : actionGroup?.label}
        </button>
        {category && category.prompts.map((prompt, i) => {
          const text = typeof prompt === 'string' ? prompt : prompt.text
          const missing = missingOf(typeof prompt === 'string' ? undefined : prompt.requiredFeatures)
          return (
            <button
              type="button"
              key={i}
              className="ai-menu-item"
              data-id={`shortcut-prompt-${i}`}
              onClick={() => {
                // Locked prompt → route to the plan manager (or sign-in when
                // anonymous) instead of dropping it into the composer.
                props.onClose()
                if (missing) props.onUpgradeRequired?.(text, missing)
                else props.onPickPrompt(text, category.id, i)
              }}
            >
              <span><PromptText text={text} /></span>
              {missing && lockBadge(missing, `shortcut-prompt-upgrade-${i}`)}
            </button>
          )
        })}
        {actionGroup && actionGroup.commands.map((cmd) => {
          const missing = missingOf(cmd.requiredFeatures)
          return (
            <button type="button" key={cmd.name} className="ai-menu-item" data-id={`shortcut-tool-${cmd.name}`} onClick={() => runCommand(cmd)}>
              <span><span className="ai-cmd">/{cmd.name}</span><small>{cmd.description}</small></span>
              {missing && lockBadge(missing, `shortcut-tool-upgrade-${cmd.name}`)}
            </button>
          )
        })}
      </div>
    )
  }

  // Disabled rows keep their tooltip, so the reason stays discoverable.
  const attachRow = (row: NonNullable<ComposerMenuProps['attach']>, icon: string, label: string, dataId: string) => (
    <CustomTooltip placement="right" tooltipText={row.hint}>
      <span className="d-block">
        <button
          type="button"
          className="ai-menu-item"
          data-id={dataId}
          disabled={!row.enabled}
          aria-label={label}
          onClick={() => {
            props.onClose()
            row.onClick()
          }}
        >
          <i className={`fas ${icon} ai-menu-icon`}></i><span>{label}</span>
        </button>
      </span>
    </CustomTooltip>
  )

  return (
    <div className="ai-menu" data-id="remix-ai-composer-menu" role="menu">
      {props.attach && attachRow(props.attach, 'fa-paperclip', 'Attach a file', 'remix-ai-attach-btn')}
      {props.screenshot && attachRow(props.screenshot, 'fa-camera', 'Screenshot of the IDE', 'remix-ai-screenshot-btn')}
      {(props.attach || props.screenshot) && <div className="ai-menu-sep"></div>}
      <div className="ai-menu-head">Prompts</div>
      {SHORTCUT_CATEGORIES.map((c) => (
        <button type="button" key={c.id} className="ai-menu-item" data-id={`shortcut-btn-${c.id}`} onClick={() => openGroup(c.id)}>
          <span>{c.label}</span><i className="fas fa-chevron-right ai-menu-chevron"></i>
        </button>
      ))}
      {props.actionGroups.length > 0 && <div className="ai-menu-sep"></div>}
      {props.actionGroups.map((g) => {
        const direct = g.commands.length === 1 && g.commands[0].action ? g.commands[0] : null
        if (direct) {
          const missing = missingOf(direct.requiredFeatures)
          return (
            <button type="button" key={g.id} className="ai-menu-item" data-id={`shortcut-btn-${g.id}`} onClick={() => runCommand(direct)}>
              <span>{g.label}<small><span className="ai-cmd">/{direct.name}</span></small></span>
              {missing && lockBadge(missing, `shortcut-tool-upgrade-${direct.name}`)}
            </button>
          )
        }
        return (
          <button type="button" key={g.id} className="ai-menu-item" data-id={`shortcut-btn-${g.id}`} onClick={() => openGroup(g.id)}>
            <span>{g.label}</span><i className="fas fa-chevron-right ai-menu-chevron"></i>
          </button>
        )
      })}
      <div className="ai-menu-foot">Type <kbd>/</kbd> in the input to see every command</div>
    </div>
  )
}
