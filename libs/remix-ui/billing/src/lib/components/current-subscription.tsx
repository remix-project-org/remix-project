import React from 'react'
import { CurrentSubscriptionProps } from '../types'

/**
 * Display user's current subscription status
 */
export const CurrentSubscription: React.FC<CurrentSubscriptionProps> = ({
  subscription,
  loading = false,
  onManage,
  onCancel
}) => {
  if (loading) {
    return (
      <div className="d-flex justify-content-center p-3">
        <div className="spinner-border spinner-border-sm" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    )
  }

  if (!subscription) {
    return (
      <div className="p-3 bg-light rounded">
        <div className="text-muted">
          <i className="fas fa-info-circle me-2"></i>
          No active subscription
        </div>
        <small className="text-muted">
          You're on the free plan. Upgrade to get more credits!
        </small>
      </div>
    )
  }

  const getStatusBadge = () => {
    switch (subscription.status) {
      case 'active':
        return <span className="badge bg-success">Active</span>
      case 'paused':
        return <span className="badge bg-warning">Paused</span>
      case 'canceled':
        return <span className="badge bg-secondary">Canceled</span>
      case 'past_due':
        return <span className="badge bg-danger">Past Due</span>
      case 'trialing':
        return <span className="badge bg-info">Trial</span>
      default:
        return <span className="badge bg-secondary">{subscription.status}</span>
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  // Extract plan info from subscription items
  const mainItem = subscription.items?.[0]
  const planName = mainItem?.product?.name || subscription.planId || 'Unknown Plan'
  const planDescription = mainItem?.description || ''
  
  // Parse credits from description (e.g., "Pro - 1000 credits/month")
  const creditsMatch = planDescription.match(/(\d+)\s*credits/)
  const creditsPerMonth = creditsMatch ? parseInt(creditsMatch[1], 10) : subscription.creditsPerMonth
  
  // Get billing period dates
  const periodStart = subscription.currentBillingPeriod?.startsAt || subscription.currentPeriodStart
  const periodEnd = subscription.currentBillingPeriod?.endsAt || subscription.currentPeriodEnd
  
  // Check for scheduled cancellation
  const isCanceling = subscription.scheduledChange?.action === 'cancel' || subscription.cancelAtPeriodEnd

  // Format price
  const price = mainItem?.unitPrice 
    ? `$${(parseInt(mainItem.unitPrice.amount, 10) / 100).toFixed(2)}`
    : null
  const billingInterval = mainItem?.billingCycle?.interval || 'month'

  return (
    <div className="current-subscription p-3 bg-light rounded">
      <div className="d-flex justify-content-between align-items-start mb-2">
        <div>
          <h6 className="mb-1">
            {planName} {getStatusBadge()}
          </h6>
          {price && (
            <small className="text-muted">{price}/{billingInterval}</small>
          )}
        </div>
        {creditsPerMonth && (
          <div className="text-end">
            <div className="h5 mb-0 text-primary">
              <i className="fas fa-coins me-1"></i>
              {creditsPerMonth.toLocaleString()}
            </div>
            <small className="text-muted">credits/month</small>
          </div>
        )}
      </div>

      {periodStart && periodEnd && (
        <div className="row g-2 mb-3">
          <div className="col-6">
            <small className="text-muted d-block">Current Period</small>
            <small>
              {formatDate(periodStart)} - {formatDate(periodEnd)}
            </small>
          </div>
          {isCanceling && (
            <div className="col-6">
              <small className="text-warning d-block">
                <i className="fas fa-exclamation-triangle me-1"></i>
                Cancels at period end
              </small>
            </div>
          )}
        </div>
      )}

      <div className="d-flex gap-2">
        {onManage && (
          <button
            className="btn btn-sm btn-outline-primary"
            onClick={onManage}
          >
            <i className="fas fa-cog me-1"></i>
            Manage
          </button>
        )}
        {onCancel && subscription.status === 'active' && !subscription.cancelAtPeriodEnd && (
          <button
            className="btn btn-sm btn-outline-danger"
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
