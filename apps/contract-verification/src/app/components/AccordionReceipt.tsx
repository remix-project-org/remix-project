import React, { useMemo } from 'react'
import { SubmittedContract, VerificationReceipt, VerificationStatus } from '../types'
import { shortenAddress, CustomTooltip } from '@remix-ui/helper'
import { AppContext } from '../AppContext'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { getVerifier } from '../Verifiers'
import { CompilerAbstract } from '@remix-project/remix-solidity'
import { mergeChainSettingsWithDefaults } from '../utils'

interface AccordionReceiptProps {
  contract: SubmittedContract
  index: number
}

export const AccordionReceipt: React.FC<AccordionReceiptProps> = ({ contract, index }) => {
  const { chains, settings, compilationOutput, setSubmittedContracts } = React.useContext(AppContext)

  const [expanded, setExpanded] = React.useState(false)

  const chain = useMemo(() => {
    return chains.find((c) => c.chainId === parseInt(contract.chainId))
  }, [contract, chains])
  const chainName = chain?.name ?? 'Unknown Chain'

  const hasProxy = contract.proxyAddress && contract.proxyReceipts

  const toggleAccordion = () => {
    setExpanded(!expanded)
  }

  const isRetryAvailable = useMemo(() => {
    if (!compilationOutput) return false
    
    const compilerAbstract = Object.values(compilationOutput || {}).find(
      (abstract: CompilerAbstract) => 
        abstract.data.contracts[contract.filePath] &&
        abstract.data.contracts[contract.filePath][contract.contractName]
    )
    return !!compilerAbstract
  }, [compilationOutput, contract.filePath, contract.contractName])

  const handleRetryVerification = async (receipt: VerificationReceipt) => {
    setSubmittedContracts(prev => {
      const currentContract = prev[contract.id]
      if (!currentContract) return prev
      
      return {
        ...prev,
        [contract.id]: {
          ...currentContract,
          receipts: (currentContract.receipts || []).map(r =>
            r === receipt ? { ...r, status: 'pending' as VerificationStatus, message: 'Retrying...' } : r
          ),
          proxyReceipts: (currentContract.proxyReceipts || []).map(r =>
            r === receipt ? { ...r, status: 'pending' as VerificationStatus, message: 'Retrying...' } : r
          )
        }
      }
    })

    try {
      const chainSettings = mergeChainSettingsWithDefaults(contract.chainId, settings)
      const verifierSettings = chainSettings.verifiers[receipt.verifierInfo.name]

      if (!verifierSettings || !verifierSettings.apiUrl) {
        throw new Error('Verifier settings or apiUrl not found.')
      }
      
      const verifier = getVerifier(receipt.verifierInfo.name, verifierSettings)

      let response

      if (receipt.isProxyReceipt) {
        if (!verifier.verifyProxy) {
          throw new Error(`Proxy verification not supported by ${receipt.verifierInfo.name}`)
        }
        response = await verifier.verifyProxy(contract)
      } else {
        const compilerAbstract = Object.values(compilationOutput || {}).find(
          (abstract: CompilerAbstract) => 
            abstract.data.contracts[contract.filePath] &&
            abstract.data.contracts[contract.filePath][contract.contractName]
        )
        
        if (!compilerAbstract) {
          const userMessage = `Compilation output not found. Please re-compile the contract file ('${contract.filePath}') and try again.`
          console.error(`[Retry] ${userMessage}`)
          throw new Error(userMessage) 
        }

        response = await verifier.verify(contract, compilerAbstract)
      }

      setSubmittedContracts(prev => {
        const currentContract = prev[contract.id]
        if (!currentContract) return prev
        return {
          ...prev,
          [contract.id]: {
            ...currentContract,
            receipts: (currentContract.receipts || []).map(r =>
              r === receipt ? { ...r, ...response, receiptId: response.receiptId || undefined, status: response.status, message: response.message } : r
            ),
            proxyReceipts: (currentContract.proxyReceipts || []).map(r =>
              r === receipt ? { ...r, ...response, receiptId: response.receiptId || undefined, status: response.status, message: response.message } : r
            )
          }
        }
      })

    } catch (e) {
      console.error(e)
      setSubmittedContracts(prev => {
        const currentContract = prev[contract.id]
        if (!currentContract) return prev
        return {
          ...prev,
          [contract.id]: {
            ...currentContract,
            receipts: (currentContract.receipts || []).map(r =>
              r === receipt ? { ...r, status: 'failed' as VerificationStatus, message: e.message } : r
            ),
            proxyReceipts: (currentContract.proxyReceipts || []).map(r =>
              r === receipt ? { ...r, status: 'failed' as VerificationStatus, message: e.message } : r
            )
          }
        }
      })
    }
  }

  return (
    <div className={`${expanded ? 'bg-light' : 'border-bottom '}`}>
      <div className="d-flex flex-row align-items-center">
        <button className="btn" onClick={toggleAccordion} style={{ padding: '0.45rem' }}>
          <i className={`fas ${expanded ? 'fa-angle-down' : 'fa-angle-right'} text-secondary`}></i>
        </button>

        <div className="small w-100 text-uppercase overflow-hidden text-nowrap">
          <CustomTooltip
            placement="bottom"
            tooltipClasses=" text-break"
            tooltipText={`Contract: ${contract.contractName}, Address: ${contract.address}, Chain: ${chainName}, Proxy: ${contract.proxyAddress}`}
          >
            <span>
              {contract.contractName} at {shortenAddress(contract.address)} {contract.proxyAddress ? 'with proxy' : ''}
            </span>
          </CustomTooltip>
        </div>

        <button className="btn" style={{ padding: '0.15rem' }}>
          <CopyToClipboard tip="Copy" content={contract.address} direction={'top'} />
        </button>
      </div>

      <div className={`${expanded ? '' : 'd-none'} px-2 pt-2 pb-3 small`}>
        <div>
          <span className="fw-bold">Chain: </span>
          {chainName} ({contract.chainId})
        </div>
        <div>
          <span className="fw-bold">File: </span>
          <span className="text-break">{contract.filePath}</span>
        </div>
        <div>
          <span className="fw-bold">Submitted at: </span>
          {new Date(contract.date).toLocaleString()}
        </div>

        <div>
          <span className="fw-bold">Verified at: </span>
          <ReceiptsBody receipts={contract.receipts} handleRetry={handleRetryVerification} isRetryAvailable={isRetryAvailable} />
        </div>

        {hasProxy && (
          <>
            <div className="mt-3">
              <span className="fw-bold">Proxy Address: </span>
              <CustomTooltip placement="top" tooltipClasses=" text-break" tooltipText={contract.proxyAddress}>
                <span>{shortenAddress(contract.proxyAddress)}</span>
              </CustomTooltip>
              <CopyToClipboard tip="Copy" content={contract.proxyAddress} direction={'top'} />
            </div>
            <div>
              <span className="fw-bold">Proxy verified at: </span>
              <ReceiptsBody receipts={contract.proxyReceipts} handleRetry={handleRetryVerification} isRetryAvailable={isRetryAvailable} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const ReceiptsBody = ({ receipts, handleRetry, isRetryAvailable }: { 
  receipts: VerificationReceipt[], 
  handleRetry: (receipt: VerificationReceipt) => void,
  isRetryAvailable: boolean
}) => {
  return (
    <ul className="list-group">
      {receipts.map((receipt) => (
        <li
          key={`${receipt.contractId}-${receipt.verifierInfo.name}${receipt.isProxyReceipt ? '-proxy' : ''}-${receipt.receiptId}`}
          className="list-group-item d-flex flex-row align-items-baseline"
        >
          <CustomTooltip
            placement="top"
            tooltipClasses=" text-break"
            tooltipTextClasses="text-capitalize"
            tooltipText={`Status: ${receipt.status}${receipt.message ? `, Message: ${receipt.message}` : ''}`}
          >
            <span className="me-2">
              {['verified', 'partially verified', 'already verified'].includes(receipt.status) ?
                <i className="fas fa-check text-success px-1"></i> :
                receipt.status === 'exactly verified' || receipt.status === 'fully verified' ?
                  <i className="fas fa-check-double text-success px-1"></i> :
                  receipt.status === 'failed' ?
                    <i className="fas fa-xmark text-warning px-1"></i> :
                    ['pending', 'awaiting implementation verification', 'Retrying...'].includes(receipt.status) ?
                      <i className="fas fa-spinner fa-spin px-1"></i> :
                      <i className="fas fa-question px-1"></i>
              }
            </span>
          </CustomTooltip>
          {receipt.status === 'failed' && isRetryAvailable && (
            <CustomTooltip placement="top" tooltipText="Retry Verification">
              <button
                className="btn btn-sm p-0 me-2"
                style={{ border: 'none', background: 'none', color: 'var(--primary)' }}
                onClick={() => handleRetry(receipt)}
              >
                <i className="fas fa-redo" style={{ fontSize: '0.6rem' }}></i>
              </button>
            </CustomTooltip>
          )}
          <div className="d-flex flex-row w-100 justify-content-between">
            <div>
              <CustomTooltip placement="top" tooltipClasses=" text-break" tooltipText={`API: ${receipt.verifierInfo.apiUrl}`}>
                <span className="fw-bold pe-2">{receipt.verifierInfo.name}</span>
              </CustomTooltip>
              {
                !!receipt.receiptLookupUrl && <CustomTooltip placement="top" tooltipClasses=" text-break" tooltipText="View verification details">
                  <a href={receipt.receiptLookupUrl} target="_blank" className="fa fas fa-receipt" rel="noreferrer"></a>
                </CustomTooltip>
              }
            </div>
            <div className="ms-1">
              {!!receipt.lookupUrl && receipt.verifierInfo.name === 'Blockscout' ?
                <CopyToClipboard classList="pe-0 py-0" tip="Copy code URL" content={receipt.lookupUrl} direction="top" /> :
                !!receipt.lookupUrl && <a href={receipt.lookupUrl} target="_blank" className="fa fas fa-arrow-up-right-from-square" rel="noreferrer"></a>
              }
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
