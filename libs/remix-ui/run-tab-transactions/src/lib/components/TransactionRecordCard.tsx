import React, { useRef, useState, useContext, useMemo } from 'react'
import { getTimeAgo, shortenAddress } from '@remix-ui/helper'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { TransactionsAppContext } from '../contexts'
import { Transaction } from '../types'
import { TransactionKebabMenu } from './TransactionKebabMenu'
import { debugTransaction, replayTransaction, openTransactionInTerminal, openTransactionInExplorer, clearTransaction } from '../actions'

export const TransactionRecordCard = ({ deployment }: { deployment: Transaction }) => {
  const { plugin, widgetState, dispatch } = useContext(TransactionsAppContext)
  const [isExpanded, setIsExpanded] = useState(false)
  const [showKebabMenu, setShowKebabMenu] = useState<boolean>(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const kebabIconRefs = useRef<{ [key: string]: HTMLElement }>({})

  const transactions = useMemo(() => {
    let transactions: Transaction[] = []

    transactions = widgetState.recorderData.journal.filter(journal => journal.record.targetAddress === deployment.record.targetAddress)
    return transactions
  }, [widgetState.recorderData.journal])

  const handleCardClick = () => {
    if (transactions.length === 0) {
      plugin.call('notification', 'toast', 'No transactions to display')
    } else {
      setIsExpanded(!isExpanded)
    }
  }

  const handleKebabClick = (e: React.MouseEvent, transaction: Transaction) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedTransaction(transaction)
    setShowKebabMenu(prev => !prev)
  }

  const handleDebug = async (tx: Transaction) => {
    setShowKebabMenu(false)
    await debugTransaction(plugin, tx)
  }

  const handleReplay = async (tx: Transaction) => {
    setShowKebabMenu(false)
    await replayTransaction(tx, widgetState.recorderData, plugin, dispatch)
  }

  const handleOpenInTerminal = async (tx: Transaction) => {
    setShowKebabMenu(false)
    await openTransactionInTerminal(plugin, tx)
  }

  const handleOpenInExplorer = async (tx: Transaction) => {
    setShowKebabMenu(false)
    await openTransactionInExplorer(plugin, tx)
  }

  const handleClear = async (tx: Transaction) => {
    setShowKebabMenu(false)
    await clearTransaction(plugin, tx)
  }

  return (
    <div className="contract-card my-2 rounded" style={{ backgroundColor: 'var(--custom-onsurface-layer-2' }}>
      <div className="d-flex align-items-center justify-content-between w-100 p-3 text-nowrap text-truncate overflow-hidden" onClick={handleCardClick}>
        <div className='d-flex flex-column align-items-start'>
          <div className="text-truncate text-secondary d-flex align-items-center">
            <span>{deployment?.record?.contractName}</span>
          </div>
          <div className="font-sm" style={{ color: 'var(--bs-tertiary-color)', position: 'relative' }}>
            <span className="text-dark">{shortenAddress(deployment?.record?.targetAddress)}</span>
            <CopyToClipboard tip="Copy address" icon="fa-copy" direction="top" getContent={() => deployment?.record?.targetAddress}>
              <i className="fa-solid fa-copy small ms-1" style={{ cursor: 'pointer' }}></i>
            </CopyToClipboard>
          </div>
        </div>
        <div className='d-flex' style={{ color: 'var(--bs-tertiary-color)' }}>
          <div className='d-flex flex-column align-items-end'>
            <span className='badge text-info' style={{ backgroundColor: '#64C4FF14' }}>{transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'}</span>
            <span className='small'>Deployed {getTimeAgo(deployment?.timestamp, { truncateTimeAgo: true })} ago</span>
          </div>
        </div>
      </div>

      {isExpanded && transactions.length > 0 && transactions.map((transaction, index) => {
        const isSuccess = transaction?.record?.status === 1 || transaction?.record?.status === '0x1' || transaction?.record?.status === true
        const abis = widgetState.recorderData?._abis[transaction.record?.abi]
        const tagIndex = Object.keys(abis).findIndex(key => abis[key].name === transaction?.record?.name)
        const tag = tagIndex >= 0 && abis
          ? (abis[tagIndex]?.stateMutability === 'view' || abis[tagIndex]?.stateMutability === 'pure' ? 'call'
            : abis[tagIndex]?.stateMutability === 'payable' ? 'payable' : 'transact')
          : (transaction?.record?.type === 'constructor' ? 'deploy' : 'transact')

        return <div key={index} className="list-group-item px-0">
          <div className="d-flex align-items-center justify-content-between w-100 p-3 text-nowrap text-truncate overflow-hidden border-top" onClick={handleCardClick}>
            <div className='d-flex'>
              { isSuccess ? (
                <i className="fas fa-check-circle align-self-center me-2 text-success"></i>
              ) : (
                <i className="fas fa-times-circle align-self-center me-2 text-danger"></i>
              )}
              <div className='d-flex flex-column align-items-start'>
                <div className="text-truncate text-secondary d-flex align-items-center">
                  <span>{transaction?.record?.name || transaction?.record?.type}</span>
                </div>
                <div className="font-sm" style={{ color: 'var(--bs-tertiary-color)', position: 'relative' }}>
                  <span className="text-dark">tx: {shortenAddress(transaction?.record?.txHash)}</span>
                  <CopyToClipboard tip="Copy address" icon="fa-copy" direction="top" getContent={() => transaction?.record?.txHash}>
                    <i className="fa-solid fa-copy small ms-1" style={{ cursor: 'pointer' }}></i>
                  </CopyToClipboard>
                </div>
              </div>
            </div>
            <div className='d-flex' style={{ color: 'var(--bs-tertiary-color)' }}>
              <div className='d-flex flex-column align-items-end'>
                <span
                  className={`badge ${tag === 'payable' ? 'text-danger' : tag === 'call' ? 'text-info' : tag === 'deploy' ? 'text-success' : 'text-warning'}`}
                  style={{ backgroundColor: tag === 'payable' ? '#FF777714' : tag === 'call' ? '#64C4FF14' : tag === 'deploy' ? '#00ff0014' : '#FFB96414' }}
                >
                  {tag}
                </span>
                <span className='small'>{getTimeAgo(transaction?.timestamp, { truncateTimeAgo: true })} ago</span>
              </div>
              <i
                ref={(el) => { if (el) kebabIconRefs.current[transaction.record?.txHash] = el }}
                className="fas fa-ellipsis-v align-self-center p-2 mx-1"
                style={{ cursor: 'pointer' }}
                onClick={(e) => handleKebabClick(e, transaction)}
              ></i>
            </div>
          </div>
          {selectedTransaction?.record?.txHash === transaction?.record?.txHash && (
            <TransactionKebabMenu
              show={showKebabMenu}
              target={kebabIconRefs.current[transaction.record?.txHash]}
              onHide={() => setShowKebabMenu(false)}
              transaction={transaction}
              onDebug={handleDebug}
              onReplay={handleReplay}
              onOpenInTerminal={handleOpenInTerminal}
              onOpenInExplorer={handleOpenInExplorer}
              onClear={handleClear}
            />
          )}
        </div>
      })}
    </div>
  )}

export default TransactionRecordCard
