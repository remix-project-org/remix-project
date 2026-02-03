import React from 'react'
import { PurchaseButtonProps } from '../types'

/**
 * Purchase/Subscribe button component
 */
export const PurchaseButton: React.FC<PurchaseButtonProps> = ({
  label,
  priceId,
  disabled = false,
  loading = false,
  onClick,
  variant = 'primary',
  className = '',
  requirePriceId = true
}) => {
  const getButtonClass = () => {
    const base = 'btn w-100'
    switch (variant) {
    case 'primary':
      return `${base} btn-primary`
    case 'secondary':
      return `${base} btn-secondary`
    case 'outline':
      return `${base} btn-outline-primary`
    default:
      return `${base} btn-primary`
    }
  }

  const isDisabled = disabled || loading || (requirePriceId && !priceId)

  return (
    <button
      className={`${getButtonClass()} ${className}`}
      onClick={onClick}
      disabled={isDisabled}
      title={!priceId ? 'Payment not available for this item' : undefined}
    >
      {loading ? (
        <>
          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
          Processing...
        </>
      ) : (
        <>
          {requirePriceId && !priceId && <i className="fas fa-lock me-2"></i>}
          {label}
        </>
      )}
    </button>
  )
}
