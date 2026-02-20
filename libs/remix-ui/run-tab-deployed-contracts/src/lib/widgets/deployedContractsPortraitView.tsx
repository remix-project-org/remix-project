import React, { useContext, useState } from 'react'
import { FormattedMessage } from 'react-intl'
import * as ethJSUtil from '@ethereumjs/util'
import { DeployedContractsAppContext } from '../contexts'
import { DeployedContractItem } from '../components/DeployedContractItem'
import { checkSumWarning } from '@remix-ui/helper'
import { loadAddress } from '../actions'

export default function DeployedContractsPortraitView() {
  const { widgetState, dispatch, plugin, themeQuality } = useContext(DeployedContractsAppContext)
  const { deployedContracts, showAddDialog, addressInput, showClearAllDialog, loadType, currentFile } = widgetState
  const [enableAtAddress, setEnableAtAddress] = useState(false)

  const handleAddClick = () => {
    dispatch({ type: 'SHOW_ADD_DIALOG', payload: true })
    dispatch({ type: 'SHOW_CLEAR_ALL_DIALOG', payload: false })
  }

  const handleClearAllClick = async () => {
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
    } catch (e) {
      console.error('Error adding contract:', e)
      await plugin.call('notification', 'toast', `⚠️ Error adding contract: ${e.message}`)
    }
  }

  const handleCancelAdd = () => {
    dispatch({ type: 'SHOW_ADD_DIALOG', payload: false })
    dispatch({ type: 'SET_ADDRESS_INPUT', payload: '' })
  }

  const handleConfirmClearAll = async () => {
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
    dispatch({ type: 'SHOW_CLEAR_ALL_DIALOG', payload: false })
  }

  const handleAddressInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    dispatch({ type: 'SET_ADDRESS_INPUT', payload: value })

    // Enable button if address is provided and file type is valid
    // Valid types: compiled contracts (.sol, .vy, .lex, .contract) or ABI files (.abi)
    if (!value) {
      setEnableAtAddress(false)
    } else {
      if (['sol', 'vyper', 'lexon', 'contract', 'abi'].includes(loadType)) {
        setEnableAtAddress(true)
      } else {
        setEnableAtAddress(false)
      }
    }
  }

  return (
    <div className="deployed-contracts-container card mx-2 my-2" data-id="deployedContractsContainer" style={{ backgroundColor: 'var(--custom-onsurface-layer-1)', '--theme-text-color': themeQuality === 'dark' ? 'white' : 'black' } as React.CSSProperties}>
      <div className="p-3 d-flex align-items-center justify-content-between" style={{ cursor: 'pointer' }}>
        <div className='d-flex align-items-center gap-2'>
          <h6 className="my-auto" style={{ color: themeQuality === 'dark' ? 'white' : 'black', margin: 0 }}>
            <FormattedMessage id="udapp.deployedContracts" defaultMessage="Deployed Contracts" />
          </h6>
          <span className="text-secondary" data-id="deployedContractsBadge">{deployedContracts.length}</span>
        </div>
        <div>
          <button className='btn btn-primary btn-sm small' style={{ fontSize: '0.7rem' }} onClick={handleAddClick} data-id="addDeployedContract">
            <i className='fa-solid fa-plus'></i> Add
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
      { !showClearAllDialog && <p className='text-muted px-3' style={{ fontSize: '0.8rem' }}>Make calls to your deployed contracts</p>}
      {/* Add Contract Dialog */}
      {showAddDialog && (
        <div className="m-3 mt-0 p-3 rounded" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <p className="mb-0" style={{ color: themeQuality === 'dark' ? 'white' : 'black', fontSize: '0.9rem' }}>
              Add a deployed contract
            </p>
            <button
              className="btn btn-sm"
              onClick={handleCancelAdd}
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
            <p className="mb-0 text-danger" style={{ color: themeQuality === 'dark' ? 'white' : 'black', fontSize: '0.9rem' }}>
            Clear all deployed contracts
            </p>
            <button
              className="btn btn-sm"
              onClick={handleCancelClearAll}
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
          <p style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>Do you want to proceed?</p>
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
            <a href="#">
              <FormattedMessage
                id="udapp.deployFirstContract"
                defaultMessage="Deploy your first contract"
              />
            </a>
            <span>
              <FormattedMessage
                id="udapp.orLearnMoreDeploying"
                defaultMessage=", or learn how to do it following our "
              /></span>
            <a href="#">
              <FormattedMessage
                id="udapp.learnEth"
                defaultMessage="in-app tutorials."
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
                />
              ))}
            </div>
          </div>
        )
      )}
    </div>
  )
}
