import React, { useContext, useState, useEffect, useRef } from 'react'
import { FormattedMessage } from 'react-intl'
import * as ethJSUtil from '@ethereumjs/util'
import { DeployedContractsAppContext } from '../contexts'
import { DeployedContractItem } from '../components/DeployedContractItem'
import { checkSumWarning } from '@remix-ui/helper'
import { loadAddress } from '../actions'
import { TrackingContext } from '@remix-ide/tracking'

export default function DeployedContractsPortraitView() {
  const { widgetState, dispatch, plugin, themeQuality } = useContext(DeployedContractsAppContext)
  const { trackMatomoEvent } = useContext(TrackingContext)
  const { deployedContracts, showAddDialog, addressInput, showClearAllDialog, loadType, currentFile } = widgetState
  const [enableAtAddress, setEnableAtAddress] = useState(false)
  const [latestContractAddress, setLatestContractAddress] = useState<string | null>(null)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [newInstancesCount, setNewInstancesCount] = useState(0)
  const [openKebabMenuAddress, setOpenKebabMenuAddress] = useState<string | null>(null)
  const contractRefsMap = useRef<Map<string, HTMLDivElement>>(new Map())
  const previousContractsLength = useRef(deployedContracts.length)
  const currentObserverRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    if (deployedContracts.length > previousContractsLength.current) {
      if (currentObserverRef.current) {
        currentObserverRef.current.disconnect()
        currentObserverRef.current = null
      }

      const latestContract = deployedContracts[deployedContracts.length - 1]

      setLatestContractAddress(latestContract.address)

      // Wait for DOM to be ready
      setTimeout(() => {
        const element = contractRefsMap.current.get(latestContract.address)
        if (element) {
          const observer = new IntersectionObserver(
            (entries) => {
              const entry = entries[0]
              if (!entry.isIntersecting) {
                setShowScrollButton(true)
                setNewInstancesCount(prev => prev + 1)
              } else {
                setShowScrollButton(false)
                setNewInstancesCount(0)
                observer.disconnect()
                currentObserverRef.current = null
              }
            },
            { threshold: 0.1 }
          )

          observer.observe(element)
          currentObserverRef.current = observer
        }
      }, 100)
    }

    previousContractsLength.current = deployedContracts.length
  }, [deployedContracts.length])

  // Cleanup observer on unmount
  useEffect(() => {
    return () => {
      if (currentObserverRef.current) {
        currentObserverRef.current.disconnect()
      }
    }
  }, [])

  useEffect(() => {
    // Enable button if address is provided and file type is valid
    // Valid types: compiled contracts (.sol, .vy, .lex, .contract) or ABI files (.abi)
    if (!addressInput) {
      setEnableAtAddress(false)
    } else {
      if (['sol', 'vyper', 'lexon', 'contract', 'abi'].includes(loadType)) {
        setEnableAtAddress(true)
      } else {
        setEnableAtAddress(false)
      }
    }
  }, [loadType, addressInput])

  const scrollToLatestContract = () => {
    trackMatomoEvent?.({ category: 'udapp', action: 'scrollToNewInstanceClick', name: 'clicked', isClick: true })
    if (latestContractAddress) {
      const element = contractRefsMap.current.get(latestContractAddress)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setShowScrollButton(false)
        setLatestContractAddress(null)
        setNewInstancesCount(0)
      }
    }
  }

  const handleAddClick = () => {
    trackMatomoEvent?.({ category: 'udapp', action: 'addContractButtonClick', name: 'clicked', isClick: true })
    dispatch({ type: 'SHOW_ADD_DIALOG', payload: true })
    dispatch({ type: 'SHOW_CLEAR_ALL_DIALOG', payload: false })
  }

  const handleClearAllClick = async () => {
    trackMatomoEvent?.({ category: 'udapp', action: 'clearAllContractsButtonClick', name: 'clicked', isClick: true })
    const network = await plugin.call('udappEnv', 'getNetwork')
    const chainId = network?.chainId
    const providerName = network?.name === 'VM' ? await plugin.call('udappEnv', 'getSelectedProvider') : chainId
    const isPinnedAvailable = await plugin.call('fileManager', 'exists', `.deploys/pinned-contracts/${providerName}`)

    if (isPinnedAvailable) await plugin.call('fileManager', 'remove', `.deploys/pinned-contracts/${providerName}`)
    dispatch({ type: 'SHOW_CLEAR_ALL_DIALOG', payload: true })
    dispatch({ type: 'SHOW_ADD_DIALOG', payload: false })
  }

  const handleAddContract = async () => {
    let address = addressInput
    if (!address || address.trim() === '') {
      return
    }

    // Validate address format
    try {
      if (!ethJSUtil.isValidAddress(address)) {
        await plugin.call('notification', 'toast', '⚠️ Invalid address format')
        return
      }

      if (!ethJSUtil.isValidChecksumAddress(address)) {
        await plugin.call('notification', 'toast', checkSumWarning())
        address = ethJSUtil.toChecksumAddress(address)
      }
    } catch (e) {
      console.error('Invalid Address input:', e)
      await plugin.call('notification', 'toast', '⚠️ Invalid address')
      return
    }

    // Load contract at address using the action
    try {
      await loadAddress(plugin, dispatch, address, currentFile, loadType)
      trackMatomoEvent?.({ category: 'udapp', action: 'addContractSubmit', name: address, isClick: false })
    } catch (e) {
      console.error('Error adding contract:', e)
      await plugin.call('notification', 'toast', `⚠️ Error adding contract: ${e.message}`)
    }
  }

  const handleCancelAdd = () => {
    trackMatomoEvent?.({ category: 'udapp', action: 'addContractDialogClose', name: 'cancelled', isClick: true })
    dispatch({ type: 'SHOW_ADD_DIALOG', payload: false })
    dispatch({ type: 'SET_ADDRESS_INPUT', payload: '' })
  }

  const handleConfirmClearAll = async () => {
    trackMatomoEvent?.({ category: 'udapp', action: 'clearAllDialogConfirm', name: 'confirmed', isClick: true })
    const network = await plugin.call('udappEnv', 'getNetwork')
    const chainId = network?.chainId
    // Clear pinned contracts file if it exists
    const isPinnedAvailable = await plugin.call('fileManager', 'exists', `.deploys/pinned-contracts/${chainId}`)
    if (isPinnedAvailable) {
      await plugin.call('fileManager', 'remove', `.deploys/pinned-contracts/${chainId}`)
    }
    dispatch({ type: 'CLEAR_ALL_CONTRACTS', payload: null })
  }

  const handleCancelClearAll = () => {
    trackMatomoEvent?.({ category: 'udapp', action: 'clearAllDialogCancel', name: 'cancelled', isClick: true })
    dispatch({ type: 'SHOW_CLEAR_ALL_DIALOG', payload: false })
  }

  const handleAddressInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    trackMatomoEvent?.({ category: 'udapp', action: 'addContractAddressInput', name: value })
    dispatch({ type: 'SET_ADDRESS_INPUT', payload: value })
  }

  return (
    <div className="deployed-contracts-container card mx-2 my-2" data-id="deployedContractsContainer" style={{ backgroundColor: 'var(--custom-onsurface-layer-1)', '--theme-text-color': themeQuality === 'dark' ? 'white' : 'black', position: 'relative' } as React.CSSProperties}>
      <div className="p-3 d-flex align-items-center justify-content-between" style={{ cursor: 'pointer' }}>
        <div className='d-flex align-items-center gap-2 text-nowrap'>
          <h6 className="my-auto" style={{ color: themeQuality === 'dark' ? 'white' : 'black', margin: 0 }}>
            <FormattedMessage id="udapp.deployedContracts" defaultMessage="Deployed Contracts" />
          </h6>
          <span className="text-secondary" data-id="deployedContractsBadge">{deployedContracts.length}</span>
        </div>
        <div className="ms-1 me-1 d-flex">
          <button className="btn btn-primary btn-sm small d-flex align-items-center justify-content-between flex-nowrap" style={{ fontSize: '0.7rem' }} onClick={handleAddClick} data-id="addDeployedContract">
            <i className="fa-solid fa-plus me-1"></i>
            <span className="text-nowrap">Add Contract</span>
          </button>
          {deployedContracts.length > 0 && (
            <button
              className="btn btn-outline-danger btn-sm pe-0"
              data-id="clearAllDeployedContracts"
              onClick={handleClearAllClick}
              style={{ background: 'none', border: 'none' }}
            >
              <i className="far fa-trash-alt text-danger" aria-hidden="true"></i>
            </button>
          )}
        </div>
      </div>
      { !showClearAllDialog && <p className='text-muted px-3' style={{ fontSize: '0.8rem' }}>Interact with a deployed contract</p>}
      {/* Add Contract Dialog */}
      {showAddDialog && (
        <div className="m-3 mt-0 p-3 rounded" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <p className="mb-0" style={{ color: themeQuality === 'dark' ? 'white' : 'black', fontSize: '0.9rem' }}>
              Add a deployed contract
            </p>
            <button
              className="btn btn-sm"
              onClick={() => {
                trackMatomoEvent?.({ category: 'udapp', action: 'addContractDialogClose', name: 'close_button', isClick: true })
                handleCancelAdd()
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--bs-quaternary)',
                fontSize: '1.5rem',
                lineHeight: 1,
                padding: 0
              }}
            > × </button>
          </div>
          <p style={{ color: 'var(--bs-tertiary)', fontSize: '0.7rem' }} className="mb-2 fw-light">
            <FormattedMessage
              id="udapp.addDeployedContract"
              defaultMessage="Open the contract .abi or compiled .sol file in the code editor and paste the contract address below."
            />
          </p>
          <div className="d-flex align-items-center mb-2">
            <label className="mb-0 me-2" style={{ color: 'var(--bs-tertiary)' }}>
                Contract address
            </label>
          </div>
          <div className="position-relative flex-fill">
            <input
              type="text"
              value={addressInput}
              placeholder='0x...'
              className="form-control"
              onChange={handleAddressInputChange}
              data-id="deployedContractAddressInput"
              style={{ backgroundColor: 'var(--bs-body-bg)', color: themeQuality === 'dark' ? 'white' : 'black', flex: 1, padding: '0.75rem', paddingRight: '3.5rem', fontSize: '0.75rem' }}
            />
            <button
              className="btn btn-sm btn-primary"
              disabled={!enableAtAddress}
              onClick={handleAddContract}
              data-id="addDeployedContractButton"
              style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', zIndex: 2, fontSize: '0.65rem', fontWeight: 'bold' }}
            >
                Add
            </button>
          </div>
        </div>
      )}

      {/* Clear All Confirmation Dialog */}
      {showClearAllDialog && (
        <div className="m-3 mt-0 p-3 rounded" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <p className="mb-0 text-danger text-theme-contrast" style={{ fontSize: '0.9rem' }}>
            Clear all deployed contracts
            </p>
            <button
              className="btn btn-sm"
              onClick={() => {
                trackMatomoEvent?.({ category: 'udapp', action: 'clearAllDialogClose', name: 'close_button', isClick: true })
                handleCancelClearAll()
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--bs-quaternary)',
                fontSize: '1.5rem',
                lineHeight: 1,
                padding: 0
              }}
            > × </button>
          </div>
          <p className="text-sm mb-3">
            <FormattedMessage
              id="udapp.clearAllConfirm"
              defaultMessage="You are about to delete the list of your deployed contracts."
            />
          </p>
          <p className="text-theme-contrast">Do you want to proceed?</p>
          <div className="d-flex justify-content-between align-items-center gap-3">
            <button
              className="btn btn-sm btn-secondary flex-fill"
              onClick={handleCancelClearAll}
              data-id="cancelClearAll"
            >
              <FormattedMessage id="udapp.cancel" defaultMessage="Cancel" />
            </button>
            <button
              className="btn btn-sm btn-danger text-light flex-fill"
              onClick={handleConfirmClearAll}
              data-id="confirmClearAll"
            >
              <FormattedMessage id="udapp.yesClearAll" defaultMessage="Yes clear all" />
            </button>
          </div>
        </div>
      )}

      {/* Contract List or Empty State */}
      {deployedContracts.length === 0 && !showClearAllDialog ? (
        <div className="text-muted px-3 pb-1">
          <div className="empty-state-text">
            <FormattedMessage
              id="udapp.noDeployedContracts"
              defaultMessage="There is no contract to show."
            />
          </div>
          <div className='pb-3'>
            <span>
              <FormattedMessage
                id="udapp.orLearnMoreDeploying"
                defaultMessage="Learn how to deploy "
              /></span>
            <a href="https://remix-ide.readthedocs.io/en/latest/run.html" target='_blank'>
              <FormattedMessage
                id="udapp.learnEth"
                defaultMessage='"your first contract".'
              /></a>
          </div>
        </div>
      ) : (
        !showClearAllDialog && (
          <div className='px-3'>
            <div className="contracts-list">
              {deployedContracts.map((contract, index) => (
                <DeployedContractItem
                  key={`${contract.address}-${index}`}
                  contract={contract}
                  index={index}
                  registerRef={(ref) => {
                    if (ref) {
                      contractRefsMap.current.set(contract.address, ref)
                    }
                  }}
                  isKebabMenuOpen={openKebabMenuAddress === contract.address}
                  onKebabMenuToggle={(isOpen) => {
                    setOpenKebabMenuAddress(isOpen ? contract.address : null)
                  }}
                />
              ))}
            </div>
          </div>
        )
      )}
      {/* Floating scroll button - sticky position */}
      {showScrollButton && latestContractAddress && !showClearAllDialog && (
        <div
          style={{
            position: 'sticky',
            bottom: '10px',
            display: 'flex',
            justifyContent: 'center',
            paddingTop: '10px',
            paddingBottom: '10px',
            pointerEvents: 'none',
            zIndex: 1000
          }}
        >
          <span
            className="badge border p-2 text-secondary floating-scroll-button"
            onClick={scrollToLatestContract}
            data-id="scrollToNewInstance"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              pointerEvents: 'auto',
              fontWeight: 'light',
              backgroundColor: 'var(--custom-onsurface-layer-3)',
              cursor: 'pointer'
            }}
          >
            <i className="fas fa-angle-down"></i> {newInstancesCount} New {newInstancesCount === 1 ? 'Deployment' : 'Deployments'}
          </span>
        </div>
      )}
    </div>
  )
}
