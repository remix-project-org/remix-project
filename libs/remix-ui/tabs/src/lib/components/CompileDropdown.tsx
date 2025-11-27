import React, { useState, useEffect, useContext } from 'react'
import DropdownMenu, { MenuItem } from './DropdownMenu'
import { AppModal } from '@remix-ui/app'
import { FormattedMessage } from 'react-intl'
import { handleSolidityScan } from '@remix-ui/helper'
import { TrackingContext } from '@remix-ide/tracking'

import { ArrowRightBig, IpfsLogo, SwarmLogo, SettingsLogo, SolidityScanLogo, AnalysisLogo, TsLogo } from '@remix-ui/tabs'

interface CompileDropdownProps {
  tabPath?: string
  plugin?: any
  disabled?: boolean
  compiledFileName?: string
  onOpen?: () => void
  onRequestCompileAndPublish?: (type: string) => void
  setCompileState: (state: 'idle' | 'compiling' | 'compiled') => void
}

export const CompileDropdown: React.FC<CompileDropdownProps> = ({ tabPath, plugin, disabled, onOpen, onRequestCompileAndPublish, compiledFileName, setCompileState }) => {
  const { trackMatomoEvent } = useContext(TrackingContext)
  const [scriptFiles, setScriptFiles] = useState<string[]>([])

  const compileThen = async (nextAction: () => void, actionName: string) => {
    setCompileState('compiling')

    try {
      await plugin.call('fileManager', 'saveCurrentFile')
      await plugin.call('manager', 'activatePlugin', 'solidity')

      const startedAt = Date.now()
      const targetPath = tabPath || ''

      const waitForFreshCompilationResult = async (
        path: string,
        startMs: number,
        maxWaitMs = 1500,
        intervalMs = 120
      ) => {
        const norm = (p: string) => p.replace(/^\/+/, '')
        const fileName = (norm(path).split('/').pop() || norm(path)).toLowerCase()
        const hasFile = (res: any) => {
          if (!res) return false
          const inContracts =
            res.contracts && typeof res.contracts === 'object' &&
            Object.keys(res.contracts).some(k => k.toLowerCase().endsWith(fileName) || norm(k).toLowerCase() === norm(path).toLowerCase())
          const inSources =
            res.sources && typeof res.sources === 'object' &&
            Object.keys(res.sources).some(k => k.toLowerCase().endsWith(fileName) || norm(k).toLowerCase() === norm(path).toLowerCase())
          return inContracts || inSources
        }

        let last: any = null
        const until = startMs + maxWaitMs
        while (Date.now() < until) {
          try {
            const res = await plugin.call('solidity', 'getCompilationResult')
            last = res
            const ts = (res && (res.timestamp || res.timeStamp || res.time || res.generatedAt)) || null
            const isFreshTime = typeof ts === 'number' ? ts >= startMs : true
            if (res && hasFile(res) && isFreshTime) return res
          } catch {}
          await new Promise(r => setTimeout(r, intervalMs))
        }
        return last
      }

      let settled = false
      let watchdog: NodeJS.Timeout | null = null
      const cleanup = () => {
        try { plugin.off('solidity', 'compilationFinished', onFinished) } catch {}
        if (watchdog) { clearTimeout(watchdog); watchdog = null }
      }

      const finishWithErrorUI = async () => {
        setCompileState('idle')
        await plugin.call('manager', 'activatePlugin', 'solidity')
        await plugin.call('menuicons', 'select', 'solidity')
        plugin.call('notification', 'toast', `Compilation failed, skipping '${actionName}'.`)
      }

      const onFinished = async () => {
        if (settled) return
        settled = true
        cleanup()

        const fresh = await waitForFreshCompilationResult(targetPath, startedAt).catch(() => null)
        if (!fresh) {
          await finishWithErrorUI()
          return
        }

        const errs = Array.isArray(fresh.errors)
          ? fresh.errors.filter((e: any) => (e.severity || e.type) === 'error')
          : []

        if (errs.length > 0) {
          await finishWithErrorUI()
          return
        }

        setCompileState('compiled')
        nextAction()
      }

      plugin.on('solidity', 'compilationFinished', onFinished)

      watchdog = setTimeout(() => { onFinished() }, 10000)

      await plugin.call('solidity', 'compile', targetPath)

    } catch (e) {
      console.error(e)
      setCompileState('idle')
    }
  }

  const fetchScripts = async () => {
    try {
      let files = {}
      const exists = await plugin.call('fileManager', 'exists', 'scripts')
      if (exists) {
        files = await plugin.call('fileManager', 'readdir', 'scripts')
      }
      const tsFiles = Object.keys(files).filter(f => f.endsWith('.ts'))
      setScriptFiles(tsFiles)
    } catch (err) {
      console.error("Failed to read scripts directory:", err)
    }
  }

  const runScript = async (path: string) => {
    await compileThen(async () => {
      const content = await plugin.call('fileManager', 'readFile', path)
      await plugin.call('scriptRunnerBridge', 'execute', content, path)
    }, 'Run Script')
  }

  const runRemixAnalysis = async () => {
    trackMatomoEvent?.({
      category: 'solidityCompiler',
      action: 'staticAnalysis',
      name: 'initiate',
      isClick: true
    })
    await compileThen(async () => {
      const isStaticAnalyzersActive = await plugin.call('manager', 'isActive', 'solidityStaticAnalysis')
      if (!isStaticAnalyzersActive) {
        await plugin.call('manager', 'activatePlugin', 'solidityStaticAnalysis')
      }
      await plugin.call('menuicons', 'select', 'solidityStaticAnalysis')
      setTimeout(() => plugin.call('solidityStaticAnalysis', 'analyze'), 500)
    }, 'Run Remix Analysis')
  }

  const handleScanContinue = async () => {
    await compileThen(async () => {
      const firstSlashIndex = compiledFileName.indexOf('/')
      const finalPath = firstSlashIndex > 0 ? compiledFileName.substring(firstSlashIndex + 1) : compiledFileName
      await handleSolidityScan(plugin, finalPath)
    }, 'Run Solidity Scan')
  }

  const runSolidityScan = async () => {
    trackMatomoEvent?.({
      category: 'solidityCompiler',
      action: 'solidityScan',
      name: 'askPermissionToScan',
      isClick: true
    })
    const modal: AppModal = {
      id: 'SolidityScanPermissionHandler',
      title: <FormattedMessage id="solidity.solScan.modalTitle" />,
      message: <div className='d-flex flex-column'>
        <span><FormattedMessage id="solidity.solScan.modalMessage" />
          <a href={'https://solidityscan.com/?utm_campaign=remix&utm_source=remix'}
            target="_blank"
            onClick={() => trackMatomoEvent?.({
              category: 'solidityCompiler',
              action: 'solidityScan',
              name: 'learnMore',
              isClick: true
            })}>
              Learn more
          </a>
        </span><br/>
        <FormattedMessage id="solidity.solScan.likeToContinue" />
      </div>,
      okLabel: <FormattedMessage id="solidity.solScan.modalOkLabel" />,
      okFn: handleScanContinue,
      cancelLabel: <FormattedMessage id="solidity.solScan.modalCancelLabel" />
    }
    await plugin.call('notification', 'modal', modal)
  }

  const openConfiguration = async () => {
    trackMatomoEvent?.({
      category: 'solidityCompiler',
      action: 'initiate',
      isClick: true
    })
    const isSolidityCompilerActive = await plugin.call('manager', 'isActive', 'solidity')
    if (!isSolidityCompilerActive) {
      await plugin.call('manager', 'activatePlugin', 'solidity')
    }
    plugin.call('menuicons', 'select', 'solidity')
  }

  const items: MenuItem[] = [
    {
      label: 'Compile and run script',
      icon: <ArrowRightBig />,
      dataId: 'compile-run-script-menu-item',
      submenu: scriptFiles.length > 0
        ? scriptFiles.map(f => ({
          label: f, icon: <TsLogo />,
          onClick: () => runScript(f),
          dataId: `run-script-${f.replace(/[^a-zA-Z0-9-]/g, '_')}-submenu-item` }))
        : [{ label: 'No scripts found', onClick: () => {}, dataId: 'no-scripts-found-item' }]
    },
    {
      label: 'Compile and run analysis',
      icon: <ArrowRightBig />,
      dataId: 'compile-run-analysis-menu-item',
      submenu: [
        { label: 'Run Remix Analysis', icon: <SettingsLogo />, onClick: runRemixAnalysis, dataId: 'run-remix-analysis-submenu-item' },
        { label: 'Run Solidity Scan', icon: <SolidityScanLogo />, onClick: runSolidityScan, dataId: 'run-solidity-scan-submenu-item' }
      ]
    },
    {
      label: 'Compile and publish',
      icon: <ArrowRightBig />,
      dataId: 'compile-publish-menu-item',
      submenu: [
        { label: 'Publish on IPFS', icon: <IpfsLogo />, onClick: () => onRequestCompileAndPublish('ipfs'), dataId: 'publish-ipfs-submenu-item' },
        { label: 'Publish on Swarm', icon: <SwarmLogo />, onClick: () => onRequestCompileAndPublish('swarm'), dataId: 'publish-swarm-submenu-item' }
      ]
    },
    {
      label: 'Open compiler configuration',
      icon: <SettingsLogo />,
      onClick: openConfiguration,
      borderTop: true,
      dataId: 'publish-swarm-submenu-item'
    }
  ]

  return (
    <>
      <DropdownMenu
        items={items}
        disabled={disabled}
        onOpen={() => { fetchScripts(); onOpen?.() }}
        triggerDataId="compile-dropdown-trigger"
        panelDataId="compile-dropdown-panel"
      />
    </>

  )
}

export default CompileDropdown