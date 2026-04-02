import React from 'react'
import { CreditPackagesViewProps } from '../types'
import { BillingApiService } from '@remix-api'
import { PurchaseButton } from './purchase-button'

/**
 * Display available credit packages for purchase
 */
export const CreditPackagesView: React.FC<CreditPackagesViewProps> = ({
  packages,
  loading = false,
  error = null,
  currentBalance,
  onPurchase,
  purchasing = false
}) => {
  if (loading) {
    return (
      <div className="flex justify-center p-4">
        <div className="spinner-border spinner-border-sm" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="alert alert-warning m-3">
        <i className="fas fa-exclamation-triangle mr-2"></i>
        {error}
      </div>
    )
  }

  if (!packages || packages.length === 0) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-center p-4">
        No credit packages available
      </div>
    )
  }

  return (
    <div className="credit-packages-view">
      {currentBalance !== undefined && (
        <div className="mb-3 p-3 bg-light rounded">
          <small className="text-gray-500 dark:text-gray-400">Current Balance</small>
          <div className="h5 mb-0">
            <i className="fas fa-coins mr-2 text-warning"></i>
            {currentBalance.toLocaleString()} credits
          </div>
        </div>
      )}

      <div className="row g-3">
        {packages.map((pkg) => {
          // Get active Paddle provider
          const paddleProvider = BillingApiService.getActiveProvider(pkg, 'paddle')
          const priceId = paddleProvider?.priceId || null

          return (
            <div key={pkg.id} className="col-12 col-md-6 col-lg-3">
              <div className={`card h-full ${pkg.popular ? 'border-primary' : ''}`}>
                {pkg.popular && (
                  <div className="card-header bg-primary text-white text-center py-1">
                    <small><i className="fas fa-star mr-1"></i>Popular</small>
                  </div>
                )}
                <div className="card-body flex flex-col">
                  <h5 className="card-title">{pkg.name}</h5>
                  <p className="card-text text-gray-500 dark:text-gray-400 small flex-grow-1">
                    {pkg.description}
                  </p>

                  <div className="mb-3">
                    <div className="h4 mb-0">
                      <i className="fas fa-coins mr-2 text-warning"></i>
                      {pkg.credits.toLocaleString()}
                    </div>
                    <small className="text-gray-500 dark:text-gray-400">credits</small>
                  </div>

                  <div className="mb-3">
                    <span className="h5">{BillingApiService.formatPrice(pkg.priceUsd)}</span>
                    {pkg.savings && (
                      <span className="badge bg-success ml-2">{pkg.savings}</span>
                    )}
                  </div>

                  <PurchaseButton
                    label="Buy Now"
                    priceId={priceId}
                    onClick={() => onPurchase(pkg.id, priceId)}
                    loading={purchasing}
                    disabled={!priceId}
                    variant={pkg.popular ? 'primary' : 'outline'}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
