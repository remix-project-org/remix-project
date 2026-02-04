import React from 'react'
import { ActiveEntitlement } from '@remix-api'

export interface ActiveEntitlementsProps {
  /** List of active entitlements */
  entitlements: ActiveEntitlement[]
  /** Whether entitlements are loading */
  loading?: boolean
  /** Error message if loading failed */
  error?: string | null
  /** Callback when user wants to manage a subscription */
  onManage?: (entitlement: ActiveEntitlement) => void
  /** Whether to show in compact mode (for embedding in other components) */
  compact?: boolean
  /** Optional class name for styling */
  className?: string
}

/**
 * Display active entitlements (subscriptions and feature access)
 * Reusable component that can be embedded in billing manager or used standalone
 */
export const ActiveEntitlements: React.FC<ActiveEntitlementsProps> = ({
  entitlements,
  loading = false,
  error = null,
  onManage,
  compact = false,
  className = ''
}) => {
  if (loading) {
    return (
      <div className={`active-entitlements ${className}`}>
        <div className="d-flex align-items-center gap-2 text-muted">
          <div className="spinner-border spinner-border-sm" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <span>Loading subscriptions...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`active-entitlements ${className}`}>
        <div className="alert alert-danger mb-0 py-2">
          <i className="fas fa-exclamation-circle me-2"></i>
          {error}
        </div>
      </div>
    )
  }

  if (entitlements.length === 0) {
    return (
      <div className={`active-entitlements ${className}`}>
        <div className="d-flex align-items-start gap-2 text-muted">
          <i className="fas fa-info-circle mt-1"></i>
          <div>
            <strong>No active subscription</strong>
            <p className="mb-0 small">You're on the free plan. Upgrade to get more credits!</p>
          </div>
        </div>
      </div>
    )
  }

  // Group entitlements by type
  const creditSubscriptions = entitlements.filter(e => e.type === 'credit_subscription')
  const featureAccess = entitlements.filter(e => e.type === 'feature_access')

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const getStatusBadge = (entitlement: ActiveEntitlement) => {
    const { status, isExpiringSoon, cancelAtPeriodEnd, daysRemaining } = entitlement
    
    if (cancelAtPeriodEnd) {
      return <span className="badge bg-warning text-dark">Canceling</span>
    }
    if (isExpiringSoon && daysRemaining !== null) {
      return <span className="badge bg-warning text-dark">Expires in {daysRemaining} days</span>
    }
    if (status === 'active') {
      return <span className="badge bg-success">Active</span>
    }
    if (status === 'trialing') {
      return <span className="badge bg-info">Trial</span>
    }
    if (status === 'past_due') {
      return <span className="badge bg-danger">Past Due</span>
    }
    return <span className="badge bg-secondary">{status}</span>
  }

  const renderEntitlement = (entitlement: ActiveEntitlement) => {
    const isCompact = compact
    
    return (
      <div 
        key={entitlement.id} 
        className={`entitlement-card border rounded p-3 ${isCompact ? 'py-2' : ''}`}
      >
        <div className="d-flex justify-content-between align-items-start">
          <div className="flex-grow-1">
            <div className="d-flex align-items-center gap-2 mb-1">
              <i className={`fas ${entitlement.type === 'credit_subscription' ? 'fa-coins' : 'fa-key'} text-primary`}></i>
              <strong>{entitlement.name}</strong>
              {getStatusBadge(entitlement)}
            </div>
            
            {!isCompact && entitlement.description && (
              <p className="text-muted small mb-2">{entitlement.description}</p>
            )}
            
            <div className="d-flex flex-wrap gap-3 text-muted small">
              {entitlement.creditsPerPeriod && (
                <span>
                  <i className="fas fa-coins me-1"></i>
                  {entitlement.creditsPerPeriod.toLocaleString()} credits/{entitlement.billingInterval}
                </span>
              )}
              
              {entitlement.featureGroupDisplayName && (
                <span>
                  <i className="fas fa-layer-group me-1"></i>
                  {entitlement.featureGroupDisplayName}
                </span>
              )}
              
              {entitlement.isRecurring && entitlement.billingInterval && (
                <span>
                  <i className="fas fa-sync-alt me-1"></i>
                  {entitlement.billingInterval === 'month' ? 'Monthly' : 
                   entitlement.billingInterval === 'year' ? 'Yearly' : 
                   `Every ${entitlement.billingInterval}`}
                </span>
              )}
              
              {entitlement.expiresAt && (
                <span>
                  <i className="fas fa-calendar me-1"></i>
                  {entitlement.cancelAtPeriodEnd ? 'Ends' : 'Renews'}: {formatDate(entitlement.expiresAt)}
                </span>
              )}
            </div>
          </div>
          
          {onManage && (
            <button
              className="btn btn-sm btn-outline-secondary ms-2"
              onClick={() => onManage(entitlement)}
              title="Manage subscription"
            >
              <i className="fas fa-cog"></i>
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={`active-entitlements ${className}`}>
      <div className="d-flex flex-column gap-2">
        {/* Credit Subscriptions */}
        {creditSubscriptions.map(renderEntitlement)}
        
        {/* Feature Access */}
        {featureAccess.map(renderEntitlement)}
      </div>
    </div>
  )
}

export default ActiveEntitlements
