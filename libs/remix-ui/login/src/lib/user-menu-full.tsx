import React, { useState } from 'react'
import { AuthUser } from '@remix-api'
import type { Credits } from '../../../app/src/lib/remix-app/context/auth-context'

interface UserMenuFullProps {
  user: AuthUser
  credits: Credits | null
  showCredits: boolean
  className?: string
  onLogout: () => void
  formatAddress: (address: string) => string
  getProviderDisplayName: (provider: string) => string
  getUserDisplayName: () => string
}

export const UserMenuFull: React.FC<UserMenuFullProps> = ({
  user,
  credits,
  showCredits,
  className,
  onLogout,
  formatAddress,
  getProviderDisplayName,
  getUserDisplayName
}) => {
  const [showDropdown, setShowDropdown] = useState(false)

  return (
    <div className={`d-flex align-items-center gap-2 ${className}`}>
      {credits && showCredits && (
        <div className="badge bg-primary">
          {credits.balance} credits
        </div>
      )}
      <div className="dropdown">
        <button
          className="btn btn-sm btn-success dropdown-toggle d-flex flex-nowrap align-items-center"
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          data-id="user-menu-button"
        >
          {user.picture ? (
            <img
              src={user.picture}
              alt="Avatar"
              className="me-1"
              style={{
                width: '25px',
                height: '25px',
                borderRadius: '50%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <span className="me-1">👤</span>
          )}
          <span>{getUserDisplayName()}</span>
        </button>
        {showDropdown && (
          <>
            <div
              className="dropdown-menu dropdown-menu-end show"
              style={{ position: 'absolute', right: 0, top: '100%' }}
            >
              <div className="dropdown-header">
                {user.picture && (
                  <div className="d-flex justify-content-center mb-2">
                    <img
                      src={user.picture}
                      alt="Avatar"
                      style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                      }}
                    />
                  </div>
                )}
                <div><strong>{getUserDisplayName()}</strong></div>
                <div className="text-muted small">{getProviderDisplayName(user.provider)}</div>
                {user.email && <div className="text-muted small">{user.email}</div>}
                {user.address && <div className="text-muted small font-monospace">{formatAddress(user.address)}</div>}
              </div>
              {credits && (
                <>
                  <div className="dropdown-divider"></div>
                  <div className="dropdown-item-text small">
                    <div className="d-flex justify-content-between mb-1">
                      <span>Total Credits:</span>
                      <strong>{credits.balance}</strong>
                    </div>
                    <div className="d-flex justify-content-between text-muted">
                      <span>Free:</span>
                      <span>{credits.free_credits}</span>
                    </div>
                    <div className="d-flex justify-content-between text-muted">
                      <span>Paid:</span>
                      <span>{credits.paid_credits}</span>
                    </div>
                  </div>
                </>
              )}
              <div className="dropdown-divider"></div>
              <button
                className="dropdown-item text-danger"
                onClick={onLogout}
              >
                Sign Out
              </button>
            </div>
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 1
              }}
              onClick={() => setShowDropdown(false)}
            />
          </>
        )}
      </div>
    </div>
  )
}
