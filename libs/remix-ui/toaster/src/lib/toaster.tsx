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
            <div data-shared="tooltipPopup" className="max-w-xs bg-white dark:bg-gray-800 border border-theme rounded-xl shadow-lg" role="alert" aria-live="assertive" aria-atomic="true">
              <div className="flex items-center justify-between p-4 border-b border-theme">
                {showLoadingIcon && (
                  <span className="inline-block w-4 h-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent motion-reduce:animate-none mr-2" role="status">
                    <span className="sr-only">Loading...</span>
                  </span>
                )}
                <div className="flex items-center"><strong className="mr-auto font-bold text-gray-900 dark:text-gray-100">Remix</strong></div>
                {showCloseButton && (
                  <button type="button" className="ml-auto -mx-1.5 -my-1.5 bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 inline-flex h-8 w-8 items-center justify-center" onClick={() => toast.dismiss(toastId)} aria-label="Close">
                    <span className="sr-only">Close</span>
                    <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
                    </svg>
                  </button>
                )}
              </div>
              <div className="p-4 text-sm text-gray-800 dark:text-gray-200">
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
            <div data-shared="tooltipPopup" className="max-w-xs bg-white dark:bg-gray-800 border border-theme rounded-xl shadow-lg" role="alert" aria-live="assertive" aria-atomic="true">
              <div className="flex items-center justify-between p-4 border-b border-theme">
                {showLoadingIcon && (
                  <span className="inline-block w-4 h-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent motion-reduce:animate-none mr-2" role="status">
                    <span className="sr-only">Loading...</span>
                  </span>
                )}
                <div className="flex items-center"><strong className="mr-auto font-bold text-gray-900 dark:text-gray-100">Remix</strong></div>
                {showCloseButton && (
                  <button type="button" className="ml-auto -mx-1.5 -my-1.5 bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 inline-flex h-8 w-8 items-center justify-center" onClick={() => toast.dismiss(toastId)} aria-label="Close">
                    <span className="sr-only">Close</span>
                    <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
                    </svg>
                  </button>
                )}
              </div>
              <div className="p-4 text-sm text-gray-800 dark:text-gray-200">
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
            <div data-shared="tooltipPopup" className="max-w-xs bg-white dark:bg-gray-800 border border-theme rounded-xl shadow-lg" role="alert" aria-live="assertive" aria-atomic="true">
              <div className="flex items-center justify-between p-4 border-b border-theme">
                {showLoadingIcon && (
                  <span className="inline-block w-4 h-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent motion-reduce:animate-none mr-2" role="status">
                    <span className="sr-only">Loading...</span>
                  </span>
                )}
                <div className="flex items-center"><strong className="mr-auto font-bold text-gray-900 dark:text-gray-100">Remix</strong></div>
                {showCloseButton && (
                  <button type="button" className="ml-auto -mx-1.5 -my-1.5 bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 inline-flex h-8 w-8 items-center justify-center" onClick={() => toast.dismiss(toastId)} aria-label="Close">
                    <span className="sr-only">Close</span>
                    <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
                    </svg>
                  </button>
                )}
              </div>
              <div className="p-4 text-sm text-gray-800 dark:text-gray-200">
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
            <div data-shared="tooltipPopup" className="max-w-xs bg-white dark:bg-gray-800 border border-theme rounded-xl shadow-lg" role="alert" aria-live="assertive" aria-atomic="true">
              <div className="flex items-center justify-between p-4 border-b border-theme">
                {showLoadingIcon && (
                  <span className="inline-block w-4 h-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent motion-reduce:animate-none mr-2" role="status">
                    <span className="sr-only">Loading...</span>
                  </span>
                )}
                <div className="flex items-center"><strong className="mr-auto font-bold text-gray-900 dark:text-gray-100">Remix</strong></div>
                {showCloseButton && (
                  <button type="button" className="ml-auto -mx-1.5 -my-1.5 bg-white dark:bg-gray-800 text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 rounded-lg focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600 p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 inline-flex h-8 w-8 items-center justify-center" onClick={() => toast.dismiss(toastId)} aria-label="Close">
                    <span className="sr-only">Close</span>
                    <svg className="w-3 h-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 14 14">
                      <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"/>
                    </svg>
                  </button>
                )}
              </div>
              <div className="p-4 text-sm text-gray-800 dark:text-gray-200">
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
