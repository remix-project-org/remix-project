import { useContext, useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { NoirAppContext } from '../contexts'
import { CustomTooltip } from '@remix-ui/helper'
import { ZkVerificationMethodResult } from '@remix-ui/quick-dapp-v2'
import { buildCreateNoirZkDappPrompt, QuickDappNoirPromptContext } from '@remix/remix-ai-core/quick-dapp-noir-prompts'
import isElectron from 'is-electron'

// @ts-ignore - injected via webpack.DefinePlugin, same globals noirPluginClient.ts already relies on
declare const BASE_URL: string
// @ts-ignore
declare const WS_URL: string

export function CreateZkDappButton() {
  const noirApp = useContext(NoirAppContext)
  const { appState, plugin } = noirApp
  const [isCreating, setIsCreating] = useState(false)

  const projectRoot = appState.filePath.substring(0, appState.filePath.lastIndexOf('/src/'))
  const buildPath = projectRoot === '' ? 'build' : `${projectRoot}/build`
  const contractsPath = projectRoot === '' ? 'contracts' : `${projectRoot}/contracts`
  const nargoTomlPath = projectRoot === '' ? 'Nargo.toml' : `${projectRoot}/Nargo.toml`
  const proverTomlPath = projectRoot === '' ? 'Prover.toml' : `${projectRoot}/Prover.toml`

  const extractCircuitName = (): string => {
    const fileName = appState.filePath.split('/').pop() || 'circuit'
    return fileName.replace('.nr', '')
  }

  const openRemixAiAssistant = async (): Promise<void> => {
    try {
      await (plugin as any).call('manager', 'activatePlugin', 'remix-ai-assistant')
    } catch {
      // The assistant may already be active.
    }

    try {
      await (plugin as any).call('rightSidePanel', 'focusPanel')
    } catch {
      // Focusing the panel is best effort.
    }
  }

  const handleCreateZkDapp = async () => {
    if (isCreating) return

    // Noir only supports on-chain verification - there is no zkVerify integration for Noir.
    const result: ZkVerificationMethodResult | null = await (plugin as any).call('notification', 'showZkVerificationMethodModal', { forceOnChain: true })
    if (!result || !result.onChainVerifier) return

    setIsCreating(true)
    try {
      const noirContext: QuickDappNoirPromptContext = {
        circuitName: extractCircuitName(),
        circuitPath: appState.filePath,
        projectRoot: projectRoot || '/',
        nargoTomlPath,
        circuitSourcePaths: [appState.filePath],
        proverTomlPath,
        programJsonPath: `${buildPath}/program.json`,
        verifierContractPath: `${contractsPath}/Verifier.sol`,
        backendUrl: BASE_URL,
        wsUrl: WS_URL,
        onChainVerifier: result.onChainVerifier
      }

      const prompt = buildCreateNoirZkDappPrompt({
        noirContext,
        isDesktop: isElectron()
      })

      await openRemixAiAssistant()
      await (plugin as any).call('remixaiassistant', 'chatPipe', prompt)
    } catch (error: any) {
      console.error('[CreateZkDappButton] Failed to create ZK DApp:', error)
      await (plugin as any).call('notification', 'toast', `Failed to create ZK DApp: ${error.message || error}`)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="mt-3">
      <CustomTooltip
        placement="bottom"
        tooltipId="noirCreateZkDappTooltip"
        tooltipText="Create a DApp with in-browser proof generation and on-chain verification"
      >
        <button
          id="noir_create_zk_dapp_btn"
          data-id="noir_create_zk_dapp_btn"
          className="btn btn-primary w-100"
          onClick={handleCreateZkDapp}
          disabled={isCreating}
        >
          {isCreating ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
              <FormattedMessage id="noir.creatingZkDapp" defaultMessage="Creating ZK DApp..." />
            </>
          ) : (
            <>
              <i className="fas fa-rocket me-2"></i>
              <FormattedMessage id="noir.createZkDapp" defaultMessage="Create ZK DApp" />
            </>
          )}
        </button>
      </CustomTooltip>
    </div>
  )
}
