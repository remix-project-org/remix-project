import React, {useEffect} from 'react' // eslint-disable-line
import { Toaster as SonnerToaster, toast } from 'sonner'

import './toaster.css'

// Export toast so callers can use toast.dismiss(id)
export { toast }

/* eslint-disable-next-line */
export interface ToasterProps {
  message: string | JSX.Element
  timeout?: number
  handleHide?: () => void
  timestamp?: number
  id?: string | number
  onToastCreated?: (toastId: string | number) => void
}

export interface ToasterContainerProps {
  toasts: ToasterProps[]
}

// Individual toast trigger component (no UI, just triggers toast)
export const ToastTrigger = (props: ToasterProps) => {
  const mountedRef = React.useRef(false)

  useEffect(() => {
    // Only trigger on mount, not on updates
    if (!mountedRef.current && props.message && props.id) {
      mountedRef.current = true

      // Show toast using Sonner - Sonner handles deduplication via ID automatically
      const duration = props.timeout || 3000
      const showCloseButton = true
      const showLoadingIcon = duration > 3000

      if (typeof props.message === 'string') {
        const toastId = toast.custom(
          () => (
            <div data-shared="tooltipPopup" className="toast show" role="alert" aria-live="assertive" aria-atomic="true">
              <div className="toast-header">
                {showLoadingIcon && (
                  <span className="spinner-border spinner-border-sm me-2" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </span>
                )}
                <strong className="me-auto">Remix</strong>
                {showCloseButton && (
                  <button type="button" className="btn-close" onClick={() => toast.dismiss(toastId)} aria-label="Close"></button>
                )}
              </div>
              <div className="toast-body">
                {props.message}
              </div>
            </div>
          ),
          {
            id: props.id,
            unstyled: true,
            duration,
            closeButton: false,
            onDismiss: () => {
              props.handleHide && props.handleHide()
            },
            onAutoClose: () => {
              props.handleHide && props.handleHide()
            }
          }
        )
        // Call the callback with the toast ID so caller can dismiss it later
        if (props.onToastCreated) {
          props.onToastCreated(toastId)
        }
      } else {
        // For JSX elements, use toast.custom
        const toastId = toast.custom(
          () => (
            <div data-shared="tooltipPopup" className="toast show" role="alert" aria-live="assertive" aria-atomic="true">
              <div className="toast-header">
                {showLoadingIcon && (
                  <span className="spinner-border spinner-border-sm me-2" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </span>
                )}
                <strong className="me-auto">Remix</strong>
                {showCloseButton && (
                  <button type="button" className="btn-close" onClick={() => toast.dismiss(toastId)} aria-label="Close"></button>
                )}
              </div>
              <div className="toast-body">
                {props.message}
              </div>
            </div>
          ),
          {
            id: props.id,
            duration,
            closeButton: false,
            onDismiss: () => {
              props.handleHide && props.handleHide()
            },
            onAutoClose: () => {
              props.handleHide && props.handleHide()
            }
          }
        )
        // Call the callback with the toast ID so caller can dismiss it later
        if (props.onToastCreated) {
          props.onToastCreated(toastId)
        }
      }
    }
  }, [])

  return null
}

// Container component that renders the Sonner toaster and all toast triggers
export const ToasterContainer = (props: ToasterContainerProps) => {
  return (
    <>
      <SonnerToaster
        position="top-right"
        gap={0}
        expand={false}
        visibleToasts={9}
        toastOptions={{
          className: 'remixui_sonner_toast',
          unstyled: true,
          style: {
            transform: 'none',
            transition: 'none'
          }
        }}
      />
      {props.toasts.map((toastProps) => (
        <ToastTrigger
          key={toastProps.id || toastProps.timestamp}
          {...toastProps}
        />
      ))}
    </>
  )
}

// Legacy component for backward compatibility
export const Toaster = (props: ToasterProps) => {
  useEffect(() => {
    if (props.message) {
      // Show toast using Sonner
      const duration = props.timeout || 3000
      const showCloseButton = true
      const showLoadingIcon = duration > 3000

      let toastId: string | number

      if (typeof props.message === 'string') {

        toastId = toast.custom(
          () => (
            <div data-shared="tooltipPopup" className="toast show" role="alert" aria-live="assertive" aria-atomic="true">
              <div className="toast-header">
                {showLoadingIcon && (
                  <span className="spinner-border spinner-border-sm me-2" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </span>
                )}
                <strong className="me-auto">Remix</strong>
                {showCloseButton && (
                  <button type="button" className="btn-close" onClick={() => toast.dismiss(toastId)} aria-label="Close"></button>
                )}
              </div>
              <div className="toast-body">
                {props.message}
              </div>
            </div>
          ),
          {
            id: props.id,
            unstyled: true,
            duration,
            closeButton: false,
            onDismiss: () => {
              props.handleHide && props.handleHide()
            },
            onAutoClose: () => {
              props.handleHide && props.handleHide()
            }
          }
        )
      } else {
        // For JSX elements, use toast.custom
        toastId = toast.custom(
          () => (
            <div data-shared="tooltipPopup" className="toast show" role="alert" aria-live="assertive" aria-atomic="true">
              <div className="toast-header">
                {showLoadingIcon && (
                  <span className="spinner-border spinner-border-sm me-2" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </span>
                )}
                <strong className="me-auto">Remix</strong>
                {showCloseButton && (
                  <button type="button" className="btn-close" onClick={() => toast.dismiss(toastId)} aria-label="Close"></button>
                )}
              </div>
              <div className="toast-body">
                {props.message}
              </div>
            </div>
          ),
          {
            id: props.id,
            duration,
            closeButton: false,
            onDismiss: () => {
              props.handleHide && props.handleHide()
            },
            onAutoClose: () => {
              props.handleHide && props.handleHide()
            }
          }
        )
      }

      // Call the callback with the toast ID so caller can dismiss it later
      if (props.onToastCreated) {
        props.onToastCreated(toastId)
      }
    }
  }, [props.message, props.timestamp])

  return <div></div>
}

export default Toaster
