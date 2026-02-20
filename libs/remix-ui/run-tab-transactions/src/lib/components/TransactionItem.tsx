import React, { useRef, useState, useContext } from 'react'
import { getTimeAgo, shortenAddress } from '@remix-ui/helper'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { TransactionsAppContext } from '../contexts'
import { Transaction } from '../types'
import { TransactionKebabMenu } from './TransactionKebabMenu'
import { debugTransaction, replayTransaction, openTransactionInTerminal, openTransactionInExplorer, clearTransaction } from '../actions'

export const TransactionItem = ({ transaction }: { transaction: Transaction }) => {
  const { plugin, widgetState, dispatch } = useContext(TransactionsAppContext)
  const [showKebabMenu, setShowKebabMenu] = useState<boolean>(false)
  const kebabIconRef = useRef<HTMLElement>(null)

  const isSuccess = transaction?.record?.status === 1 || transaction?.record?.status === '0x1' || transaction?.record?.status === true
  const abis = widgetState.recorderData?._abis[transaction.record?.abi]
  const tagIndex = abis ? Object.keys(abis).findIndex(key => abis[key].name === transaction?.record?.name) : -1
  const tag = tagIndex >= 0 && abis
    ? (abis[tagIndex]?.stateMutability === 'view' || abis[tagIndex]?.stateMutability === 'pure' ? 'call'
      : abis[tagIndex]?.stateMutability === 'payable' ? 'payable' : 'transact')
    : (transaction?.record?.type === 'constructor' ? 'deploy' : 'transact')

  const handleKebabClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
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
    <div className="transaction-item my-2 rounded" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
      <div className="d-flex align-items-center justify-content-between w-100 p-3 text-nowrap text-truncate overflow-hidden">
        <div className='d-flex'>
          {isSuccess ? (
            <i className="fas fa-check-circle align-self-center me-2 text-success"></i>
          ) : (
            <i className="fas fa-times-circle align-self-center me-2 text-danger"></i>
          )}
          <div className='d-flex flex-column align-items-start'>
            <div className="text-truncate text-secondary d-flex align-items-center">
              <span>{transaction?.record?.contractName || transaction?.record?.name || transaction?.record?.type}</span>
            </div>
            <div className="font-sm" style={{ color: 'var(--bs-tertiary-color)', position: 'relative' }}>
              <span className="text-dark">tx: {shortenAddress(transaction?.record?.txHash)}</span>
              <CopyToClipboard tip="Copy transaction hash" icon="fa-copy" direction="top" getContent={() => transaction?.record?.txHash}>
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
            ref={kebabIconRef}
            className="fas fa-ellipsis-v align-self-center p-2 mx-1"
            style={{ cursor: 'pointer' }}
            onClick={handleKebabClick}
          ></i>
        </div>
      </div>
      {showKebabMenu && (
        <TransactionKebabMenu
          show={showKebabMenu}
          target={kebabIconRef.current}
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
  )
}

export default TransactionItem
