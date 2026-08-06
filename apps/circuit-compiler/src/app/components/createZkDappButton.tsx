import { useContext, useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { CircuitAppContext } from '../contexts'
import { CustomTooltip } from '@remix-ui/helper'
import { buildCreateZkDappPrompt, QuickDappZkPromptContext } from '@remix/remix-ai-core/quick-dapp-zk-prompts'
import isElectron from 'is-electron'

export function CreateZkDappButton() {
  const circuitApp = useContext(CircuitAppContext)
  const { appState, plugin } = circuitApp
  const [isCreating, setIsCreating] = useState(false)

  const extractCircuitName = (filePath: string): string => {
    if (!filePath) return 'circuit'
    const fileName = filePath.split('/').pop() || 'circuit'
    return fileName.replace('.circom', '')
  }

  const deriveWasmPath = (filePath: string): string => {
    const circuitName = extractCircuitName(filePath)
    const basePath = filePath.substring(0, filePath.lastIndexOf('/')) || '.'
    return `${basePath}/.bin/${circuitName}_js/${circuitName}.wasm`
  }

  const deriveZkeyPath = (filePath: string): string => {
    const circuitName = extractCircuitName(filePath)
    const basePath = filePath.substring(0, filePath.lastIndexOf('/')) || '.'
    return `${basePath}/${appState.provingScheme}/zk/keys/${circuitName}_final.zkey`
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

    setIsCreating(true)
    try {
      const circuitName = extractCircuitName(appState.filePath)

      const zkContext: QuickDappZkPromptContext = {
        circuitName,
        circuitPath: appState.filePath,
        provingScheme: appState.provingScheme as 'groth16',
        primeValue: appState.primeValue as 'bn128' | 'bls12381',
        signalInputs: appState.signalInputs,
        wasmPath: deriveWasmPath(appState.filePath),
        zkeyPath: deriveZkeyPath(appState.filePath),
        verificationKey: appState.verificationKey
      }

      // Build the prompt for the AI assistant
      const prompt = buildCreateZkDappPrompt({
        zkContext,
        isDesktop: isElectron()
      })

      // Open the AI assistant and send the prompt
      await openRemixAiAssistant()
      await (plugin as any).call('remixaiassistant', 'chatPipe', prompt)
    } catch (error: any) {
      console.error('[CreateZkDappButton] Failed to create ZK DApp:', error)
      await (plugin as any).call('notification', 'toast', `Failed to create ZK DApp: ${error.message || error}`)
    } finally {
      setIsCreating(false)
    }
  }

  const canCreateDapp =
    appState.setupExportStatus === 'done' &&
    appState.provingScheme === 'groth16' &&
    appState.verificationKey &&
    Object.keys(appState.verificationKey).length > 0 &&
    appState.signalInputs.length > 0

  // Only show for groth16 (zkVerify requirement)
  if (appState.provingScheme !== 'groth16') {
    return null
  }

  const getTooltipText = (): string => {
    if (!appState.verificationKey || Object.keys(appState.verificationKey).length === 0) {
      return 'Run trusted setup and generate proof first'
    }
    if (appState.setupExportStatus !== 'done') {
      return 'Complete the trusted setup first'
    }
    if (appState.signalInputs.length === 0) {
      return 'Compile the circuit first to detect signal inputs'
    }
    return 'Create a DApp with in-browser proof generation and zkVerify verification'
  }

  return (
    <div className="mt-2">
      <CustomTooltip
        placement="bottom"
        tooltipId="createZkDappTooltip"
        tooltipText={getTooltipText()}
      >
        <button
          id="create_zk_dapp_btn"
          data-id="create_zk_dapp_btn"
          className="btn btn-primary w-100"
          onClick={handleCreateZkDapp}
          disabled={!canCreateDapp || isCreating}
        >
          {isCreating ? (
            <>
              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
              <FormattedMessage id="circuit.creatingZkDapp" defaultMessage="Creating ZK DApp..." />
            </>
          ) : (
            <>
              <i className="fas fa-rocket me-2"></i>
              <FormattedMessage id="circuit.createZkDapp" defaultMessage="Create ZK DApp" />
            </>
          )}
        </button>
      </CustomTooltip>
    </div>
  )
}
