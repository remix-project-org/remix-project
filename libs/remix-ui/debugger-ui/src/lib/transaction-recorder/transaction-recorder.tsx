import React, { useState } from 'react' // eslint-disable-line
import { FormattedMessage } from 'react-intl'
import './transaction-recorder.css'

interface TransactionRecorderProps {
  requestDebug: (blockNumber: any, txNumber: string, tx: any) => void
  unloadRequested: (blockNumber: any, txIndex: any, tx: any) => void
  updateTxNumberFlag: (empty: boolean) => void
  transactionNumber: string
  debugging: boolean
}

type SortOrder = 'newest' | 'oldest'
type TabType = 'contract-call' | 'transaction-list'

export const TransactionRecorder = (props: TransactionRecorderProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('contract-call')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab)
  }

  const handleSortChange = (e) => {
    setSortOrder(e.target.value as SortOrder)
  }

  return (
    <div className="transaction-recorder">
      <div className="transaction-recorder-header">
        <h6 className="transaction-recorder-title">
          <FormattedMessage id="debugger.transactionRecorder" defaultMessage="Transaction recorder" />
        </h6>
        <div className="transaction-recorder-filter">
          <select
            className="form-select form-select-sm"
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

      <div className="transaction-recorder-tabs">
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

        <div className="tab-content">
          {activeTab === 'contract-call' && (
            <div className="tab-pane active" role="tabpanel">
              <div className="contract-call-content p-3">
                <p className="text-muted">
                  <FormattedMessage
                    id="debugger.contractCallPlaceholder"
                    defaultMessage="Deployed contracts will appear here"
                  />
                </p>
                {/* Contract call content will be implemented here */}
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
