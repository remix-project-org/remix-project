import React, { useContext } from 'react'
import { Dropdown } from 'react-bootstrap'
import { EezAppContext } from '../contexts'
import { resolveProxyAddresses, previewProxyCreation, createProxy, traceTransactionByHash } from '../actions'
import { FormattedMessage } from 'react-intl'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { CustomMenu, CustomToggle, getTimeAgo } from '@remix-ui/helper'

function shorten(address: string) {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function EezPortraitView() {
  const { plugin, widgetState, dispatch, themeQuality } = useContext(EezAppContext)
  const {
    networks, isDiscovering, addressInput, isResolving, resolutionRows, resolutionError, showCreateDialog, createdProxies, creator,
    traceTxHash, isTracing, traceResult, traceError
  } = widgetState

  const handleResolve = () => {
    resolveProxyAddresses(plugin, dispatch, networks, addressInput.trim())
  }

  const handleTrace = () => {
    traceTransactionByHash(plugin, dispatch, networks, traceTxHash.trim())
  }

  const handleOpenCreateDialog = () => {
    dispatch({ type: 'SHOW_CREATE_DIALOG', payload: true })
  }

  const handleCloseCreateDialog = () => {
    dispatch({ type: 'SHOW_CREATE_DIALOG', payload: false })
  }

  const handlePreview = () => {
    previewProxyCreation(plugin, dispatch, networks, creator.originNetworkId, creator.originAddress.trim())
  }

  const handleCreate = () => {
    createProxy(plugin, dispatch, networks, creator.originNetworkId, creator.originAddress.trim())
  }

  const handleLoadResolvedProxy = async (proxyAddress: string) => {
    window.dispatchEvent(new CustomEvent('udapp:switchTab', { detail: { tab: 'contracts' } }))
    await plugin.call('udappDeployedContracts', 'openAddContractDialog', proxyAddress)
  }

  const handleOpenEezSettings = async () => {
    const isActive = await plugin.call('manager', 'isActive', 'settings')
    if (!isActive) await plugin.call('manager', 'activatePlugin', 'settings')
    await plugin.call('tabs', 'focus', 'settings')
    plugin.call('settings', 'showSection', 'eez')
  }

  if (isDiscovering || networks.length === 0) {
    return (
      <div className="d-flex flex-column gap-2 text-theme-contrast" data-id="eezPortraitView">
        <div className="d-flex align-items-center px-3 py-1">
          <h6 className="my-auto" style={{ margin: '0px', fontSize: '14px', fontWeight: '700', color: 'var(--bs-emphasis-color)' }}>
            <FormattedMessage id="udapp.eezCrossChainProxy" defaultMessage="EEZ Cross-Chain Proxy" />
          </h6>
        </div>
        <div className="m-3 mt-0 p-3 rounded" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
          {isDiscovering ? (
            <p className="mb-0 small text-secondary" data-id="eezCheckingNetwork">
              <i className="fas fa-spinner fa-spin me-2"></i>
              Checking the connected network for EEZ support...
            </p>
          ) : (
            <div data-id="eezUnsupportedNetwork">
              <p className="mb-2" style={{ color: themeQuality === 'dark' ? 'white' : 'black', fontSize: '0.9rem' }}>
                EEZ is not available on this network
              </p>
              <p className="small text-secondary mb-0">
                Switch to an EEZ-compatible network to use EEZ features, or configure your EEZ network's RPC in{' '}
                <a href="#" className="text-primary" onClick={(e) => { e.preventDefault(); handleOpenEezSettings() }} data-id="eezOpenSettingsLink">
                  Settings &gt; EEZ
                </a>{' '}
                and switch to that network.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="d-flex flex-column gap-2 text-theme-contrast" data-id="eezPortraitView">
      <div className="d-flex align-items-center justify-content-between px-3 py-1">
        <div className='d-flex align-items-center gap-2 text-nowrap'>
          <h6 className="my-auto" style={{ margin: '0px', fontSize: '14px', fontWeight: '700', color: 'var(--bs-emphasis-color)' }}>
            <FormattedMessage id="udapp.eezCrossChainProxy" defaultMessage="EEZ Cross-Chain Proxy" />
          </h6>
          <span className="text-secondary" data-id="eezBadge">0</span>
        </div>
        <div className="ms-1 me-1 d-flex">
          <button className="btn btn-primary btn-sm small d-flex align-items-center justify-content-between flex-nowrap" style={{ fontSize: '0.7rem' }} onClick={handleOpenCreateDialog} data-id="createProxyButton">
            <i className="fa-solid fa-plus me-1"></i>
            <span className="text-nowrap">Create Proxy</span>
          </button>
        </div>
      </div>
      {showCreateDialog && (
        <div className="m-3 mt-0 p-3 rounded" data-id="eezCreateDialog" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <p className="mb-0" style={{ color: themeQuality === 'dark' ? 'white' : 'black', fontSize: '0.9rem' }}>
              Create cross-chain proxy
            </p>
            <button
              className="btn btn-sm"
              onClick={handleCloseCreateDialog}
              data-id="eezCloseCreateDialog"
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
          <div className="mb-2">
            <label className="mb-0 d-block" style={{ color: 'var(--bs-tertiary)' }}>
              Origin network
            </label>
            <Dropdown className="w-100">
              <Dropdown.Toggle
                as={CustomToggle}
                className="w-100 d-inline-block border form-control"
                style={{ backgroundColor: 'var(--bs-body-bg)', color: themeQuality === 'dark' ? 'white' : 'black', fontSize: '0.75rem', padding: '0.75rem' }}
                data-id="eezCreatorOriginNetworkToggle"
                icon="fas fa-caret-down"
                useDefaultIcon={false}
              >
                {networks.find((n) => n.id === creator.originNetworkId)?.label || 'Select origin network...'}
              </Dropdown.Toggle>
              <Dropdown.Menu
                as={CustomMenu}
                className="w-100 custom-dropdown-items overflow-hidden"
                style={{ backgroundColor: 'var(--custom-onsurface-layer-1)', '--theme-text-color': themeQuality === 'dark' ? 'white' : 'black', padding: '4px' } as React.CSSProperties}
                data-id="eezCreatorOriginNetworkMenu"
              >
                {networks.map((n) => (
                  <Dropdown.Item
                    key={n.id}
                    className="d-flex align-items-center contract-dropdown-item-hover px-2"
                    onClick={() => dispatch({ type: 'SET_CREATOR_ORIGIN_NETWORK', payload: n.id })}
                    style={{ color: themeQuality === 'dark' ? 'white' : 'black', fontSize: '0.75rem' }}
                  >
                    {n.label}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          </div>
          <div className="d-flex align-items-center mb-2">
            <label className="mb-0 me-2" style={{ color: 'var(--bs-tertiary)' }}>
              Origin address
            </label>
          </div>
          <div className="position-relative flex-fill mb-2">
            <input
              type="text"
              className="form-control"
              data-id="eezCreatorOriginAddress"
              placeholder="0x..."
              value={creator.originAddress}
              onChange={(e) => dispatch({ type: 'SET_CREATOR_ORIGIN_ADDRESS', payload: e.target.value })}
              style={{ backgroundColor: 'var(--bs-body-bg)', color: themeQuality === 'dark' ? 'white' : 'black', flex: 1, padding: '0.75rem', paddingRight: '5.5rem', fontSize: '0.75rem' }}
            />
            <button
              className="btn btn-sm btn-secondary"
              data-id="eezPreviewButton"
              disabled={creator.isPreviewing || !creator.originNetworkId || !creator.originAddress}
              onClick={handlePreview}
              style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', zIndex: 2, fontSize: '0.65rem', fontWeight: 'bold' }}
            >
              {creator.isPreviewing ? 'Previewing...' : 'Preview'}
            </button>
          </div>
          {creator.previewError && <div className="text-danger small mb-2">{creator.previewError}</div>}
          {creator.previewAddress && (
            <div className="d-flex align-items-center justify-content-between p-2 rounded mb-2" style={{ backgroundColor: 'var(--custom-onsurface-layer-3)' }}>
              <div className="d-flex flex-column" style={{ minWidth: 0 }}>
                <span style={{ fontSize: '10px', color: 'var(--bs-tertiary)' }}>Predicted proxy address</span>
                <div className="d-flex align-items-center gap-1">
                  <span style={{ fontSize: '10px', fontFamily: 'Monaco, monospace', color: 'var(--text-tertiary, #a2a3bd)' }}>
                    {shorten(creator.previewAddress)}
                  </span>
                  <CopyToClipboard tip="Copy proxy address" icon="fa-copy" direction="top" getContent={() => creator.previewAddress}>
                    <i className="fa-solid fa-copy" style={{ fontSize: '10px', cursor: 'pointer', color: 'var(--text-tertiary, #a2a3bd)' }}></i>
                  </CopyToClipboard>
                </div>
              </div>
              <div className="d-flex flex-column align-items-end gap-1 flex-shrink-0">
                <span
                  className="badge"
                  style={{
                    backgroundColor: creator.previewIsDeployed ? '#2ecc7114' : 'var(--custom-onsurface-layer-4)',
                    color: creator.previewIsDeployed ? '#2ecc71' : 'var(--text-tertiary, #a2a3bd)',
                    fontSize: '10px',
                    fontWeight: 700
                  }}
                >
                  {creator.previewIsDeployed ? 'Deployed' : 'Not deployed'}
                </span>
                {creator.previewIsDeployed && (
                  <button
                    className="btn btn-sm"
                    data-id="eezLoadPreviewedProxy"
                    style={{ backgroundColor: '#64C4FF14', color: '#64c4ff', border: 'none', fontSize: '10px', fontWeight: 700, padding: '3px 10px' }}
                    onClick={() => handleLoadResolvedProxy(creator.previewAddress)}
                  >
                    Load
                  </button>
                )}
              </div>
            </div>
          )}
          {creator.previewAddress && !creator.previewIsDeployed && (
            <button className="btn btn-sm btn-primary w-100" data-id="eezCreateButton" disabled={creator.isCreating} onClick={handleCreate}>
              {creator.isCreating ? 'Creating...' : 'Create proxy'}
            </button>
          )}
        </div>
      )}
      <div className="m-3 mt-0 p-3 rounded" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
        <p className="mb-0" style={{ color: themeQuality === 'dark' ? 'white' : 'black', fontSize: '0.9rem', fontWeight: 700 }}>
          Find Cross-Chain Proxies
        </p>
        <p style={{ color: 'var(--bs-tertiary)', fontSize: '0.7rem' }} className="mb-2 fw-light">
          Enter a local address to see its proxy on every network in the zone.
        </p>
        <div className="d-flex align-items-center mb-2">
          <label className="mb-0 me-2" style={{ color: 'var(--bs-tertiary)' }}>
            Address
          </label>
        </div>
        <div className="position-relative flex-fill mb-2">
          <input
            type="text"
            className="form-control"
            data-id="eezResolveAddressInput"
            placeholder="0x..."
            value={addressInput}
            onChange={(e) => dispatch({ type: 'SET_ADDRESS_INPUT', payload: e.target.value })}
            style={{ backgroundColor: 'var(--bs-body-bg)', color: themeQuality === 'dark' ? 'white' : 'black', flex: 1, padding: '0.75rem', paddingRight: '5.5rem', fontSize: '0.75rem' }}
          />
          <button
            className="btn btn-sm btn-primary"
            data-id="eezResolveButton"
            disabled={isResolving || !addressInput}
            onClick={handleResolve}
            style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', zIndex: 2, fontSize: '0.65rem', fontWeight: 'bold' }}
          >
            {isResolving ? 'Resolving...' : 'Resolve'}
          </button>
        </div>
        {resolutionError && <div className="text-danger small mb-2">{resolutionError}</div>}
        {resolutionRows.filter((row) => !row.isOrigin).length > 0 && (
          <div className="d-flex flex-column gap-1 mt-2">
            {resolutionRows.filter((row) => !row.isOrigin).map((row) => (
              <div
                key={row.network.id}
                className="d-flex align-items-center justify-content-between p-2 rounded"
                style={{ backgroundColor: 'var(--custom-onsurface-layer-3)' }}
              >
                <div className="d-flex flex-column" style={{ minWidth: 0 }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: themeQuality === 'dark' ? 'white' : 'black' }}>
                    {row.network.label}
                  </span>
                  {row.error ? (
                    <span className="text-danger" style={{ fontSize: '10px' }}>{row.error}</span>
                  ) : (
                    <div className="d-flex align-items-center gap-1">
                      <span style={{ fontSize: '10px', fontFamily: 'Monaco, monospace', color: 'var(--text-tertiary, #a2a3bd)' }}>
                        {shorten(row.proxyAddress || '')}
                      </span>
                      {row.proxyAddress && (
                        <CopyToClipboard tip="Copy proxy address" icon="fa-copy" direction="top" getContent={() => row.proxyAddress}>
                          <i className="fa-solid fa-copy" style={{ fontSize: '10px', cursor: 'pointer', color: 'var(--text-tertiary, #a2a3bd)' }}></i>
                        </CopyToClipboard>
                      )}
                    </div>
                  )}
                </div>
                {row.isDeployed !== null && (
                  <span
                    className="badge flex-shrink-0"
                    style={{
                      backgroundColor: row.isDeployed ? '#2ecc7114' : 'var(--custom-onsurface-layer-4)',
                      color: row.isDeployed ? '#2ecc71' : 'var(--text-tertiary, #a2a3bd)',
                      fontSize: '10px',
                      fontWeight: 700
                    }}
                  >
                    {row.isDeployed ? 'Deployed' : 'Not deployed'}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="m-3 mt-0 p-3 rounded" data-id="eezTraceSection" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
        <p className="mb-0" style={{ color: themeQuality === 'dark' ? 'white' : 'black', fontSize: '0.9rem', fontWeight: 700 }}>
          Trace Cross-Chain Transaction
        </p>
        <p style={{ color: 'var(--bs-tertiary)', fontSize: '0.7rem' }} className="mb-2 fw-light">
          Enter the hash of a mined transaction on the currently connected network to see the cross-chain proxies its execution touched.
        </p>
        <div className="d-flex align-items-center mb-2">
          <label className="mb-0 me-2" style={{ color: 'var(--bs-tertiary)' }}>
            Transaction hash
          </label>
        </div>
        <div className="position-relative flex-fill mb-2">
          <input
            type="text"
            className="form-control"
            data-id="eezTraceTxHashInput"
            placeholder="0x..."
            value={traceTxHash}
            onChange={(e) => dispatch({ type: 'SET_TRACE_TX_HASH', payload: e.target.value })}
            style={{ backgroundColor: 'var(--bs-body-bg)', color: themeQuality === 'dark' ? 'white' : 'black', flex: 1, padding: '0.75rem', paddingRight: '5.5rem', fontSize: '0.75rem' }}
          />
          <button
            className="btn btn-sm btn-primary"
            data-id="eezTraceButton"
            disabled={isTracing || !traceTxHash}
            onClick={handleTrace}
            style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', zIndex: 2, fontSize: '0.65rem', fontWeight: 'bold' }}
          >
            {isTracing ? 'Tracing...' : 'Trace'}
          </button>
        </div>
        {traceError && <div className="text-danger small mb-2">{traceError}</div>}
        {traceResult && (
          <div className="mt-2">
            <div
              className="small mb-2 p-2 rounded"
              style={{ backgroundColor: traceResult.success ? 'rgba(var(--bs-success-rgb), 0.08)' : 'rgba(var(--bs-danger-rgb), 0.08)', color: themeQuality === 'dark' ? 'white' : 'black' }}
            >
              {traceResult.success
                ? '✓ This transaction succeeded.'
                : `✗ This transaction reverted${traceResult.decodedError ? `: ${traceResult.decodedError}` : traceResult.error ? `: ${traceResult.error}` : '.'}`}
            </div>
            {traceResult.proxies.length > 0 ? (
              <div className="small mb-2 p-2 rounded" style={{ backgroundColor: '#a56eff14', color: themeQuality === 'dark' ? 'white' : 'black' }}>
                <div style={{ fontWeight: 700 }}>
                  This transaction is cross-chain — {traceResult.proxyCount} {traceResult.proxyCount === 1 ? 'proxy' : 'proxies'} touched:
                </div>
                {traceResult.proxies.map((p) => (
                  <div key={p.address} className="mt-1">
                    {p.hops.map((hop, hopIndex) => (
                      <div key={hopIndex} className="text-break" style={{ fontSize: '11px', fontFamily: 'Monaco, monospace' }}>
                        {shorten(hopIndex === 0 ? p.address : p.hops[hopIndex - 1].originalAddress)} → acts for {shorten(hop.originalAddress)} on {hop.originNetworkLabel || `network ${hop.originalRollupId}`}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="small mb-2 text-secondary">No cross-chain proxies were touched by this transaction.</div>
            )}
          </div>
        )}
      </div>

      {createdProxies.length > 0 && (
        <div className="m-3 mt-0 p-3 rounded" data-id="eezCreatedProxiesSection" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
          <p className="mb-0" style={{ color: themeQuality === 'dark' ? 'white' : 'black', fontSize: '0.9rem', fontWeight: 700 }}>
            Created proxies
          </p>
          <p style={{ color: 'var(--bs-tertiary)', fontSize: '0.7rem' }} className="mb-2 fw-light">
            Proxies you've created from this panel, newest first.
          </p>
          <div className="d-flex flex-column gap-1 mt-2">
            {createdProxies.map((p, i) => (
              <div
                key={`${p.proxyAddress}-${p.timestamp}-${i}`}
                className="d-flex align-items-center justify-content-between p-2 rounded"
                style={{ backgroundColor: 'var(--custom-onsurface-layer-3)' }}
              >
                <div className="d-flex flex-column" style={{ minWidth: 0 }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: themeQuality === 'dark' ? 'white' : 'black' }}>
                    {p.originNetworkLabel} → {p.destinationNetworkLabel}
                  </span>
                  <div className="d-flex align-items-center gap-1">
                    <span style={{ fontSize: '10px', fontFamily: 'Monaco, monospace', color: 'var(--text-tertiary, #a2a3bd)' }}>
                      {shorten(p.proxyAddress)}
                    </span>
                    <CopyToClipboard tip="Copy proxy address" icon="fa-copy" direction="top" getContent={() => p.proxyAddress}>
                      <i className="fa-solid fa-copy" style={{ fontSize: '10px', cursor: 'pointer', color: 'var(--text-tertiary, #a2a3bd)' }}></i>
                    </CopyToClipboard>
                  </div>
                  <span className="text-secondary" style={{ fontSize: '10px' }}>
                    {getTimeAgo(p.timestamp, { truncateTimeAgo: true })} ago · origin {shorten(p.originAddress)}
                  </span>
                </div>
                <div className="d-flex flex-column align-items-end gap-1 flex-shrink-0">
                  <span className="badge" style={{ backgroundColor: '#2ecc7114', color: '#2ecc71', fontSize: '10px', fontWeight: 700 }}>
                    Deployed
                  </span>
                  <button
                    className="btn btn-sm"
                    data-id={`eezLoadCreatedProxy-${p.proxyAddress}`}
                    style={{ backgroundColor: '#64C4FF14', color: '#64c4ff', border: 'none', fontSize: '10px', fontWeight: 700, padding: '3px 10px' }}
                    onClick={() => handleLoadResolvedProxy(p.proxyAddress)}
                  >
                    Load
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default EezPortraitView
