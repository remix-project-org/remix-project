import React, { useEffect, useMemo, useState } from 'react'
import { Form, Modal } from 'react-bootstrap'
import { shortenAddress } from '@remix-ui/helper'

export interface QuickDappContractCandidate {
  address: string
  name: string
  contractData?: any
  filePath?: string
  [key: string]: any
}

interface QuickDappContractSelectorProps {
  show: boolean
  primaryContract: QuickDappContractCandidate
  deployedContracts: QuickDappContractCandidate[]
  primarySelectable?: boolean
  matchingContractAddresses?: string[]
  sourceFileName?: string
  fixedFrontendMode?: 'inline' | 'workspace'
  onCancel: () => void
  onPrepareFigma: (figmaUrl: string, figmaToken: string) => Promise<QuickDappFigmaPreparationResult>
  onConfirm: (options: QuickDappSetupOptions) => void
}

export interface QuickDappSetupOptions {
  primaryContract: QuickDappContractCandidate
  additionalContracts: QuickDappContractCandidate[]
  frontendMode: 'inline' | 'workspace'
  isBaseMiniApp: boolean
  design: string
  figmaUrl?: string
  figmaContextId?: string
  subgraphFilePath?: string
}

export interface QuickDappFigmaPreparationResult {
  success: boolean
  contextId?: string
  fileName?: string
  message?: string
}

