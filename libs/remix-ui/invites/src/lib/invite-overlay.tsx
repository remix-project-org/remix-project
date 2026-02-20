import React from 'react'
import { InviteValidateResponse, InviteRedeemResponse } from '@remix-api'
import { LoginButton } from '@remix-ui/login'
import './invite-overlay.css'

export interface InviteState {
  show: boolean
  token: string | null
  validation: InviteValidateResponse | null
  isAuthenticated: boolean
  redeeming: boolean
  redeemResult: InviteRedeemResponse | null
  error: string | null
}

interface InviteOverlayProps {
  state: InviteState
  onRedeem: (token: string) => Promise<InviteRedeemResponse>
  onClose: () => void
}

/**
 * InviteOverlay - UI component for the InvitationManagerPlugin
 * Renders the invite modal when there's a valid token to show
 */
export const InviteOverlay: React.FC<InviteOverlayProps> = ({
  state,
  onRedeem,
  onClose
}) => {
  // Don't render anything if not showing or no token
  if (!state.show || !state.token || !state.validation) {
    return null
  }

  const { token, validation, isAuthenticated, redeeming, redeemResult, error } = state

  // Format expiration time
  const formatExpiry = (expiresAt: string | null | undefined) => {
    if (!expiresAt) return null
    const date = new Date(expiresAt)
    const now = new Date()
    const diff = date.getTime() - now.getTime()

    if (diff < 0) return 'Expired'

    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))

    if (days > 0) {
      return `Expires in ${days} day${days > 1 ? 's' : ''}`
    } else if (hours > 0) {
      return `Expires in ${hours} hour${hours > 1 ? 's' : ''}`
    } else {
      return 'Expires soon'
    }
  }

  // Get user-friendly error message
  const getErrorMessage = (errorCode: string): string => {
    switch (errorCode) {
    case 'NOT_FOUND':
      return 'This invite code does not exist or is no longer valid.'
    case 'INACTIVE':
      return 'This invite code has been deactivated.'
    case 'EXPIRED':
      return 'This invite code has expired.'
    case 'NOT_STARTED':
      return 'This invite code is not yet active.'
    case 'EXHAUSTED':
    case 'MAX_USES_REACHED':
      return 'This invite code has reached its maximum number of uses.'
    case 'ALREADY_REDEEMED':
      return 'You have already used this invite code.'
    default:
      return 'This invitation is no longer valid.'
    }
  }

  // Invalid token
  if (!validation.valid) {
    return (
      <div className="invite-overlay" onClick={onClose}>
        <div className="invite-modal" onClick={e => e.stopPropagation()}>
          <div className="invite-modal-header">
            <h3>
              <i className="fas fa-exclamation-circle text-danger me-2"></i>
              Invalid Invite
            </h3>
            <button className="invite-modal-close" onClick={onClose}>
              <i className="fas fa-times"></i>
            </button>
          </div>
          <div className="invite-modal-body">
            <div className="invite-error-message">
              <p>{getErrorMessage(validation.error_code || 'NOT_FOUND')}</p>
            </div>
          </div>
          <div className="invite-modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Already redeemed
  if (validation.already_redeemed) {
    return (
      <div className="invite-overlay" onClick={onClose}>
        <div className="invite-modal" onClick={e => e.stopPropagation()}>
          <div className="invite-modal-header">
            <h3>
              <i className="fas fa-info-circle text-info me-2"></i>
              Already Activated
            </h3>
            <button className="invite-modal-close" onClick={onClose}>
              <i className="fas fa-times"></i>
            </button>
          </div>
          <div className="invite-modal-body">
            <p className="text-center">You have already redeemed this invite code.</p>
            {validation.redeemed_at && (
              <p className="text-center text-muted small">
                Redeemed on {new Date(validation.redeemed_at).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="invite-modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Redemption successful
  if (redeemResult?.success) {
    return (
      <div className="invite-overlay" onClick={onClose}>
        <div className="invite-modal invite-modal-success" onClick={e => e.stopPropagation()}>
          <div className="invite-modal-header">
            <h3>
              <i className="fas fa-check-circle text-success me-2"></i>
              Invite Redeemed!
            </h3>
            <button className="invite-modal-close" onClick={onClose}>
              <i className="fas fa-times"></i>
            </button>
          </div>
          <div className="invite-modal-body">
            <p className="text-center mb-3">
              You have successfully activated <strong>{validation.name}</strong>
            </p>
            {redeemResult.actions_applied && redeemResult.actions_applied.length > 0 && (
              <div className="invite-applied-actions">
                <h5>Benefits Applied:</h5>
                <ul className="list-unstyled">
                  {redeemResult.actions_applied.map((action, idx) => (
                    <li key={idx} className="d-flex align-items-center mb-2">
                      <i className={`fas ${action.success ? 'fa-check text-success' : 'fa-times text-danger'} me-2`}></i>
                      <span>{action.type}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="invite-modal-footer">
            <button className="btn btn-primary" onClick={onClose}>
              Get Started
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Already redeemed error from redeem attempt
  if (redeemResult && !redeemResult.success && redeemResult.error_code === 'ALREADY_REDEEMED') {
    return (
      <div className="invite-overlay" onClick={onClose}>
        <div className="invite-modal" onClick={e => e.stopPropagation()}>
          <div className="invite-modal-header">
            <h3>
              <i className="fas fa-info-circle text-info me-2"></i>
              Already Activated
            </h3>
            <button className="invite-modal-close" onClick={onClose}>
              <i className="fas fa-times"></i>
            </button>
          </div>
          <div className="invite-modal-body">
            <p className="text-center">You have already redeemed this invite code.</p>
            {redeemResult.redeemed_at && (
              <p className="text-center text-muted small">
                Redeemed on {new Date(redeemResult.redeemed_at).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="invite-modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Main invite modal
  return (
    <div className="invite-overlay" onClick={onClose}>
      <div className="invite-modal" onClick={e => e.stopPropagation()}>
        <div className="invite-modal-header">
          <h3>
            <i className="fas fa-gift text-primary me-2"></i>
            You've Been Invited!
          </h3>
          <button className="invite-modal-close" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="invite-modal-body">
          {/* Token Name & Description */}
          <div className="invite-token-info mb-4">
            <h4 className="mb-2">{validation.name}</h4>
            {validation.description && (
              <p className="text-muted">{validation.description}</p>
            )}

            {/* Expiry & Remaining Uses */}
            <div className="invite-meta d-flex gap-3 mt-2">
              {validation.expires_at && (
                <span className="badge bg-secondary">
                  <i className="fas fa-clock me-1"></i>
                  {formatExpiry(validation.expires_at)}
                </span>
              )}
              {validation.uses_remaining !== null && validation.uses_remaining !== undefined && (
                <span className="badge bg-secondary">
                  <i className="fas fa-ticket-alt me-1"></i>
                  {validation.uses_remaining} remaining
                </span>
              )}
            </div>
          </div>

          {/* Actions/Benefits preview */}
          {validation.actions && validation.actions.length > 0 && (
            <div className="invite-benefits mb-4">
              <h5 className="text-uppercase small">What you'll get:</h5>
              <ul className="list-unstyled">
                {validation.actions.map((action, idx) => (
                  <li key={idx} className="d-flex align-items-center mb-2">
                    <i className={`fas fa-${getActionIcon(action.type)} text-primary me-2`}></i>
                    <span>{action.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="alert alert-danger">
              <i className="fas fa-exclamation-triangle me-2"></i>
              {error}
            </div>
          )}
        </div>

        <div className="invite-modal-footer">
          {isAuthenticated ? (
            <button
              className="btn btn-primary btn-lg w-100"
              onClick={() => onRedeem(token)}
              disabled={redeeming}
            >
              {redeeming ? (
                <>
                  <i className="fas fa-spinner fa-spin me-2"></i>
                  Activating...
                </>
              ) : (
                <>
                  <i className="fas fa-check me-2"></i>
                  Activate Invite
                </>
              )}
            </button>
          ) : (
            <div className="w-100">
              <p className="text-center text-muted mb-3">
                <i className="fas fa-info-circle me-1"></i>
                Sign in to activate this invite
              </p>
              <LoginButton className="btn-lg w-100" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Helper function to get icon for action type
function getActionIcon(type: string): string {
  switch (type) {
  case 'add_to_feature_group':
    return 'star'
  case 'grant_credits':
    return 'coins'
  case 'grant_product':
    return 'gift'
  case 'add_tag':
    return 'tag'
  default:
    return 'check'
  }
}
