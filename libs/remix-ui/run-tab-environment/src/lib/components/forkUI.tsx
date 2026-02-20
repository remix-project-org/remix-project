import React, { useState, useContext, useMemo } from 'react'
import { useIntl } from 'react-intl'
import { EnvAppContext } from '../contexts'
import { forkState } from '../actions'
import { Spinner } from 'react-bootstrap'

export function ForkUI() {
  const { plugin, widgetState, dispatch, themeQuality } = useContext(EnvAppContext)
  const intl = useIntl()

  const currentProvider = useMemo(() => {
    return widgetState.providers.providerList.find(
      provider => provider.name === widgetState.providers.selectedProvider
    )
  }, [widgetState.providers.selectedProvider, widgetState.providers.providerList])

  // Generate default fork name
  const defaultForkName = useMemo(() => {
    if (!currentProvider) return `vm_${Date.now()}_`

    let context = currentProvider.name
    context = context.replace('vm-fs-', '')
    return `${context}_${Date.now()}_`
  }, [currentProvider])

  const [forkName, setForkName] = useState(defaultForkName)

  const handleSubmit = async () => {
    if (!forkName.trim()) {
      plugin.call('notification', 'toast', 'Fork name cannot be empty.')
      return
    }

    dispatch({ type: 'REQUEST_FORK', payload: undefined })
    try {
      await forkState(plugin, dispatch, currentProvider, forkName.trim())
      dispatch({ type: 'HIDE_FORK_UI', payload: undefined })
    } catch (error) {
      plugin.call('notification', 'toast', `Error forking state: ${error.message}`)
      dispatch({ type: 'ERROR_FORK', payload: `Error forking state: ${error.message}` })
    } finally {
      dispatch({ type: 'COMPLETED_FORK', payload: undefined })
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit()
    }
  }

  return (
    <div className='m-3 mt-0 p-3 pt-2 pb-0 rounded' style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <p className="mb-0" style={{ color: themeQuality === 'dark' ? 'white' : 'black', fontSize: '0.9rem' }}>
          {intl.formatMessage({ id: 'udapp.forkStateTitle' })}
        </p>
        <button
          className="btn btn-sm"
          onClick={() => dispatch({ type: 'HIDE_FORK_UI', payload: undefined })}
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
      <p style={{ color: 'var(--bs-tertiary)' }} className="mb-2 fw-light small">
          Forking state will create a new environment with same state as selected environment.
      </p>
      <div className="mb-3">
        <div className="d-flex align-items-center mb-2">
          <label className="mb-0 me-2" style={{ color: 'var(--bs-tertiary)' }}>
              Fork name
          </label>
        </div>
        <div className="position-relative flex-fill">
          <input
            type="text"
            className="form-control"
            value={forkName}
            onChange={(e) => setForkName(e.target.value)}
            disabled={widgetState.fork.isRequesting}
            style={{ backgroundColor: 'var(--bs-body-bg)', color: themeQuality === 'dark' ? 'white' : 'black', flex: 1, padding: '0.75rem', paddingRight: '3.5rem', fontSize: '0.75rem' }}
            onKeyDown={handleKeyPress}
          />
          <button
            className="btn btn-sm btn-primary"
            onClick={handleSubmit}
            disabled={widgetState.fork.isRequesting || !forkName.trim()}
            style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', zIndex: 2, fontSize: '0.65rem', fontWeight: 'bold' }}
          >
            {widgetState.fork.isRequesting ? <Spinner animation="border" size="sm" /> : intl.formatMessage({ id: 'udapp.fork' })}
          </button>
        </div>
      </div>
    </div>
  )
}
