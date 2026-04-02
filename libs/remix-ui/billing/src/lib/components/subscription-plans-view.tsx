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

  if (!plans || plans.length === 0) {
    return (
      <div className="text-gray-500 dark:text-gray-400 text-center p-4">
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
              <div className={`card h-full ${plan.popular ? 'border-primary' : ''} ${isCurrent ? 'border-success' : ''}`}>
                {plan.popular && !isCurrent && (
                  <div className="card-header bg-primary text-white text-center py-1">
                    <small><i className="fas fa-star mr-1"></i>Most Popular</small>
                  </div>
                )}
                {isCurrent && (
                  <div className="card-header bg-success text-white text-center py-1">
                    <small><i className="fas fa-check mr-1"></i>Current Plan</small>
                  </div>
                )}

                <div className="card-body flex flex-col">
                  <h5 className="card-title">{plan.name}</h5>
                  <p className="card-text text-gray-500 dark:text-gray-400 small">
                    {plan.description}
                  </p>

                  <div className="mb-3">
                    {isFree ? (
                      <span className="h4">Free</span>
                    ) : (
                      <>
                        <span className="h4">{BillingApiService.formatPrice(plan.priceUsd)}</span>
                        <small className="text-gray-500 dark:text-gray-400">/month</small>
                      </>
                    )}
                  </div>

                  <div className="mb-3">
                    <div className="h5 text-primary">
                      <i className="fas fa-coins mr-2"></i>
                      {plan.creditsPerMonth.toLocaleString()}
                    </div>
                    <small className="text-gray-500 dark:text-gray-400">credits per month</small>
                  </div>

                  {plan.features && plan.features.length > 0 && (
                    <ul className="list-unstyled mb-3 flex-grow-1">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="mb-1 small">
                          <i className="fas fa-check text-success mr-2"></i>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  )}

                  {isCurrent ? (
                    <button className="btn btn-outline-success" disabled>
                      <i className="fas fa-check mr-2"></i>
                      Current Plan
                    </button>
                  ) : isFree ? (
                    <button className="inline-flex items-center px-4 py-2 border border-secondary text-secondary rounded-md hover:bg-secondary hover:text-white transition-colors" disabled>
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
