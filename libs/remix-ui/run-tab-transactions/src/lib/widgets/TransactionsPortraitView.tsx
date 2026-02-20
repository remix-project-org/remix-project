import React, { useMemo, useContext } from 'react'
import { FormattedMessage } from 'react-intl'
import { Dropdown } from 'react-bootstrap'
import { CustomToggle } from '@remix-ui/helper'
import { TransactionsAppContext } from '../contexts'
import { TabType } from '../types'
import { TransactionRecordCard } from '../components/TransactionRecordCard'
import { TransactionItem } from '../components/TransactionItem'

function TransactionsPortraitView() {
  const { plugin, widgetState, dispatch, themeQuality } = useContext(TransactionsAppContext)

  const { activeTab, sortOrder, showClearAllDialog, showSaveDialog, scenarioInput } = widgetState

  const handleTabChange = (tab: TabType) => {
    dispatch({ type: 'SET_ACTIVE_TAB', payload: tab })
  }

  const handleClearAllClick = () => {
    dispatch({ type: 'SHOW_CLEAR_ALL_DIALOG', payload: true })
  }

  const handleConfirmClearAll = () => {
    dispatch({ type: 'CLEAR_RECORDER_DATA' })
  }

  const handleCancelClearAll = () => {
    dispatch({ type: 'SHOW_CLEAR_ALL_DIALOG', payload: false })
  }

  const handleSaveClick = async () => {
    if (widgetState.recorderData.journal.length === 0) {
      await plugin.call('notification', 'toast', 'There are no transactions to save')
      return
    }
    dispatch({ type: 'SHOW_SAVE_DIALOG', payload: true })
    dispatch({ type: 'SHOW_CLEAR_ALL_DIALOG', payload: false })
  }

  const handleCancelSave = () => {
    dispatch({ type: 'SHOW_SAVE_DIALOG', payload: false })
  }

  const handleScenarioInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_SCENARIO_INPUT', payload: e.target.value })
  }

  const handleSaveScenario = async () => {
    try {
      // Save the recorder data to the scenario file
      const scenario = {
        accounts: widgetState.recorderData._usedAccounts,
        linkReferences: widgetState.recorderData._linkReferences,
        transactions: widgetState.recorderData.journal,
        abis: widgetState.recorderData._abis
      }

      await plugin.call('fileManager', 'writeFile', scenarioInput, JSON.stringify(scenario, null, 2))

      // Save the scenario path to remix.config.json
      let config: any = {}
      try {
        const configContent = await plugin.call('fileManager', 'readFile', 'remix.config.json')
        config = JSON.parse(configContent)
      } catch (e) {
        // File doesn't exist, create new config
      }

      config.scenarios = config.scenarios || {}
      config.scenarios.lastSavedScenario = scenarioInput

      await plugin.call('fileManager', 'writeFile', 'remix.config.json', JSON.stringify(config, null, 2))

      await plugin.call('notification', 'toast', `Scenario saved to ${scenarioInput}`)
      dispatch({ type: 'SHOW_SAVE_DIALOG', payload: false })
    } catch (error) {
      console.error('Error saving scenario:', error)
      await plugin.call('notification', 'toast', `Error saving scenario: ${error.message}`)
    }
  }

  // Sort deployments based on sort order
  const sortedDeployments = useMemo(() => {
    const deployments = widgetState.recorderData.journal.filter(journal => journal.record.type === 'constructor')

    if (!deployments) return []
    const sorted = [...deployments]
    sorted.sort((a, b) => {
      if (sortOrder === 'newest') {
        return b.timestamp - a.timestamp
      } else {
        return a.timestamp - b.timestamp
      }
    })
    return sorted
  }, [widgetState.recorderData.journal, sortOrder])

  // Sort all transactions based on sort order
  const sortedTransactions = useMemo(() => {
    const transactions = widgetState.recorderData.journal

    if (!transactions) return []
    const sorted = [...transactions]
    sorted.sort((a, b) => {
      if (sortOrder === 'newest') {
        return b.timestamp - a.timestamp
      } else {
        return a.timestamp - b.timestamp
      }
    })
    return sorted
  }, [widgetState.recorderData.journal, sortOrder])

  return (
    <div className="card mx-2 my-2" style={{ backgroundColor: 'var(--custom-onsurface-layer-1)', '--theme-text-color': themeQuality === 'dark' ? 'white' : 'black' } as React.CSSProperties}>
      <div className="p-3 d-flex align-items-center justify-content-between" style={{ cursor: 'pointer' }}>
        <div className='d-flex align-items-center gap-2'>
          <h6 className="my-auto" style={{ color: themeQuality === 'dark' ? 'white' : 'black', margin: 0, }}>
            <FormattedMessage id="udapp.transactionRecorderTitle" defaultMessage="Transactions recorder" /> <span className="text-secondary small">{widgetState.recorderData.journal.length}</span>
          </h6>
        </div>
        { !showClearAllDialog && !showSaveDialog &&
          <div>
            <button className='btn btn-primary btn-sm small p-1' style={{ fontSize: '0.6rem' }} onClick={handleSaveClick}>
              <i className='fa-solid fa-floppy-disk'></i> Save
            </button>
            <button
              className="btn btn-outline-danger btn-sm pe-0"
              data-id="clearAllTransactions"
              style={{ background: 'none', border: 'none' }}
              onClick={handleClearAllClick}
            >
              <i className="far fa-trash-alt text-danger" aria-hidden="true"></i>
            </button>
          </div>
        }
      </div>

      {/* Add Contract Dialog */}
      {showSaveDialog && (
        <div className="m-3 mt-0 p-3 rounded" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <p className="mb-0" style={{ color: themeQuality === 'dark' ? 'white' : 'black', fontSize: '0.9rem' }}>
              Save transactions
            </p>
            <button
              className="btn btn-sm"
              onClick={handleCancelSave}
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
              defaultMessage="Save transactions (deployed contracts and function executions) and replay them in another environment"
            />
          </p>
          <div className="d-flex align-items-center mb-2">
            <label className="mb-0 me-2" style={{ color: 'var(--bs-tertiary)' }}>
                Scenario name
            </label>
          </div>
          <div className="position-relative flex-fill">
            <input
              type="text"
              value={scenarioInput}
              placeholder="scenario.json"
              className="form-control"
              onChange={handleScenarioInputChange}
              style={{ backgroundColor: 'var(--bs-body-bg)', color: themeQuality === 'dark' ? 'white' : 'black', flex: 1, padding: '0.75rem', paddingRight: '3.5rem', fontSize: '0.75rem' }}
            />
            <button
              className="btn btn-sm btn-primary"
              onClick={handleSaveScenario}
              style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', zIndex: 2, fontSize: '0.65rem', fontWeight: 'bold' }}
            >
                Save
            </button>
          </div>
        </div>
      )}

      {/* Clear All Confirmation Dialog */}
      {showClearAllDialog && (
        <div className="m-3 mt-0 p-3 rounded" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <p className="mb-0" style={{ color: themeQuality === 'dark' ? 'white' : 'black', fontSize: '0.9rem' }}>
              <FormattedMessage
                id="udapp.clearAllTransactionsTitle"
                defaultMessage="Clear all transactions"
              />
            </p>
            <button
              className="btn btn-sm"
              onClick={handleCancelClearAll}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '1.2rem',
                color: themeQuality === 'dark' ? 'white' : 'black',
                padding: 0
              }}
            > × </button>
          </div>
          <p className="text-sm mb-3">
            <FormattedMessage
              id="udapp.clearAllTransactionsConfirm"
              defaultMessage="You are about to delete the list of your recorded transactions."
            />
          </p>
          <p style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>Do you want to proceed?</p>
          <div className="d-flex justify-content-between align-items-center gap-3">
            <button
              className="btn btn-sm btn-secondary flex-fill"
              onClick={handleCancelClearAll}
              data-id="cancelClearAllTransactions"
            >
              <FormattedMessage id="udapp.cancel" defaultMessage="Cancel" />
            </button>
            <button
              className="btn btn-sm btn-danger text-light flex-fill"
              onClick={handleConfirmClearAll}
              data-id="confirmClearAllTransactions"
            >
              <FormattedMessage id="udapp.yesClearAllTransactions" defaultMessage="Yes clear all" />
            </button>
          </div>
        </div>
      )}

      {!showClearAllDialog && (
        <div className="transaction-recorder-tabs p-2 pt-0">
          <div className="tabs-filter-container">
            <ul className="nav nav-tabs" role="tablist">
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link ${activeTab === 'ContractCall' ? 'active' : ''} rounded px-2`}
                  onClick={() => handleTabChange('ContractCall')}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'ContractCall'}
                  style={{ backgroundColor: activeTab === 'ContractCall' ? 'var(--custom-onsurface-layer-2)' : '' }}
                >
                  <FormattedMessage id="debugger.contractCall" defaultMessage="Contract call" />
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link ${activeTab === 'TransactionList' ? 'active' : ''} rounded px-2`}
                  onClick={() => handleTabChange('TransactionList')}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'TransactionList'}
                  style={{ backgroundColor: activeTab === 'TransactionList' ? 'var(--custom-onsurface-layer-2)' : '' }}
                >
                  <FormattedMessage id="debugger.transactionList" defaultMessage="Transaction List" />
                </button>
              </li>
            </ul>
            <div className="transaction-recorder-filter">
              <Dropdown>
                <Dropdown.Toggle
                  as={CustomToggle}
                  className="btn-sm border-0 p-1 text-secondary rounded"
                  style={{ backgroundColor: 'var(--custom-onsurface-layer-1)', color: themeQuality === 'dark' ? 'white' : 'black' }}
                  icon="fas fa-caret-down ms-2"
                  useDefaultIcon={false}
                >
                  {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
                </Dropdown.Toggle>
                <Dropdown.Menu style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', '--theme-text-color': themeQuality === 'dark' ? 'white' : 'black', padding: 0, '--bs-dropdown-min-width' : '5rem' } as React.CSSProperties}>
                  <Dropdown.Item className="unit-dropdown-item-hover small" onClick={() => dispatch({ type: 'SET_SORT_ORDER', payload: 'newest' })} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>Newest</Dropdown.Item>
                  <Dropdown.Item className="unit-dropdown-item-hover small" onClick={() => dispatch({ type: 'SET_SORT_ORDER', payload: 'oldest' })} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>Oldest</Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            </div>
          </div>

          <div className="tab-content">
            {activeTab === 'ContractCall' ? (
              <div className="tab-pane active" role="tabpanel">
                <div className="contract-call-content">
                  {sortedDeployments.length > 0 ? (
                    sortedDeployments.map((deployment) => (
                      <TransactionRecordCard
                        key={deployment?.record?.targetAddress}
                        deployment={deployment}
                      />
                    ))
                  ) : (
                    <div className="text-muted p-3 mt-2 rounded" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
                      <div className="empty-state-text">
                        <FormattedMessage
                          id="debugger.noTransactionsToShow"
                          defaultMessage="There is no deployment to show."
                        />
                      </div>
                      <div>
                        <span>
                          <FormattedMessage
                            id="debugger.initiateFirstTransaction"
                            defaultMessage="Initiate your first transaction by deploying a contract, or learn more following our "
                          />
                        </span>
                        <a href="#">
                          <FormattedMessage
                            id="debugger.inAppTutorials"
                            defaultMessage="in-app tutorials."
                          />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="tab-pane active" role="tabpanel">
                <div className="transaction-list-content">
                  {sortedTransactions.length > 0 ? (
                    sortedTransactions.map((transaction, index) => (
                      <TransactionItem
                        key={`${transaction?.record?.txHash || transaction?.timestamp}-${index}`}
                        transaction={transaction}
                      />
                    ))
                  ) : (
                    <div className="text-muted p-3 mt-2 rounded" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
                      <div className="empty-state-text">
                        <FormattedMessage
                          id="debugger.noTransactionsToShow"
                          defaultMessage="There are no transactions to show."
                        />
                      </div>
                      <div>
                        <span>
                          <FormattedMessage
                            id="debugger.initiateFirstTransaction"
                            defaultMessage="Initiate your first transaction by deploying a contract, or learn more following our "
                          />
                        </span>
                        <a href="#">
                          <FormattedMessage
                            id="debugger.inAppTutorials"
                            defaultMessage="in-app tutorials."
                          />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default TransactionsPortraitView