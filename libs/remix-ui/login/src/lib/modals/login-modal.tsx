import React, { useEffect, useState } from 'react'
import { AuthProvider } from '@remix-api'
import { useAuth } from '../../../../app/src/lib/remix-app/context/auth-context'
import { endpointUrls } from '@remix-endpoints-helper'
import './login-modal.css'

interface LoginModalProps {
  onClose: () => void
}

interface ProviderConfig {
  id: AuthProvider
  label: string
  icon: JSX.Element
  description: string
  enabled: boolean
}

export const LoginModal: React.FC<LoginModalProps> = ({ onClose }) => {
  const { login, loading, error } = useAuth()
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [loadingProviders, setLoadingProviders] = useState(true)

  useEffect(() => {
    const fetchSupportedProviders = async () => {
      try {
        // Detect environment
        const baseUrl = endpointUrls.sso

        const response = await fetch(`${baseUrl}/providers`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch providers: ${response.status}`)
        }

        const data = await response.json()
        console.log('[LoginModal] Supported providers from backend:', data)

        // Map backend response to UI config
        const allProviders: ProviderConfig[] = [
          {
            id: 'google',
            label: 'Google',
            icon: <i className="fab fa-google"></i>,
            description: 'Sign in with your Google account',
            enabled: data.providers?.includes('google') ?? false
          },
          {
            id: 'github',
            label: 'GitHub',
            icon: <i className="fab fa-github"></i>,
            description: 'Sign in with your GitHub account',
            enabled: true
          },
          {
            id: 'discord',
            label: 'Discord',
            icon: <i className="fab fa-discord"></i>,
            description: 'Sign in with your Discord account',
            enabled: data.providers?.includes('discord') ?? false
          },
          {
            id: 'siwe',
            label: 'Ethereum Wallet',
            icon: <i className="fab fa-ethereum"></i>,
            description: 'Sign in with MetaMask, Coinbase Wallet, or any Ethereum wallet',
            enabled: data.providers?.includes('siwe') ?? false
          },
          {
            id: 'apple',
            label: 'Apple',
            icon: <i className="fab fa-apple"></i>,
            description: 'Sign in with your Apple ID',
            enabled: data.providers?.includes('apple') ?? false
          },
          {
            id: 'coinbase',
            label: 'Coinbase',
            icon: <i className="fas fa-coins"></i>,
            description: 'Sign in with your Coinbase account',
            enabled: data.providers?.includes('coinbase') ?? false
          }
        ]

        // Only show enabled providers
        setProviders(allProviders.filter(p => p.enabled))
        setLoadingProviders(false)
      } catch (err) {
        console.error('[LoginModal] Failed to fetch providers:', err)
        // Fallback to default providers if API fails
        setProviders([
          {
            id: 'google',
            label: 'Google',
            icon: <i className="fab fa-google"></i>,
            description: 'Sign in with your Google account',
            enabled: true
          },
          {
            id: 'github',
            label: 'GitHub',
            icon: <i className="fab fa-github"></i>,
            description: 'Sign in with your GitHub account',
            enabled: true
          },
          {
            id: 'discord',
            label: 'Discord',
            icon: <i className="fab fa-discord"></i>,
            description: 'Sign in with your Discord account',
            enabled: true
          },
          {
            id: 'siwe',
            label: 'Ethereum Wallet',
            icon: <i className="fab fa-ethereum"></i>,
            description: 'Sign in with MetaMask, Coinbase Wallet, or any Ethereum wallet',
            enabled: true
          }
        ])
        setLoadingProviders(false)
      }
    }

    fetchSupportedProviders()
  }, [])

  const handleLogin = async (provider: AuthProvider) => {
    try {
      await login(provider)
      // Modal will auto-close via auth state change
    } catch (err) {
      // Error is handled by context
      console.error('[LoginModal] Login failed:', err)
    }
  }

  return (
    <div
      className="modal d-flex align-items-center justify-content-center login-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered login-modal-dialog"
        role="document"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content d-flex flex-row overflow-hidden login-modal-content">
          {/* Left Section - 40% width */}
          <div className="d-flex flex-column justify-content-center align-items-center position-relative login-modal-left-section">
            {/* Dark blue gradient overlay for better text readability */}
            <div className="position-absolute top-0 start-0 end-0 bottom-0 login-modal-gradient-overlay" />

            {/* Content with higher z-index to appear above overlay */}
            <div className="text-start w-100 position-relative login-modal-content-wrapper">
              <ul className="list-unstyled p-0 m-0">
                <li className="mb-4 d-flex align-items-center">
                  <i className="fas fa-check-circle me-3 flex-shrink-0 login-modal-list-icon"></i>
                  <span className="login-modal-list-text">Save progress</span>
                </li>
                <li className="mb-4 d-flex align-items-center">
                  <i className="fas fa-check-circle me-3 flex-shrink-0 login-modal-list-icon"></i>
                  <span className="login-modal-list-text">Unlock additional features</span>
                </li>
                <li className="mb-4 d-flex align-items-center">
                  <i className="fas fa-check-circle me-3 flex-shrink-0 login-modal-list-icon"></i>
                  <span className="login-modal-list-text">Securely recover ETH address</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Right Section - 60% width */}
          <div className="d-flex flex-column login-modal-right-section">
            <div className="modal-header">
              <h5 className="modal-title">Remix IDE</h5>
              <div className="close ms-auto login-modal-close-btn" data-id="loginModal" onClick={onClose}>
                <i className="fas fa-times"></i>
              </div>
            </div>
            <div className="modal-body">
              <p className="text-muted mb-4">
                Log in or register to unlock our wide range of features
              </p>

              {error && (
                <div className="alert alert-danger" role="alert">
                  <strong>Error:</strong> {error}
                </div>
              )}

              {loadingProviders ? (
                <div className="text-center py-5">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading providers...</span>
                  </div>
                  <p className="text-muted mt-3">Loading authentication methods...</p>
                </div>
              ) : providers.length === 0 ? (
                <div className="alert alert-warning" role="alert">
                  No authentication providers are currently available. Please try again later.
                </div>
              ) : (
                <div className="list-group">
                  {providers.map((provider) => (
                    <button
                      key={provider.id}
                      className={`list-group-item list-group-item-action d-flex align-items-center py-3 login-modal-provider-btn ${loading || !provider.enabled ? '' : ''}`}
                      onClick={() => handleLogin(provider.id)}
                      disabled={loading || !provider.enabled}
                    >
                      <span className="me-3 text-center login-modal-provider-icon">
                        {provider.icon}
                      </span>
                      <div className="flex-grow-1 text-start">
                        <div className="fw-bold">{provider.label}</div>
                        <small className="text-muted">{provider.description}</small>
                      </div>
                      {loading && (
                        <div className="spinner-border spinner-border-sm text-primary" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-4 text-center">
                <small className="text-muted">
                  By signing in, you agree to our{' '}
                  <a href="https://remix.live/termsandconditions" target="_blank" rel="noopener noreferrer">
                    Terms and Conditions
                  </a>
                </small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
