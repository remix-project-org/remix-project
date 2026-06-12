import React from 'react'
import { CustomTooltip } from '@remix-ui/helper'

interface DeployedContract {
  address: string
  name: string
}

interface ContractEnvironmentProps {
  compiledContracts: string[]
  deployedContracts: DeployedContract[]
  networkName?: string
  walletAddress?: string
  onContractSelect?: (contractName: string) => void
  onDeployedContractClick?: (contract: DeployedContract) => void
  providers?: { name: string, displayName: string, category?: string }[]
  selectedProvider?: string
  accounts?: { account: string, alias?: string }[]
  onSelectNetwork?: (name: string) => void
  onSelectAccount?: (account: string) => void
  theme?: string
}

const truncateAddress = (address: string, length = 8) => {
  if (!address || address.length < length) return address
  return `${address.slice(0, length)}…${address.slice(-4)}`
}

export const ContractEnvironment: React.FC<ContractEnvironmentProps> = ({
  compiledContracts = [],
  deployedContracts = [],
  networkName = 'Remix VM',
  walletAddress = '',
  onContractSelect,
  onDeployedContractClick,
  providers = [],
  selectedProvider,
  accounts = [],
  onSelectNetwork,
  onSelectAccount,
  theme = 'dark'
}) => {
  const isDark = theme.toLowerCase() === 'dark'
  const textColor = isDark ? '#e8e8e8' : '#333'
  const selectStyle: React.CSSProperties = {
    backgroundColor: isDark ? '#333446' : '#e4e8f1',
    color: textColor,
    border: `1px solid ${isDark ? '#444' : '#ccc'}`,
    borderRadius: '6px',
    padding: '6px 8px',
    fontSize: '13px',
    width: '100%'
  }
  const labelStyle: React.CSSProperties = { fontSize: '11px', opacity: 0.7, marginBottom: '3px', fontWeight: 600 }

  return (
    <div
      className="contract-environment border-top d-flex flex-column"
      style={{
        backgroundColor: 'transparent',
        color: textColor,
        fontSize: '12px',
        padding: '12px',
        marginTop: 'auto',
        borderTopWidth: '1px',
        borderTopStyle: 'solid',
        borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
      }}
    >
      {compiledContracts.length > 0 && (
        <div className="mb-3">
          <div className="fw-bold mb-2" style={{ fontSize: '11px', opacity: 0.8 }}>
            COMPILED
          </div>
          <div className="d-flex flex-wrap gap-2">
            {compiledContracts.map((contractName) => (
              <CustomTooltip key={contractName} tooltipText={contractName}>
                <div
                  className="px-2 py-1 rounded"
                  style={{
                    backgroundColor: isDark ? '#3a3a52' : '#e0e5f0',
                    color: textColor,
                    cursor: 'pointer',
                    fontSize: '11px',
                    transition: 'background-color 0.2s'
                  }}
                  onClick={() => onContractSelect?.(contractName)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = isDark ? '#4a4a62' : '#d0d5e0'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isDark ? '#3a3a52' : '#e0e5f0'
                  }}
                >
                  {contractName}
                </div>
              </CustomTooltip>
            ))}
          </div>
        </div>
      )}

      {deployedContracts.length > 0 && (
        <div className="mb-3">
          <div className="fw-bold mb-2" style={{ fontSize: '11px', opacity: 0.8 }}>
            DEPLOYED
          </div>
          <div className="d-flex flex-column gap-2">
            {deployedContracts.map((contract) => (
              <CustomTooltip key={contract.address} tooltipText={contract.address}>
                <div
                  className="d-flex justify-content-between align-items-center px-2 py-2 rounded"
                  style={{
                    backgroundColor: isDark ? '#3a3a52' : '#e0e5f0',
                    cursor: 'pointer',
                    fontSize: '11px',
                    transition: 'background-color 0.2s'
                  }}
                  onClick={() => onDeployedContractClick?.(contract)}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = isDark ? '#4a4a62' : '#d0d5e0'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isDark ? '#3a3a52' : '#e0e5f0'
                  }}
                >
                  <div>
                    <div className="fw-bold">{contract.name}</div>
                    <div style={{ opacity: 0.7 }}>{truncateAddress(contract.address)}</div>
                  </div>
                  <div style={{ opacity: 0.6 }}>→</div>
                </div>
              </CustomTooltip>
            ))}
          </div>
        </div>
      )}

      <div
        className="pt-3"
        style={{
          borderTopWidth: '1px',
          borderTopStyle: 'solid',
          borderTopColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
        }}
      >
        <div className="mb-3">
          <div style={labelStyle}>NETWORK</div>
          <div className="d-flex align-items-center gap-2">
            {providers.length > 0 ? (
              <select
                data-id="ai-network-select"
                style={selectStyle}
                value={selectedProvider || ''}
                onChange={(e) => onSelectNetwork?.(e.target.value)}
              >
                {providers.map((p) => (
                  <option key={p.name} value={p.name}>{p.displayName}</option>
                ))}
              </select>
            ) : (
              <div style={{ fontSize: '14px', fontWeight: 600, flex: 1 }}>{networkName}</div>
            )}
            <CustomTooltip tooltipText="Connect MetaMask">
              <button
                type="button"
                data-id="ai-connect-metamask"
                onClick={() => onSelectNetwork?.('injected-MetaMask')}
                className="d-flex align-items-center justify-content-center"
                style={{
                  flexShrink: 0,
                  width: '34px',
                  height: '34px',
                  borderRadius: '6px',
                  border: `1px solid ${(selectedProvider || '').startsWith('injected') ? '#2de6f3' : (isDark ? '#444' : '#ccc')}`,
                  backgroundColor: isDark ? '#333446' : '#e4e8f1',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                <img src="assets/img/metamask.png" alt="MetaMask" style={{ width: '20px', height: '20px' }} />
              </button>
            </CustomTooltip>
          </div>
        </div>

        <div>
          <div style={labelStyle}>ACCOUNT</div>
          {accounts.length > 0 ? (
            <select
              data-id="ai-account-select"
              style={selectStyle}
              value={walletAddress || ''}
              onChange={(e) => onSelectAccount?.(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.account} value={a.account}>
                  {a.alias ? `${a.alias} — ` : ''}{truncateAddress(a.account, 10)}
                </option>
              ))}
            </select>
          ) : walletAddress ? (
            <div style={{ fontSize: '14px', fontWeight: 600 }}>{truncateAddress(walletAddress, 12)}</div>
          ) : (
            <div style={{ fontSize: '13px', opacity: 0.6 }}>No account</div>
          )}
        </div>
      </div>
    </div>
  )
}
