import React, { useRef, useState, useContext } from 'react'
import { getTimeAgo, shortenAddress } from '@remix-ui/helper'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { TransactionsAppContext } from '../contexts'
import { Transaction } from '../types'
import { TransactionKebabMenu } from './TransactionKebabMenu'
import { debugTransaction, replayTransaction, openTransactionInTerminal, openTransactionInExplorer, clearTransaction } from '../actions'
import { TrackingContext } from '@remix-ide/tracking'

interface TransactionItemProps {
  transaction: Transaction
  openKebabMenuId: string | null
  onKebabMenuToggle: (txHash: string | null) => void
}

export const TransactionItem = ({ transaction, openKebabMenuId, onKebabMenuToggle }: TransactionItemProps) => {
  const { plugin, widgetState, dispatch } = useContext(TransactionsAppContext)
  const { trackMatomoEvent } = useContext(TrackingContext)
  const kebabIconRef = useRef<HTMLElement>(null)

  const txHash = transaction?.record?.txHash || String(transaction?.timestamp)
  const showKebabMenu = openKebabMenuId === txHash

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
    trackMatomoEvent?.({ category: 'udapp', action: 'transactionKebabMenuOpen', name: shortenAddress(transaction?.record?.txHash), isClick: true })
    onKebabMenuToggle(showKebabMenu ? null : txHash)
  }

  const handleDebug = async (tx: Transaction) => {
    onKebabMenuToggle(null)
    await debugTransaction(plugin, tx)
  }

  const handleReplay = async (tx: Transaction) => {
    onKebabMenuToggle(null)
    await replayTransaction(tx, widgetState.recorderData, plugin)
  }

  const handleOpenInTerminal = async (tx: Transaction) => {
    onKebabMenuToggle(null)
    await openTransactionInTerminal(plugin, tx)
  }

  const handleOpenInExplorer = async (tx: Transaction) => {
    onKebabMenuToggle(null)
    await openTransactionInExplorer(plugin, tx)
  }

  const handleClear = async (tx: Transaction) => {
    onKebabMenuToggle(null)
    await clearTransaction(plugin, tx, dispatch)
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
              <CopyToClipboard tip="Copy transaction hash" icon="fa-copy" direction="top" getContent={() => transaction?.record?.txHash} callback={() => trackMatomoEvent?.({ category: 'udapp', action: 'transactionCopyHash', name: shortenAddress(transaction?.record?.txHash), isClick: true })}>
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
          onHide={() => onKebabMenuToggle(null)}
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
