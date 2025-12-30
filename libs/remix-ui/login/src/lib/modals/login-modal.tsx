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
  const { login, loading, error, dispatch } = useAuth()
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [loadingProviders, setLoadingProviders] = useState(true)
  const [showEmailInput, setShowEmailInput] = useState(false)
  const [emailValue, setEmailValue] = useState('')

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
            label: 'Connect Ethereum Wallet',
            icon: <i className="fab fa-ethereum"></i>,
            description: 'Sign in with MetaMask, Coinbase Wallet, or any Ethereum wallet',
            enabled: data.providers?.includes('siwe') ?? false
          },
          {
            id: 'email',
            label: 'Email',
            icon: <i className="fas fa-envelope"></i>,
            description: 'Sign in with your email address',
            enabled: true
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
          },
          {
            id: 'email',
            label: 'Email',
            icon: <i className="fas fa-envelope"></i>,
            description: 'Sign in with your email address',
            enabled: true
          }
        ])
        setLoadingProviders(false)
      }
    }

    fetchSupportedProviders()

    // Cleanup function to reset state when modal unmounts
    return () => {
      setShowEmailInput(false)
      setEmailValue('')
      dispatch({ type: 'CLEAR_ERROR' })
    }
  }, [dispatch])

  const handleLogin = async (provider: AuthProvider) => {
    if (provider === 'email') {
      setShowEmailInput(true)
      return
    }

    try {
      await login(provider)
      // Modal will auto-close via auth state change
    } catch (err) {
      // Error is handled by context
      console.error('[LoginModal] Login failed:', err)
    }
  }

  const handleEmailSubmit = async () => {
    if (!emailValue.trim()) {
      return
    }

    try {
      await login('email')
      // Modal will auto-close via auth state change
    } catch (err) {
      // Error is handled by context
      console.error('[LoginModal] Email login failed:', err)
    }
  }

  const handleBackToProviders = () => {
    setShowEmailInput(false)
    setEmailValue('')
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
            <div className="modal-header border-0 flex-column align-items-start">
              <div className="d-flex w-100 align-items-center mb-2">
                <h5 className="modal-title mb-0">Remix IDE</h5>
                <div className="close ms-auto login-modal-close-btn fs-5" data-id="loginModal" onClick={onClose}>
                  <i className="fas fa-times text-dark"></i>
                </div>
              </div>
              <p className="text-muted mb-0 fs-small-medium">
                Log in or register to unlock our wide range of features
              </p>
            </div>
            <div className="modal-body flex-grow-1">

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
              ) : showEmailInput ? (
                /* Email Input View */
                <div className="d-flex flex-column h-100">
                  {/* Error container with fixed height to prevent layout shift */}
                  <div className="login-modal-error-container">
                    {error && (
                      <div className="alert alert-danger mb-0" role="alert">
                        <strong>Error:</strong> {error}
                      </div>
                    )}
                  </div>

                  <div className="mb-3">
                    <label htmlFor="email-input" className="form-label text-muted fs-small-medium">
                      Email address
                    </label>
                    <input
                      id="email-input"
                      type="email"
                      className="form-control"
                      placeholder="Enter your email"
                      value={emailValue}
                      onChange={(e) => setEmailValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()}
                      autoFocus
                    />
                  </div>

                  <button
                    className="btn btn-primary w-100 d-flex align-items-center justify-content-center py-2 mb-3"
                    onClick={handleEmailSubmit}
                    disabled={loading || !emailValue.trim()}
                  >
                    <span className="me-1">
                      <i className="fas fa-envelope"></i>
                    </span>
                    <span className="fw-medium fs-medium">Continue with Email</span>
                    {loading && (
                      <div className="spinner-border spinner-border-sm text-white ms-2" role="status">
                        <span className="visually-hidden">Loading...</span>
                      </div>
                    )}
                  </button>

                  <div className="text-center">
                    <button
                      className="btn btn-link text-decoration-none p-0 fs-small-medium"
                      onClick={handleBackToProviders}
                    >
                      Choose another method
                    </button>
                  </div>
                </div>
              ) : (
                /* Provider Buttons View */
                <div>
                  {error && (
                    <div className="alert alert-danger" role="alert">
                      <strong>Error:</strong> {error}
                    </div>
                  )}

                  {/* Ethereum Wallet - Primary button at top */}
                  {providers.filter(p => p.id === 'siwe').map((provider) => (
                    <button
                      key={provider.id}
                      className="btn btn-primary w-100 d-flex align-items-center justify-content-center py-2 mb-3"
                      onClick={() => handleLogin(provider.id)}
                      disabled={loading || !provider.enabled}
                    >
                      <span className="me-1 login-modal-provider-icon fs-medium">
                        {provider.icon}
                      </span>
                      <span className="fw-medium fs-medium">{provider.label}</span>
                      {loading && (
                        <div className="spinner-border spinner-border-sm text-white ms-2" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                      )}
                    </button>
                  ))}

                  {/* Divider with "or" text */}
                  <div className="d-flex align-items-center my-4">
                    <hr className="flex-grow-1" />
                    <span className="px-3 text-muted">or</span>
                    <hr className="flex-grow-1" />
                  </div>

                  {/* Other providers - Light buttons */}
                  <div className="d-flex flex-column gap-2">
                    {providers.filter(p => p.id !== 'siwe').map((provider) => (
                      <button
                        key={provider.id}
                        className="btn btn-light border-0 w-100 d-flex align-items-center justify-content-center py-2 no-hover-effect"
                        onClick={() => handleLogin(provider.id)}
                        disabled={loading || !provider.enabled}
                      >
                        <span className="me-2 login-modal-provider-icon fs-medium">
                          {provider.icon}
                        </span>
                        <span className="fs-medium">Continue with {provider.label}</span>
                        {loading && (
                          <div className="spinner-border spinner-border-sm text-primary ms-2" role="status">
                            <span className="visually-hidden">Loading...</span>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Terms and Conditions Bar */}
            <div className="login-modal-terms-bar">
              <p className="text-muted mb-0 fs-small">
                By continuing, you agree to our{' '}
                <a href="https://remix.live/termsandconditions" target="_blank" rel="noopener noreferrer">
                  Terms and Conditions
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
