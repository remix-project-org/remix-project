import React, { useState, useMemo } from 'react' // eslint-disable-line
import { FormattedMessage } from 'react-intl'
import { ContractCard } from './contract-card'
import { ContractDeployment, ContractInteraction, SortOrder, TabType } from './types'
import './transaction-recorder.css'

interface TransactionRecorderProps {
  requestDebug: (blockNumber: any, txNumber: string, tx: any) => void
  unloadRequested: (blockNumber: any, txIndex: any, tx: any) => void
  updateTxNumberFlag: (empty: boolean) => void
  transactionNumber: string
  debugging: boolean
  deployments?: ContractDeployment[]
  transactions?: Map<string, ContractInteraction[]>
  onDebugTransaction?: (txHash: string) => void
}

export const TransactionRecorder = (props: TransactionRecorderProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('contract-call')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
  }

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSortOrder(e.target.value as SortOrder)
  }

  const handleDebugTransaction = (txHash: string) => {
    if (props.onDebugTransaction) {
      props.onDebugTransaction(txHash)
    }
  }

  // Sort deployments based on sort order
  const sortedDeployments = useMemo(() => {
    if (!props.deployments) return []
    const sorted = [...props.deployments]
    sorted.sort((a, b) => {
      if (sortOrder === 'newest') {
        return b.timestamp - a.timestamp
      } else {
        return a.timestamp - b.timestamp
      }
    })
    return sorted
  }, [props.deployments, sortOrder])

  return (
    <div className="transaction-recorder">
      <div className="transaction-recorder-header">
        <h6 className="transaction-recorder-title">
          <FormattedMessage id="debugger.transactionRecorder" defaultMessage="Transaction recorder" />
        </h6>
      </div>

      <div className="transaction-recorder-tabs">
        <div className="tabs-filter-container">
          <ul className="nav nav-tabs" role="tablist">
            <li className="nav-item" role="presentation">
              <button
                className={`nav-link ${activeTab === 'contract-call' ? 'active' : ''}`}
                onClick={() => handleTabChange('contract-call')}
                type="button"
                role="tab"
                aria-selected={activeTab === 'contract-call'}
              >
                <FormattedMessage id="debugger.contractCall" defaultMessage="Contract call" />
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button
                className={`nav-link ${activeTab === 'transaction-list' ? 'active' : ''}`}
                onClick={() => handleTabChange('transaction-list')}
                type="button"
                role="tab"
                aria-selected={activeTab === 'transaction-list'}
              >
                <FormattedMessage id="debugger.transactionList" defaultMessage="Transaction list" />
              </button>
            </li>
          </ul>
          <div className="transaction-recorder-filter">
            <select
              className="form-select form-select-sm filter-dropdown"
              value={sortOrder}
              onChange={handleSortChange}
              aria-label="Sort order"
            >
              <option value="newest">
                <FormattedMessage id="debugger.newestFirst" defaultMessage="Newest first" />
              </option>
              <option value="oldest">
                <FormattedMessage id="debugger.oldestFirst" defaultMessage="Oldest first" />
              </option>
            </select>
          </div>
        </div>

        <div className="tab-content">
          {activeTab === 'contract-call' && (
            <div className="tab-pane active" role="tabpanel">
              <div className="contract-call-content">
                {sortedDeployments.length > 0 ? (
                  sortedDeployments.map((deployment) => (
                    <ContractCard
                      key={deployment.address}
                      deployment={deployment}
                      transactions={props.transactions?.get(deployment.address) || []}
                      onDebugTransaction={handleDebugTransaction}
                    />
                  ))
                ) : (
                  <p className="text-muted">
                    <FormattedMessage
                      id="debugger.contractCallPlaceholder"
                      defaultMessage="Deployed contracts will appear here"
                    />
                  </p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'transaction-list' && (
            <div className="tab-pane active" role="tabpanel">
              <div className="transaction-list-content p-3">
                <p className="text-muted">
                  <FormattedMessage
                    id="debugger.transactionListPlaceholder"
                    defaultMessage="All transactions will appear here"
                  />
                </p>
                {/* Transaction list content will be implemented here */}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TransactionRecorder
