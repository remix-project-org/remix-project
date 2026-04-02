import React, { useState } from 'react'
import { AuthUser } from '@remix-api'
import type { Credits } from '../../../app/src/lib/remix-app/context/auth-context'

interface UserBadgeProps {
  user: AuthUser
  credits: Credits | null
  showCredits: boolean
  className?: string
  onLogout: () => void
  formatAddress: (address: string) => string
  getProviderDisplayName: (provider: string) => string
  getUserDisplayName: () => string
}

export const UserBadge: React.FC<UserBadgeProps> = ({
  user,
  credits,
  showCredits,
  className,
  onLogout,
  getProviderDisplayName,
  getUserDisplayName
}) => {
  const [showDropdown, setShowDropdown] = useState(false)

  return (
    <div className={`flex items-center ${className}`}>
      <div className="dropdown">
        <button
          className="inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors btn-success dropdown-toggle flex flex-nowrap items-center"
          type="button"
          onClick={() => setShowDropdown(!showDropdown)}
          data-id="user-badge"
        >
          {user.picture ? (
            <img
              src={user.picture}
              alt="Avatar"
              className="mr-1"
              style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <span className="mr-1">✓</span>
          )}
          <span>{getUserDisplayName()}</span>
          {showCredits && credits && (
            <span className="badge bg-light text-dark ml-2">
              {credits.balance} credits
            </span>
          )}
        </button>
        {showDropdown && (
          <div
            className="dropdown-menu dropdown-menu-end show"
            style={{ position: 'absolute', right: 0, top: '100%' }}
          >
            <div className="dropdown-header">
              {user.picture && (
                <div className="flex justify-center mb-2">
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
              <div className="text-gray-500 dark:text-gray-400 small">{getProviderDisplayName(user.provider)}</div>
            </div>
            {credits && (
              <>
                <div className="dropdown-divider"></div>
                <div className="dropdown-item-text small">
                  <div className="flex justify-between mb-1">
                    <span>Total Credits:</span>
                    <strong>{credits.balance}</strong>
                  </div>
                  <div className="flex justify-between text-gray-500 dark:text-gray-400">
                    <span>Free:</span>
                    <span>{credits.free_credits}</span>
                  </div>
                  <div className="flex justify-between text-gray-500 dark:text-gray-400">
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
        )}
      </div>
      {/* Backdrop to close dropdown */}
      {showDropdown && (
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
      )}
    </div>
  )
}
