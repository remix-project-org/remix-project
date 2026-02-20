import React, { useContext } from 'react'
import { useIntl } from 'react-intl'
import { EnvAppContext } from '../contexts'
import { resetVmState } from '../actions'
import { Spinner } from 'react-bootstrap'

export function ResetUI() {
  const { plugin, widgetState, dispatch, themeQuality } = useContext(EnvAppContext)
  const intl = useIntl()

  const handleSubmit = async () => {
    dispatch({ type: 'REQUEST_FORK', payload: undefined })
    try {
      await resetVmState(plugin, widgetState, dispatch)
      dispatch({ type: 'HIDE_RESET_UI', payload: undefined })
    } catch (error) {
      plugin.call('notification', 'toast', `Error resetting state: ${error.message}`)
      dispatch({ type: 'ERROR_FORK', payload: `Error resetting state: ${error.message}` })
    } finally {
      dispatch({ type: 'COMPLETED_FORK', payload: undefined })
    }
  }

  return (
    <div className='mx-3 p-3 rounded' style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <p className="mb-0 text-danger" style={{ fontSize: '0.9rem' }}> {intl.formatMessage({ id: 'udapp.resetVmStateTitle' })} </p>
        <button
          className="btn btn-sm"
          onClick={() => dispatch({ type: 'HIDE_RESET_UI', payload: undefined })}
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

      <div>
        <div style={{ color: 'var(--bs-tertiary)', fontSize: '0.75rem' }} className="mb-2 fw-light">
          <p className="mb-1">You are about to reset your environment state.</p>
          <p className="mb-1">
            {intl.formatMessage({ id: 'udapp.resetVmStateDesc1' })}
            {intl.formatMessage({ id: 'udapp.resetVmStateDesc2' })}
          </p>
          <p className="mb-3" style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>{intl.formatMessage({ id: 'udapp.resetVmStateDesc3' })}</p>
        </div>
        <div className="d-flex justify-content-between align-items-center gap-3">
          <button
            className="btn btn-sm btn-secondary rounded"
            onClick={() => dispatch({ type: 'HIDE_RESET_UI', payload: undefined })}
            disabled={widgetState.fork.isRequesting}
            style={{ color: themeQuality === 'dark' ? 'white' : 'black', flex: 1 }}
          >
            {intl.formatMessage({ id: 'udapp.cancelReset' })}
          </button>
          <button
            className="btn btn-sm btn-danger rounded text-light"
            onClick={handleSubmit}
            disabled={widgetState.fork.isRequesting}
            style={{
              border: 'none',
              flex: 1
            }}
          >
            {widgetState.fork.isRequesting ? <Spinner animation="border" size="sm" /> : intl.formatMessage({ id: 'udapp.yesReset' })}
          </button>
        </div>
      </div>
    </div>
  )
}
