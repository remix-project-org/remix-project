import React, {useRef, useState, useEffect} from 'react' // eslint-disable-line
import {ModalDialogProps} from './types' // eslint-disable-line

import './remix-ui-modal-dialog.css'
import { AppModalCancelTypes } from '@remix-ui/app'

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    testmode: boolean
  }
}

export const ModalDialog = (props: ModalDialogProps) => {

  const [state, setState] = useState({
    toggleBtn: true
  })
  const calledHideFunctionOnce = useRef<boolean>()
  const modal = useRef(null)
  const handleHide = () => {
    if (!calledHideFunctionOnce.current) {
      props.handleHide()
    }
    calledHideFunctionOnce.current = true
  }

  useEffect(() => {
    if (!props.id) return
    calledHideFunctionOnce.current = props.hide
    if (!props.hide) {
      modal.current.focus()
      modal.current.removeEventListener('blur', handleBlur)
      if (modal.current && !props.preventBlur) {
        modal.current.addEventListener('blur', handleBlur)
      }
    }
    return () => {
      modal.current && modal.current.removeEventListener('blur', handleBlur)
    }
  }, [props.hide])

  function handleBlur(e) {
    if (e.currentTarget && !e.currentTarget.contains(e.relatedTarget)) {
      e.stopPropagation()
      if (document.activeElement !== this) {
        !window.testmode && handleHide()
        !window.testmode && props.cancelFn && props.cancelFn(AppModalCancelTypes.blur)
      }
    }
  }

  const modalKeyEvent = (keyCode) => {
    if (keyCode === 27) {
      // Esc
      if (props.cancelFn) props.cancelFn(AppModalCancelTypes.escape)
      handleHide()
    } else if (keyCode === 13) {
      // Enter
      enterHandler()
    } else if (keyCode === 37) {
      // todo && footerIsActive) { // Arrow Left
      setState((prevState) => {
        return { ...prevState, toggleBtn: true }
      })
    } else if (keyCode === 39) {
      // todo && footerIsActive) { // Arrow Right
      setState((prevState) => {
        return { ...prevState, toggleBtn: false }
      })
    }
  }

  const enterHandler = () => {
    if (state.toggleBtn) {
      if (props.okFn) props.okFn()
    } else {
      if (props.cancelFn) props.cancelFn(AppModalCancelTypes.enter)
    }
    handleHide()
  }

  return (
    <div
      data-id={`${props.id}ModalDialogContainer-react`}
      data-bs-backdrop="static"
      data-bs-keyboard="false"
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ display: props.hide ? 'none' : 'block' }}
      role="dialog"
    >
      <div className={'flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0 ' + (props.modalParentClass ? props.modalParentClass : '')} role="document">
        <div
          ref={modal}
          tabIndex={-1}
          className={'inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full remixModalContent ' + (props.modalClass ? props.modalClass : '')}
          onKeyDown={({ keyCode }) => {
            modalKeyEvent(keyCode)
          }}
        >
          <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4 border-b border-theme">
            <h3 className="text-lg leading-6 font-medium text-gray-900 dark:text-gray-100" data-id={`${props.id}ModalDialogModalTitle-react`}>
              {props.title && props.title}
            </h3>
            {!props.showCancelIcon && (
              <button data-id={`${props.id}-modal-close`} className="ml-auto -mx-1.5 -my-1.5 bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 inline-flex h-8 w-8 items-center justify-center" aria-label="Close" onClick={() => handleHide()}>
                <span className="sr-only">Close</span>
                <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
                </svg>
              </button>
            )}
          </div>
          <div className="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4 break-words remixModalBody" data-id={`${props.id}ModalDialogModalBody-react`}>
            {props.children ? props.children : props.message}
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3" data-id={`${props.id}ModalDialogModalFooter-react`}>
            {/* todo add autofocus ^^ */}
            {props.okLabel && (
              <button
                data-id={`${props.id}-modal-footer-ok-react`}
                className={'modal-ok px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200 ' + (props.okBtnClass ? props.okBtnClass : state.toggleBtn ? 'bg-primary hover:bg-primary/90 text-white focus:ring-primary' : 'bg-gray-300 hover:bg-gray-400 text-gray-700 focus:ring-gray-500')}
                disabled={props.validation && !props.validation.valid}
                onClick={() => {
                  if (props.validation && !props.validation.valid) return
                  if (props.okFn) props.okFn()
                  if (props.donotHideOnOkClick) calledHideFunctionOnce.current = false
                  else handleHide()
                }}
              >
                {props.okLabel ? props.okLabel : 'OK'}
              </button>
            )}
            {props.cancelLabel && (
              <button
                data-id={`${props.id}-modal-footer-cancel-react`}
                className={'modal-cancel px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-200 ' + (props.cancelBtnClass ? props.cancelBtnClass : state.toggleBtn ? 'bg-gray-300 hover:bg-gray-400 text-gray-700 focus:ring-gray-500' : 'bg-primary hover:bg-primary/90 text-white focus:ring-primary')}
                data-bs-dismiss="modal"
                onClick={() => {
                  if (props.cancelFn) props.cancelFn(AppModalCancelTypes.click)
                  handleHide()
                }}
              >
                {props.cancelLabel ? props.cancelLabel : 'Cancel'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ModalDialog
