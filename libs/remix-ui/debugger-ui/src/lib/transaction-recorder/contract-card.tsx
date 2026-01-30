import React, { useState } from 'react' // eslint-disable-line
import { FormattedMessage } from 'react-intl'
import { ContractDeployment, ContractInteraction } from './types'
import { CustomTooltip } from '@remix-ui/helper'
import './contract-card.css'

interface ContractCardProps {
  deployment: ContractDeployment
  transactions: ContractInteraction[]
  onDebugTransaction: (txHash: string) => void
}

export const ContractCard = ({ deployment, transactions, onDebugTransaction }: ContractCardProps) => {
  const [isExpanded, setIsExpanded] = useState(true)
  const [copyTooltip, setCopyTooltip] = useState('Copy Address')

  const formatAddress = (address: string | undefined) => {
    if (!address) return ''
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopyTooltip('Copied')
  }

  const resetTooltip = () => {
    setTimeout(() => {
      setCopyTooltip('Copy Address')
    }, 500)
  }

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return 'just now'
  }

  return (
    <div className="contract-card">
      <div className="contract-card-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="contract-card-title">
          <div className="contract-card-title-row">
            <span className="contract-card-name">{deployment.name}</span>
          </div>
          <div className="contract-card-address-row">
            <span className="contract-card-address">{formatAddress(deployment.address)}</span>
            <CustomTooltip tooltipText={copyTooltip} tooltipId="contract-address-copy-tooltip" placement="top">
              <button
                className="contract-card-copy-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  copyToClipboard(deployment.address || '')
                }}
                onMouseLeave={resetTooltip}
              >
                <i className="far fa-copy"></i>
              </button>
            </CustomTooltip>
          </div>
        </div>
        <div className="contract-card-meta">
          <span className="badge bg-primary contract-card-count">
            {transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'}
          </span>
          <span className="contract-card-deployed">Deployed {formatRelativeTime(deployment.timestamp)}</span>
        </div>
      </div>

      {isExpanded && (
        <div className="contract-card-content">

          {transactions.length > 0 ? (
            <div className="contract-interactions">
              <div className="interactions-list">
                {transactions.map((transaction, index) => (
                  <div key={index} className="interaction-item">
                    <div className="interaction-header">
                      <span className="interaction-method">
                        {transaction.methodName || <FormattedMessage id="debugger.unknownMethod" defaultMessage="Unknown method" />}
                      </span>
                      <span className="interaction-time">{formatTimestamp(transaction.timestamp)}</span>
                    </div>
                    <div className="interaction-details">
                      <span className="interaction-from">
                        <FormattedMessage id="debugger.from" defaultMessage="From:" /> {formatAddress(transaction.from)}
                      </span>
                      <button
                        className="interaction-debug-btn"
                        onClick={() => onDebugTransaction(transaction.transactionHash)}
                        title={transaction.transactionHash}
                      >
                        <i className="fas fa-bug"></i> <FormattedMessage id="debugger.debug" defaultMessage="Debug" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="no-interactions">
              <FormattedMessage id="debugger.noTransactions" defaultMessage="No transactions yet" />
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default ContractCard