const contractKey = (contract: QuickDappContractCandidate) => contract.address.toLowerCase()
const isSupportedFigmaUrl = (value: string) => /^https:\/\/(?:www\.)?figma\.com\/(?:file|design|proto)\/[a-zA-Z0-9]+(?:[/?#].*)?$/i.test(value.trim())
const designPresets = ['', 'Minimal', 'Colorful', 'Techy', 'Futuristic']

export function QuickDappContractSelector({
  show,
  primaryContract,
  deployedContracts,
  primarySelectable = false,
  matchingContractAddresses = [],
  sourceFileName,
  fixedFrontendMode,
  onCancel,
  onPrepareFigma,
  onConfirm
}: QuickDappContractSelectorProps) {
  const [primaryAddress, setPrimaryAddress] = useState(primaryContract.address.toLowerCase())
  const [selectedAddresses, setSelectedAddresses] = useState<string[]>([])
  const [frontendMode, setFrontendMode] = useState<'inline' | 'workspace'>('workspace')
  const [isBaseMiniApp, setIsBaseMiniApp] = useState(false)
  const [design, setDesign] = useState('')
  const [useFigma, setUseFigma] = useState(false)
  const [figmaUrl, setFigmaUrl] = useState('')
  const [figmaToken, setFigmaToken] = useState('')
  const [figmaError, setFigmaError] = useState('')
  const [isPreparingFigma, setIsPreparingFigma] = useState(false)
  const [subgraphFilePath, setSubgraphFilePath] = useState('')

  const allContracts = useMemo(() => {
    const seen = new Set<string>()
    return [primaryContract, ...deployedContracts].filter((contract) => {
      if (!contract.address) return false
      const key = contractKey(contract)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [deployedContracts, primaryContract])

  const selectedPrimary = allContracts.find((contract) => contractKey(contract) === primaryAddress) || primaryContract
  const effectiveFrontendMode = fixedFrontendMode || frontendMode

  const candidates = useMemo(() => {
    return allContracts.filter((contract) => contractKey(contract) !== primaryAddress)
  }, [allContracts, primaryAddress])

  useEffect(() => {
    if (!show) return
    setPrimaryAddress(primaryContract.address.toLowerCase())
    setSelectedAddresses([])
    setFrontendMode(fixedFrontendMode || 'workspace')
    setIsBaseMiniApp(false)
    setDesign('')
    setUseFigma(false)
    setFigmaUrl('')
    setFigmaToken('')
    setFigmaError('')
    setIsPreparingFigma(false)
    setSubgraphFilePath('')
  }, [show, primaryContract.address, fixedFrontendMode])

  const handlePrimaryChange = (address: string) => {
    const key = address.toLowerCase()
    setPrimaryAddress(key)
    setSelectedAddresses((current) => current.filter((item) => item !== key))
  }

  const toggleContract = (address: string) => {
    const key = address.toLowerCase()
    setSelectedAddresses((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key)
      if (current.length >= 7) return current
      return [...current, key]
    })
  }

  const handleConfirm = async () => {
    const selected = new Set(selectedAddresses)
    let figmaContextId: string | undefined
    const normalizedFigmaUrl = figmaUrl.trim()

    if (useFigma) {
      if (!isSupportedFigmaUrl(normalizedFigmaUrl)) {
        setFigmaError('Enter a valid Figma file, design, or prototype URL.')
        return
      }
      if (!figmaToken.trim()) {
        setFigmaError('Enter a Figma Personal Access Token.')
        return
      }

      setIsPreparingFigma(true)
      setFigmaError('')
      try {
        const result = await onPrepareFigma(normalizedFigmaUrl, figmaToken.trim())
        if (!result.success || !result.contextId) {
          setFigmaError(result.message || 'Could not access this Figma design.')
          return
        }
        figmaContextId = result.contextId
      } catch (error: any) {
        setFigmaError(error?.message || 'Could not access this Figma design.')
        return
      } finally {
        setIsPreparingFigma(false)
      }
    }

    setFigmaToken('')
    onConfirm({
      primaryContract: selectedPrimary,
      additionalContracts: candidates.filter((contract) => selected.has(contractKey(contract))),
      frontendMode: effectiveFrontendMode,
      isBaseMiniApp,
      design: design.trim(),
      ...(useFigma ? { figmaUrl: normalizedFigmaUrl, figmaContextId } : {}),
      ...(subgraphFilePath.trim() ? { subgraphFilePath: subgraphFilePath.trim() } : {})
    })
  }

  return (
    <Modal show={show} onHide={isPreparingFigma ? undefined : onCancel} centered scrollable data-id="quickDappContractSelector">
      <Modal.Header closeButton>
        <Modal.Title>Create DApp</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2 text-secondary">
          Confirm the contracts and setup options before continuing with AI.
        </p>

        <div className="mb-3" data-id="quickDappContractsStep">
          <div className="small text-uppercase text-primary fw-semibold mb-1">Step 1 of 3</div>
          <div className="fw-semibold">Contract bindings</div>
          <div className="small text-secondary">Choose the main and additional contracts.</div>
        </div>

        {primarySelectable && sourceFileName && matchingContractAddresses.length === 0 && (
          <div className="alert alert-warning py-2" role="alert" data-id="quickDappNoMatchingContract">
            No deployed contract matches {sourceFileName}. Select the contract you want to use.
          </div>
        )}

        {primarySelectable ? (
          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold">Main contract</Form.Label>
            <Form.Select
              value={primaryAddress}
              onChange={(event) => handlePrimaryChange(event.target.value)}
              data-id="quickDappPrimaryContractSelect"
            >
              {allContracts.map((contract) => {
                const key = contractKey(contract)
                const matchesCurrentFile = matchingContractAddresses.includes(key)
                return (
                  <option key={key} value={key}>
                    {contract.name} · {shortenAddress(contract.address)}{matchesCurrentFile ? ' · Current file' : ''}
                  </option>
                )
              })}
            </Form.Select>
          </Form.Group>
        ) : (
          <div className="border rounded p-2 mb-3" data-id="quickDappPrimaryContract">
            <div className="d-flex align-items-center justify-content-between gap-2">
              <div className="text-truncate">
                <div className="fw-semibold text-truncate">{selectedPrimary.name}</div>
                <div className="small text-secondary">{shortenAddress(selectedPrimary.address)}</div>
              </div>
              <span className="badge bg-primary">Main</span>
            </div>
          </div>
        )}

        <div className="d-flex align-items-center justify-content-between mb-2">
          <span className="fw-semibold">Additional contracts</span>
          <span className="small text-secondary">{selectedAddresses.length}/7</span>
        </div>

        <div className="d-flex flex-column gap-2" style={{ maxHeight: 240, overflowY: 'auto' }}>
          {candidates.length === 0 ? (
            <div className="border rounded p-3 small text-secondary" data-id="quickDappNoAdditionalContracts">
              No other deployed contracts are available in this environment.
            </div>
          ) : candidates.map((contract) => {
            const key = contractKey(contract)
            const selected = selectedAddresses.includes(key)
            const disabled = !selected && selectedAddresses.length >= 7

            return (
              <label
                key={key}
                className={`d-flex align-items-center gap-2 border rounded p-2 mb-0 ${disabled ? 'opacity-50' : ''}`}
                style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
              >
                <input
                  className="form-check-input mt-0"
                  type="checkbox"
                  checked={selected}
                  disabled={disabled}
                  onChange={() => toggleContract(contract.address)}
                  data-id={`quickDappAdditionalContract-${key}`}
                />
                <span className="flex-grow-1 text-truncate">
                  <span className="d-block text-truncate">{contract.name}</span>
                  <span className="d-block small text-secondary">{shortenAddress(contract.address)}</span>
                </span>
              </label>
            )
          })}
        </div>

        <p className="small text-secondary mt-3 mb-0">
          Contract changes require confirmation from the target DApp update flow.
        </p>

        <hr />

        <div className="mb-3" data-id="quickDappLocationStep">
          <div className="small text-uppercase text-primary fw-semibold mb-1">Step 2 of 3</div>
          <div className="fw-semibold">Frontend location</div>
          <div className="small text-secondary">Choose where the generated frontend is stored.</div>
        </div>

        <Form.Group className="mb-3">
          {fixedFrontendMode ? (
            <div className="border rounded px-3 py-2" data-id="quickDappFixedLocation">
              {fixedFrontendMode === 'inline' ? 'Inline · /frontend in the current workspace' : 'Workspace · new dedicated workspace'}
            </div>
          ) : (
            <Form.Select
              value={frontendMode}
              onChange={(event) => setFrontendMode(event.target.value as 'inline' | 'workspace')}
              aria-label="Frontend location"
              data-id="quickDappLocation"
            >
              <option value="workspace">Workspace · new dedicated workspace</option>
              <option value="inline">Inline · /frontend in the current workspace</option>
            </Form.Select>
          )}
        </Form.Group>

        <hr />

        <div className="mb-3" data-id="quickDappDesignStep">
          <div className="small text-uppercase text-primary fw-semibold mb-1">Step 3 of 3</div>
          <div className="fw-semibold">Design and integrations</div>
          <div className="small text-secondary">Add only the optional details you need.</div>
        </div>

        <Form.Check
          className="mb-3"
          type="checkbox"
          checked={isBaseMiniApp}
          onChange={(event) => setIsBaseMiniApp(event.target.checked)}
          label="Create as a Base mini-app"
          data-id="quickDappBaseMiniApp"
        />

        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold">Design</Form.Label>
          <div className="d-flex flex-wrap gap-2 mb-2" aria-label="Design presets" data-id="quickDappDesignPresets">
            {designPresets.map((preset) => {
              const label = preset || 'Default'
              return (
                <button
                  key={label}
                  type="button"
                  className={`btn btn-sm qd-choice-chip ${design === preset ? 'qd-choice-chip--active' : ''}`}
                  onClick={() => setDesign(preset)}
                  aria-pressed={design === preset}
                  data-id={`quickDappDesignPreset-${label.toLowerCase()}`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <Form.Control
            as="textarea"
            rows={2}
            value={design}
            onChange={(event) => setDesign(event.target.value)}
            placeholder="Add custom style notes"
            data-id="quickDappDesign"
          />
          <Form.Text className="text-secondary">Choose a starting style or add your own notes.</Form.Text>
        </Form.Group>

        <Form.Check
          className="mb-3"
          type="checkbox"
          checked={useFigma}
          onChange={(event) => {
            setUseFigma(event.target.checked)
            setFigmaError('')
          }}
          label="Use a Figma design"
          data-id="quickDappUseFigma"
        />

        {useFigma && (
          <div className="border rounded p-3 mb-3">
            <Form.Group className="mb-3">
              <Form.Label className="fw-semibold">Figma URL</Form.Label>
              <Form.Control
                type="url"
                value={figmaUrl}
                onChange={(event) => {
                  setFigmaUrl(event.target.value)
                  setFigmaError('')
                }}
                placeholder="https://www.figma.com/design/..."
                disabled={isPreparingFigma}
                data-id="quickDappFigmaUrl"
              />
            </Form.Group>
            <Form.Group>
              <Form.Label className="fw-semibold">Personal Access Token</Form.Label>
              <Form.Control
                type="password"
                value={figmaToken}
                onChange={(event) => {
                  setFigmaToken(event.target.value)
                  setFigmaError('')
                }}
                autoComplete="off"
                disabled={isPreparingFigma}
                data-id="quickDappFigmaToken"
              />
              <Form.Text className="text-secondary">Used once to validate the design. It is not added to the AI chat.</Form.Text>
            </Form.Group>
            {figmaError && (
              <div className="alert alert-danger py-2 mt-3 mb-0" role="alert" data-id="quickDappFigmaError">
                <div>{figmaError}</div>
                <button
                  type="button"
                  className="btn btn-link text-start p-0 mt-1"
                  onClick={() => {
                    setUseFigma(false)
                    setFigmaUrl('')
                    setFigmaToken('')
                    setFigmaError('')
                  }}
                  data-id="quickDappContinueWithoutFigma"
                >
                  Use default design instead
                </button>
              </div>
            )}
          </div>
        )}

        <Form.Group>
          <Form.Label className="fw-semibold">Subgraph</Form.Label>
          <Form.Control
            value={subgraphFilePath}
            onChange={(event) => setSubgraphFilePath(event.target.value)}
            placeholder="None, or a .subgraph file path/name"
            data-id="quickDappSubgraph"
          />
        </Form.Group>

        <p className="small text-secondary mt-3 mb-0">
          QuickDApp creates a browser-based static frontend and does not provide server runtime or secret storage.
        </p>
      </Modal.Body>
      <Modal.Footer className="justify-content-between flex-wrap gap-2">
        <div className="small text-secondary" data-id="quickDappSetupSummary">
          {selectedAddresses.length + 1} contract{selectedAddresses.length > 0 ? 's' : ''} · {effectiveFrontendMode === 'inline' ? 'Inline /frontend' : 'Dedicated workspace'}
        </div>
        <div className="d-flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isPreparingFigma} data-id="quickDappContractSelectorCancel">
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={isPreparingFigma} data-id="quickDappContractSelectorContinue">
            {isPreparingFigma ? 'Checking Figma…' : useFigma ? 'Validate and continue' : 'Continue with AI'}
          </button>
        </div>
      </Modal.Footer>
    </Modal>
  )
}
