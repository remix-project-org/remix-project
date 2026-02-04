import React, { useState, useEffect, useCallback } from 'react'
import { EligibleProduct } from '../types'

export interface FreePaddleCheckoutProps {
  /** The checkout URL from the API */
  checkoutUrl: string
  /** Transaction ID */
  transactionId: string
  /** Product information */
  product?: EligibleProduct
  /** Called when checkout is completed successfully */
  onComplete?: () => void
  /** Called when checkout is closed/cancelled */
  onClose?: () => void
  /** Whether the overlay is visible */
  isOpen: boolean
}

/**
 * FreePaddle Checkout Overlay
 * 
 * Displays the FreePaddle checkout page in an iframe overlay,
 * similar to how Paddle.js displays its checkout modal.
 * 
 * Flow:
 * 1. User sees checkout page in iframe
 * 2. User confirms purchase in iframe
 * 3. Iframe calls backend to complete the transaction
 * 4. Iframe sends postMessage: freepaddle:checkout:complete
 * 5. Overlay closes and parent refreshes data
 */
export const FreePaddleCheckoutOverlay: React.FC<FreePaddleCheckoutProps> = ({
  checkoutUrl,
  transactionId,
  product,
  onComplete,
  onClose,
  isOpen
}) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Listen for messages from the iframe (checkout completion)
  useEffect(() => {
    if (!isOpen) return

    const handleMessage = (event: MessageEvent) => {
      // Verify origin for security
      try {
        const url = new URL(checkoutUrl)
        if (event.origin !== url.origin) return
      } catch {
        return
      }

      // Handle checkout completion - iframe has completed the purchase
      if (event.data?.type === 'freepaddle:checkout:complete') {
        console.log('[FreePaddleCheckout] Checkout completed:', event.data)
        onComplete?.()
      } else if (event.data?.type === 'freepaddle:checkout:close') {
        console.log('[FreePaddleCheckout] Checkout closed')
        onClose?.()
      } else if (event.data?.type === 'freepaddle:checkout:error') {
        console.error('[FreePaddleCheckout] Checkout error:', event.data.error)
        setError(event.data.error || 'Checkout failed')
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [isOpen, checkoutUrl, onComplete, onClose])

  // Handle iframe load
  const handleIframeLoad = useCallback(() => {
    setLoading(false)
  }, [])

  // Handle iframe error
  const handleIframeError = useCallback(() => {
    setLoading(false)
    setError('Failed to load checkout page')
  }, [])

  // Handle close button click
  const handleClose = useCallback(() => {
    onClose?.()
  }, [onClose])

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }, [handleClose])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleClose])

  if (!isOpen) return null

  return (
    <div 
      className="freepaddle-checkout-overlay"
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div 
        className="freepaddle-checkout-modal"
        style={{
          backgroundColor: 'var(--remix-background, #fff)',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          maxWidth: '500px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div 
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--remix-border, #e5e7eb)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >

          <button
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '4px',
              color: 'var(--remix-text-muted, #6b7280)'
            }}
            aria-label="Close checkout"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {/* Loading state */}
          {loading && (
            <div 
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'var(--remix-background, #fff)'
              }}
            >
              <div className="spinner-border spinner-border-sm" role="status">
                <span className="visually-hidden">Loading checkout...</span>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div 
              style={{
                padding: '40px 20px',
                textAlign: 'center'
              }}
            >
              <i className="fas fa-exclamation-triangle" style={{ fontSize: '32px', color: '#ef4444', marginBottom: '16px' }}></i>
              <p style={{ color: 'var(--remix-text, #1f2937)', marginBottom: '8px' }}>{error}</p>
              <button
                onClick={handleClose}
                className="btn btn-secondary btn-sm"
              >
                Close
              </button>
            </div>
          )}

          {/* Iframe */}
          {!error && (
            <iframe
              src={checkoutUrl}
              onLoad={handleIframeLoad}
              onError={handleIframeError}
              title="FreePaddle Checkout"
              style={{
                width: '100%',
                height: '450px',
                border: 'none',
                display: loading ? 'none' : 'block'
              }}
              allow="payment"
            />
          )}
        </div>

        {/* Footer with product info */}
        {product && (
          <div 
            style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--remix-border, #e5e7eb)',
              backgroundColor: 'var(--remix-background-subtle, #f9fafb)',
              fontSize: '13px',
              color: 'var(--remix-text-muted, #6b7280)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{product.name}</span>
              <span style={{ fontWeight: 600, color: 'var(--remix-text, #1f2937)' }}>
                {product.price_cents === 0 ? 'Free' : `$${(product.price_cents / 100).toFixed(2)}`}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default FreePaddleCheckoutOverlay
