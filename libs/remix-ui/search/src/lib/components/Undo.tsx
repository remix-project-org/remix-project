import { useDialogDispatchers } from '@remix-ui/app'
import React from 'react'
import { useContext } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { SearchContext } from '../context/context'
import * as path from 'path'

export const Undo = () => {
  const { state, undoReplace } = useContext(SearchContext)
  const { alert } = useDialogDispatchers()
  const intl = useIntl()

  const undo = async () => {
    try {
      await undoReplace(state.undoBuffer[`${state.workspace}/${state.currentFile}`])
    } catch (e) {
      alert({
        id: 'undo_error',
        title: intl.formatMessage({ id: 'search.cannotUndoChange' }),
        message: e.message
      })
    }
  }

  return (
    <>
      {state.undoBuffer && state.undoBuffer[`${state.workspace}/${state.currentFile}`] && state.undoBuffer[`${state.workspace}/${state.currentFile}`].visible ? (
        <button
          data-id={`undo-replace-${state.currentFile}`}
          disabled={!state.undoBuffer[`${state.workspace}/${state.currentFile}`].enabled}
          onClick={async () => await undo()}
          className="undo-button btn btn-secondary btn-block my-3"
        >
          <div className="fas fa-undo me-2"></div>
          <FormattedMessage id="search.undoChanges" values={{ path: path.basename(state.undoBuffer[`${state.workspace}/${state.currentFile}`].path) }} />
        </button>
      ) : null}
    </>
  )
}
