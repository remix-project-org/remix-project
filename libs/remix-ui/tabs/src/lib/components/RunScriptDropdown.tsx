import React from 'react'
import DropdownMenu, { MenuItem } from './DropdownMenu'
import { ArrowRightBig, NewScript, ScriptConfig } from '@remix-ui/tabs'

interface RunScriptDropdownProps {
  disabled?: boolean
  plugin?: any
  onNotify?: (msg: string) => void
  onRun: (runnerKey: string) => void
}

const RunScriptDropdown: React.FC<RunScriptDropdownProps> = ({ plugin, disabled, onRun, onNotify }) => {
  const items: MenuItem[] = [
    { label: 'Create a new script', icon: <NewScript />, onClick: () => onRun('new_script'), borderBottom: true, dataId: 'create-new-script-menu-item' },
    { label: 'Run with Default', icon: <ArrowRightBig />, onClick: () => onRun('default'), dataId: 'run-with-default-menu-item' },
    { label: 'Run with Ethers v6', icon: <ArrowRightBig />, onClick: () => onRun('ethers6'), dataId: 'run-with-ethers6-menu-item' },
    { label: 'Run with ZkSync-ethers v6', icon: <ArrowRightBig />, onClick: () => onRun('zksyncv6'), dataId: 'run-with-zksyncv6-menu-item' },
    { label: 'Run with Viem', icon: <ArrowRightBig />, onClick: () => onRun('viem'), dataId: 'run-with-viem-menu-item' },
    { label: 'Run with Chainlink', icon: <ArrowRightBig />, onClick: () => onRun('chainlink'), dataId: 'run-with-chainlink-menu-item' },
    { label: 'Run with Noir', icon: <ArrowRightBig />, onClick: () => onRun('noir'), dataId: 'run-with-noir-menu-item' },
    { label: 'Run with Circles', icon: <ArrowRightBig />, onClick: () => onRun('circles-sdk'), dataId: 'run-with-circles-menu-item' },
    { label: 'Open script configuration', icon: <ScriptConfig />, borderTop: true, onClick: async () => {
      await plugin.call('manager', 'activatePlugin', 'UIScriptRunner')
      await plugin.call('tabs', 'focus', 'UIScriptRunner')
    }, dataId: 'open-script-configuration-menu-item' }
  ]

  return (
    <DropdownMenu
      items={items}
      disabled={disabled}
      triggerDataId="run-script-dropdown-trigger"
      panelDataId="run-script-dropdown-panel"
    />
  )
}

export default RunScriptDropdown