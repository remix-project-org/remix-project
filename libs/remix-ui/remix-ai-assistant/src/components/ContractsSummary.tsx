import React from 'react'
import { CustomTooltip } from '@remix-ui/helper'

interface DeployedContract {
  address: string
  name: string
}

interface Dapp {
  workspaceName: string
  name: string
  contractName?: string
  networkName?: string
  status?: string
}

interface ContractsSummaryProps {
  compiledContracts?: string[]
  deployedContracts?: DeployedContract[]
  dapps?: Dapp[]
  activeDappWorkspace?: string | null
  onContractSelect?: (contractName: string) => void
  onDeployedContractClick?: (contract: DeployedContract) => void
  onOpenDapp?: (workspaceName: string) => void
  theme?: string
}

const truncateAddress = (address: string, length = 8) => {
  if (!address || address.length < length) return address
  return `${address.slice(0, length)}…${address.slice(-4)}`
}

/**
 * Compact strip shown at the top of the main chat column listing the compiled
 * and deployed contracts. Rendered only when at least one of either exists.
 */
export const ContractsSummary: React.FC<ContractsSummaryProps> = ({
  compiledContracts = [],
  deployedContracts = [],
  dapps = [],
  activeDappWorkspace,
  onContractSelect,
  onDeployedContractClick,
  onOpenDapp,
  theme = 'dark'
}) => {
  if (compiledContracts.length === 0 && deployedContracts.length === 0 && dapps.length === 0) return null

  const isDark = theme.toLowerCase() === 'dark'
  const textColor = isDark ? '#e8e8e8' : '#333'

  return (
    <div
      className="contracts-summary d-flex flex-column gap-2 px-3 py-2 border-bottom"
      data-id="ai-contracts-summary"
      style={{
        backgroundColor: 'transparent',
        color: textColor,
        fontSize: '12px',
        borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
      }}
    >
      {compiledContracts.length > 0 && (
        <div className="d-flex align-items-center flex-wrap gap-2">
          <span className="fw-bold" style={{ fontSize: '11px', opacity: 0.7 }}>COMPILED</span>
          {compiledContracts.map((contractName) => (
            <CustomTooltip key={contractName} tooltipText={contractName}>
              <div
                className="px-2 py-1 rounded"
                data-id={`ai-compiled-contract-${contractName}`}
                style={{
                  backgroundColor: isDark ? '#3a3a52' : '#e0e5f0',
                  color: textColor,
                  cursor: onContractSelect ? 'pointer' : 'default',
                  fontSize: '11px',
                  transition: 'background-color 0.2s'
                }}
                onClick={() => onContractSelect?.(contractName)}
              >
                {contractName}
              </div>
            </CustomTooltip>
          ))}
        </div>
      )}

      {deployedContracts.length > 0 && (
        <div className="d-flex align-items-center flex-wrap gap-2">
          <span className="fw-bold" style={{ fontSize: '11px', opacity: 0.7 }}>DEPLOYED</span>
          {deployedContracts.map((contract) => (
            <CustomTooltip key={contract.address} tooltipText={contract.address}>
              <div
                className="d-flex align-items-center gap-2 px-2 py-1 rounded"
                data-id={`ai-deployed-contract-${contract.address}`}
                style={{
                  backgroundColor: isDark ? '#3a3a52' : '#e0e5f0',
                  cursor: 'pointer',
                  fontSize: '11px',
                  transition: 'background-color 0.2s'
                }}
                onClick={() => onDeployedContractClick?.(contract)}
              >
                <span className="fw-bold">{contract.name}</span>
                <span style={{ opacity: 0.7 }}>{truncateAddress(contract.address)}</span>
                <span style={{ opacity: 0.6 }}>→</span>
              </div>
            </CustomTooltip>
          ))}
        </div>
      )}

      {dapps.length > 0 && (
        <div className="d-flex align-items-center flex-wrap gap-2">
          <span className="fw-bold" style={{ fontSize: '11px', opacity: 0.7 }}>DAPPS</span>
          {dapps.map((dapp) => {
            const isActive = dapp.workspaceName === activeDappWorkspace
            return (
              <CustomTooltip key={dapp.workspaceName} tooltipText={dapp.networkName ? `${dapp.name} · ${dapp.networkName}` : dapp.name}>
                <div
                  className="d-flex align-items-center gap-2 px-2 py-1 rounded"
                  data-id={`ai-dapp-${dapp.workspaceName}`}
                  style={{
                    backgroundColor: isActive ? (isDark ? '#4a4a62' : '#cdd5e8') : (isDark ? '#3a3a52' : '#e0e5f0'),
                    border: isActive ? '1px solid #2de6f3' : '1px solid transparent',
                    cursor: 'pointer',
                    fontSize: '11px',
                    transition: 'background-color 0.2s'
                  }}
                  onClick={() => onOpenDapp?.(dapp.workspaceName)}
                >
                  <i className="fas fa-rocket" style={{ opacity: 0.7 }}></i>
                  <span className="fw-bold">{dapp.name}</span>
                  <span style={{ opacity: 0.6 }}>{isActive ? '●' : '→'}</span>
                </div>
              </CustomTooltip>
            )
          })}
        </div>
      )}
    </div>
  )
}
