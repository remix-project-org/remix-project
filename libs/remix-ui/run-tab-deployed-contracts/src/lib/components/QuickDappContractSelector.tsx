import React, { useEffect, useMemo, useState } from 'react'
import { Modal } from 'react-bootstrap'
import { shortenAddress } from '@remix-ui/helper'
import { DeployedContract } from '../types'

interface QuickDappContractSelectorProps {
  show: boolean
  primaryContract: DeployedContract
  deployedContracts: DeployedContract[]
  onCancel: () => void
  onConfirm: (additionalContracts: DeployedContract[]) => void
}

const contractKey = (contract: DeployedContract) => contract.address.toLowerCase()

export function QuickDappContractSelector({
  show,
  primaryContract,
  deployedContracts,
  onCancel,
  onConfirm
}: QuickDappContractSelectorProps) {
  const [selectedAddresses, setSelectedAddresses] = useState<string[]>([])

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
    if (show) setSelectedAddresses([])
  }, [show, primaryContract.address])

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
    onConfirm(candidates.filter((contract) => selected.has(contractKey(contract))))
  }

  return (
    <Modal show={show} onHide={onCancel} centered data-id="quickDappContractSelector">
      <Modal.Header closeButton>
        <Modal.Title>Select contracts</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2 text-secondary">
          Choose the deployed contracts this DApp can use.
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
          Contract bindings are fixed after creation.
        </p>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="btn btn-secondary" onClick={onCancel} data-id="quickDappContractSelectorCancel">
          Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={handleConfirm} data-id="quickDappContractSelectorContinue">
          Continue
        </button>
      </Modal.Footer>
    </Modal>
  )
}
