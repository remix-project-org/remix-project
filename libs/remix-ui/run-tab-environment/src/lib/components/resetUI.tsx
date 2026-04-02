import React, { useContext, useEffect } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { EnvAppContext } from '../contexts'
import { resetVmState } from '../actions'
import { Spinner } from 'react-bootstrap'
import { TrackingContext } from '@remix-ide/tracking'

export function ResetUI() {
  const { plugin, widgetState, dispatch, themeQuality } = useContext(EnvAppContext)
  const { trackMatomoEvent } = useContext(TrackingContext)
  const intl = useIntl()

  const handleSubmit = async () => {
    trackMatomoEvent?.({ category: 'udapp', action: 'resetConfirm', name: 'confirmed', isClick: true })
    dispatch({ type: 'REQUEST_FORK', payload: undefined })
    try {
      await resetVmState(plugin, widgetState, dispatch)
    } catch (error) {
      plugin.call('notification', 'toast', `Error resetting state: ${error.message}`)
      dispatch({ type: 'ERROR_FORK', payload: `Error resetting state: ${error.message}` })
    } finally {
      dispatch({ type: 'HIDE_RESET_UI', payload: undefined })
      dispatch({ type: 'COMPLETED_FORK', payload: undefined })
    }
  }

  return (
    <div className='mx-3 p-3 rounded' style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
      <div className="flex justify-between items-center mb-2">
        <p className="mb-0 text-danger" style={{ fontSize: '0.9rem' }}> {intl.formatMessage({ id: 'udapp.resetVmStateTitle' })} </p>
        <button
          className="inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors"
          onClick={() => {
            trackMatomoEvent?.({ category: 'udapp', action: 'resetDialogClose', name: 'close_button', isClick: true })
            dispatch({ type: 'HIDE_RESET_UI', payload: undefined })
          }}
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
        <div style={{ color: 'var(--bs-tertiary)', fontSize: '0.75rem' }} className="mb-2 font-light">
          <p className="mb-1"><FormattedMessage id="udapp.resetEnvironmentStateDescription" /></p>
          <p className="mb-1">
            {intl.formatMessage({ id: 'udapp.resetVmStateDesc1' })}
            {intl.formatMessage({ id: 'udapp.resetVmStateDesc2' })}
          </p>
          <p className="mb-3" style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>{intl.formatMessage({ id: 'udapp.resetVmStateDesc3' })}</p>
        </div>
        <div className="flex justify-between items-center gap-3">
          <button
            className="inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors btn-secondary rounded"
            onClick={() => {
              trackMatomoEvent?.({ category: 'udapp', action: 'resetCancel', name: 'cancelled', isClick: true })
              dispatch({ type: 'HIDE_RESET_UI', payload: undefined })
            }}
            disabled={widgetState.fork.isRequesting}
            style={{ color: themeQuality === 'dark' ? 'white' : 'black', flex: 1 }}
          >
            {intl.formatMessage({ id: 'udapp.cancelReset' })}
          </button>
          <button
            data-id="btnResetState"
            className="inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors btn-danger rounded text-light"
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
