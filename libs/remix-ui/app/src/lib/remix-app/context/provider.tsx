import React, { useReducer } from 'react'
import { useIntl, IntlShape } from 'react-intl'
import { modalActionTypes } from '../actions/modals'
import { AlertModal, AppModal } from '../interface'
import { modalReducer } from '../reducer/modals'
import { ModalInitialState } from '../state/modals'
import { ModalTypes } from '../types'
import { AppContext, dispatchModalContext, modalContext, platformContext, onLineContext } from './context'
declare global {
  interface Window {
    _intl: IntlShape
  }
}

export const ModalProvider = ({ children = [], reducer = modalReducer, initialState = ModalInitialState } = {}) => {
  const [{ modals, toasters, focusModal, focusToaster, focusTemplateExplorer }, dispatch] = useReducer(reducer, initialState)

  const onNextFn = async () => {
    dispatch({
      type: modalActionTypes.processQueue
    })
  }

  const modal = (modalData: AppModal) => {
    const { id, title, message, validationFn, okLabel, okFn, cancelLabel, cancelFn, modalType, modalParentClass, defaultValue, hideFn, data, showCancelIcon, preventBlur, placeholderText } = modalData
    return new Promise((resolve, reject) => {
      dispatch({
        type: modalActionTypes.setModal,
        payload: {
          id,
          title,
          message,
          okLabel,
          validationFn,
          okFn,
          cancelLabel,
          cancelFn,
          modalType: modalType || ModalTypes.default,
          modalParentClass,
          defaultValue: defaultValue,
          hideFn,
          resolve,
          next: onNextFn,
          data,
          showCancelIcon,
          preventBlur,
          placeholderText
        }
      })
    })
  }

  const alert = (modalData: AlertModal) => {
    return modal({
      id: modalData.id,
      title: modalData.title || window._intl.formatMessage({ id: 'remixApp.alert' }),
      message: modalData.message || modalData.title,
      okLabel: window._intl.formatMessage({ id: 'remixApp.ok' }),
      okFn: (value?: any) => {},
      cancelLabel: '',
      cancelFn: () => {}
    })
  }

  const handleHideModal = () => {
    dispatch({
      type: modalActionTypes.handleHideModal,
      payload: null
    })
  }

  const toast = (message: string | JSX.Element) => {
    dispatch({
      type: modalActionTypes.setToast,
      payload: { message, timestamp: Date.now() }
    })
  }

  const handleToaster = () => {
    dispatch({
      type: modalActionTypes.handleToaster,
      payload: null
    })
  }

  return (
    <dispatchModalContext.Provider value={{ modal, toast, alert, handleHideModal, handleToaster }}>
      <modalContext.Provider value={{ modals, toasters, focusModal, focusToaster, focusTemplateExplorer }}>
        {children}
      </modalContext.Provider>
    </dispatchModalContext.Provider>
  )
}

export const AppProvider = ({ children = [], value = {} } = null) => {
  window._intl = useIntl()
  return (
    <AppContext.Provider value={value}>
      <ModalProvider>
        {children}
      </ModalProvider>
    </AppContext.Provider>
  )
}

export const useDialogs = () => {
  return React.useContext(modalContext)
}

export const useDialogDispatchers = () => {
  return React.useContext(dispatchModalContext)
}

export const defaultFocusTemplateExplorer = () => {
  return (
    <>
      <p className="fs-3 text-center">Template Explorer</p>
    </>
  )
}
