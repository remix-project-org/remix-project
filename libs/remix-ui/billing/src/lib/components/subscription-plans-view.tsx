import React from 'react'
import { SubscriptionPlansViewProps } from '../types'
import { BillingApiService } from '@remix-api'
import { PurchaseButton } from './purchase-button'

/**
 * Display available subscription plans
 */
export const SubscriptionPlansView: React.FC<SubscriptionPlansViewProps> = ({
  plans,
  loading = false,
  error = null,
  currentSubscription,
  onSubscribe,
  subscribing = false
}) => {
  if (loading) {
    return (
      <div className="d-flex justify-content-center p-4">
        <div className="spinner-border spinner-border-sm" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="alert alert-warning m-3">
        <i className="fas fa-exclamation-triangle me-2"></i>
        {error}
      </div>
    )
  }

  if (!plans || plans.length === 0) {
    return (
      <div className="text-muted text-center p-4">
        No subscription plans available
      </div>
    )
  }

  const isCurrentPlan = (planId: string) => currentSubscription?.planId === planId

  return (
    <div className="subscription-plans-view">
      <div className="row g-3">
        {plans.map((plan) => {
          const isCurrent = isCurrentPlan(plan.id)
          const isFree = plan.priceUsd === 0
          // Get active Paddle provider
          const paddleProvider = BillingApiService.getActiveProvider(plan, 'paddle')
          const priceId = paddleProvider?.priceId || null

          return (
            <div key={plan.id} className="col-12 col-md-6 col-lg-4">
              <div className={`card h-100 ${plan.popular ? 'border-primary' : ''} ${isCurrent ? 'border-success' : ''}`}>
                {plan.popular && !isCurrent && (
                  <div className="card-header bg-primary text-white text-center py-1">
                    <small><i className="fas fa-star me-1"></i>Most Popular</small>
                  </div>
                )}
                {isCurrent && (
                  <div className="card-header bg-success text-white text-center py-1">
                    <small><i className="fas fa-check me-1"></i>Current Plan</small>
                  </div>
                )}
                
                <div className="card-body d-flex flex-column">
                  <h5 className="card-title">{plan.name}</h5>
                  <p className="card-text text-muted small">
                    {plan.description}
                  </p>

                  <div className="mb-3">
                    {isFree ? (
                      <span className="h4">Free</span>
                    ) : (
                      <>
                        <span className="h4">{BillingApiService.formatPrice(plan.priceUsd)}</span>
                        <small className="text-muted">/month</small>
                      </>
                    )}
                  </div>

                  <div className="mb-3">
                    <div className="h5 text-primary">
                      <i className="fas fa-coins me-2"></i>
                      {plan.creditsPerMonth.toLocaleString()}
                    </div>
                    <small className="text-muted">credits per month</small>
                  </div>

                  {plan.features && plan.features.length > 0 && (
                    <ul className="list-unstyled mb-3 flex-grow-1">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="mb-1 small">
                          <i className="fas fa-check text-success me-2"></i>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  )}

                  {isCurrent ? (
                    <button className="btn btn-outline-success" disabled>
                      <i className="fas fa-check me-2"></i>
                      Current Plan
                    </button>
                  ) : isFree ? (
                    <button className="btn btn-outline-secondary" disabled>
                      Included
                    </button>
                  ) : (
                    <PurchaseButton
                      label={currentSubscription ? 'Upgrade' : 'Subscribe'}
                      priceId={priceId}
                      onClick={() => onSubscribe(plan.id, priceId)}
                      loading={subscribing}
                      disabled={!priceId}
                      variant={plan.popular ? 'primary' : 'outline'}
                    />
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
