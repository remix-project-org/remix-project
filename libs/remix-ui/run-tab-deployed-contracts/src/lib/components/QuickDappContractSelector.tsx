import React, { useEffect, useMemo, useState } from 'react'
import { Form, Modal } from 'react-bootstrap'
import { shortenAddress } from '@remix-ui/helper'
import { DeployedContract } from '../types'

interface QuickDappContractSelectorProps {
  show: boolean
  primaryContract: DeployedContract
  deployedContracts: DeployedContract[]
  fixedFrontendMode?: 'inline' | 'workspace'
  onCancel: () => void
  onConfirm: (options: QuickDappSetupOptions) => void
}

export interface QuickDappSetupOptions {
  additionalContracts: DeployedContract[]
  frontendMode: 'inline' | 'workspace'
  isBaseMiniApp: boolean
  design: string
  subgraphFilePath?: string
}

const contractKey = (contract: DeployedContract) => contract.address.toLowerCase()

export function QuickDappContractSelector({
  show,
  primaryContract,
  deployedContracts,
  fixedFrontendMode,
  onCancel,
  onConfirm
}: QuickDappContractSelectorProps) {
  const [selectedAddresses, setSelectedAddresses] = useState<string[]>([])
  const [frontendMode, setFrontendMode] = useState<'inline' | 'workspace'>('workspace')
  const [isBaseMiniApp, setIsBaseMiniApp] = useState(false)
  const [design, setDesign] = useState('')
  const [subgraphFilePath, setSubgraphFilePath] = useState('')

  const candidates = useMemo(() => {
    const seen = new Set<string>([contractKey(primaryContract)])

    return deployedContracts.filter((contract) => {
      if (!contract.address) return false
      const key = contractKey(contract)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [deployedContracts, primaryContract])

  useEffect(() => {
    if (!show) return
    setSelectedAddresses([])
    setFrontendMode(fixedFrontendMode || 'workspace')
    setIsBaseMiniApp(false)
    setDesign('')
    setSubgraphFilePath('')
  }, [show, primaryContract.address, fixedFrontendMode])

  const toggleContract = (address: string) => {
    const key = address.toLowerCase()
    setSelectedAddresses((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key)
      if (current.length >= 7) return current
      return [...current, key]
    })
  }

  const handleConfirm = () => {
    const selected = new Set(selectedAddresses)
    onConfirm({
      additionalContracts: candidates.filter((contract) => selected.has(contractKey(contract))),
      frontendMode: fixedFrontendMode || frontendMode,
      isBaseMiniApp,
      design: design.trim(),
      ...(subgraphFilePath.trim() ? { subgraphFilePath: subgraphFilePath.trim() } : {})
    })
  }

  return (
    <Modal show={show} onHide={onCancel} centered scrollable data-id="quickDappContractSelector">
      <Modal.Header closeButton>
        <Modal.Title>Create DApp</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2 text-secondary">
          Confirm the contracts and setup options before continuing with AI.
        </p>

        <div className="border rounded p-2 mb-3" data-id="quickDappPrimaryContract">
          <div className="d-flex align-items-center justify-content-between gap-2">
            <div className="text-truncate">
              <div className="fw-semibold text-truncate">{primaryContract.name}</div>
              <div className="small text-secondary">{shortenAddress(primaryContract.address)}</div>
            </div>
            <span className="badge bg-primary">Primary</span>
          </div>
        </div>

        <div className="d-flex align-items-center justify-content-between mb-2">
          <span className="fw-semibold">Additional contracts</span>
          <span className="small text-secondary">{selectedAddresses.length}/7</span>
        </div>

        <div className="d-flex flex-column gap-2" style={{ maxHeight: 240, overflowY: 'auto' }}>
          {candidates.map((contract) => {
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

        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold">Location</Form.Label>
          {fixedFrontendMode ? (
            <div className="border rounded px-3 py-2" data-id="quickDappFixedLocation">
              {fixedFrontendMode === 'inline' ? 'Inline · /frontend in the current workspace' : 'Workspace · new dedicated workspace'}
            </div>
          ) : (
            <Form.Select
              value={frontendMode}
              onChange={(event) => setFrontendMode(event.target.value as 'inline' | 'workspace')}
              data-id="quickDappLocation"
            >
              <option value="workspace">Workspace · new dedicated workspace</option>
              <option value="inline">Inline · /frontend in the current workspace</option>
            </Form.Select>
          )}
        </Form.Group>

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
          <Form.Control
            as="textarea"
            rows={2}
            value={design}
            onChange={(event) => setDesign(event.target.value)}
            placeholder="Defaults, style notes, or a Figma URL"
            data-id="quickDappDesign"
          />
          <Form.Text className="text-secondary">Leave empty to use the default design.</Form.Text>
        </Form.Group>

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
      <Modal.Footer>
        <button type="button" className="btn btn-secondary" onClick={onCancel} data-id="quickDappContractSelectorCancel">
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={handleConfirm} data-id="quickDappContractSelectorContinue">
          Continue with AI
        </button>
      </Modal.Footer>
    </Modal>
  )
}
