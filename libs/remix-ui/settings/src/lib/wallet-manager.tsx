/**
 * Remix Wallet UI Components
 * 
 * User interface for managing Remix-hosted wallets
 */

import React, { useState, useEffect, useCallback } from 'react'
import { RemixWallet, WalletState } from '@remix-api'
import { FormattedMessage, useIntl } from 'react-intl'

interface WalletManagerProps {
  plugin: any
}

/**
 * Main Wallet Manager component
 * Shows in the Settings panel for authenticated users
 */
export const WalletManager: React.FC<WalletManagerProps> = ({ plugin }) => {
  const intl = useIntl()
  const [state, setState] = useState<WalletState>({
    wallets: [],
    activeWallet: null,
    isUnlocked: false,
    unlockedAddress: null
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showUnlockModal, setShowUnlockModal] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [selectedWallet, setSelectedWallet] = useState<RemixWallet | null>(null)

  // Load wallet state
  const loadState = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Check authentication
      const token = localStorage.getItem('remix_access_token')
      if (!token) {
        setIsAuthenticated(false)
        setState({ wallets: [], activeWallet: null, isUnlocked: false, unlockedAddress: null })
        return
      }
      
      setIsAuthenticated(true)
      const walletState = await plugin.call('remixWallet', 'getState')
      setState(walletState)
    } catch (err: any) {
      console.error('[WalletManager] Error loading state:', err)
      setError(err.message || 'Failed to load wallets')
    } finally {
      setLoading(false)
    }
  }, [plugin])

  useEffect(() => {
    loadState()
    
    // Listen for wallet events
    const handleWalletsUpdated = () => loadState()
    const handleWalletUnlocked = () => loadState()
    const handleWalletLocked = () => loadState()
    const handleAuthChanged = () => loadState()
    
    plugin.on('remixWallet', 'walletsUpdated', handleWalletsUpdated)
    plugin.on('remixWallet', 'walletUnlocked', handleWalletUnlocked)
    plugin.on('remixWallet', 'walletLocked', handleWalletLocked)
    plugin.on('auth', 'authStateChanged', handleAuthChanged)
    
    return () => {
      plugin.off('remixWallet', 'walletsUpdated', handleWalletsUpdated)
      plugin.off('remixWallet', 'walletUnlocked', handleWalletUnlocked)
      plugin.off('remixWallet', 'walletLocked', handleWalletLocked)
      plugin.off('auth', 'authStateChanged', handleAuthChanged)
    }
  }, [plugin, loadState])

  const handleCreateWallet = () => {
    setShowCreateModal(true)
  }

  const handleImportWallet = () => {
    setShowImportModal(true)
  }

  const handleUnlockWallet = (wallet: RemixWallet) => {
    setSelectedWallet(wallet)
    setShowUnlockModal(true)
  }

  const handleLockWallet = async (address: string) => {
    try {
      await plugin.call('remixWallet', 'lockWallet', address)
    } catch (err: any) {
      plugin.call('notification', 'toast', err.message)
    }
  }

  const handleExportSeed = (wallet: RemixWallet) => {
    setSelectedWallet(wallet)
    setShowExportModal(true)
  }

  const handleDeleteWallet = async (wallet: RemixWallet) => {
    const confirmed = await plugin.call('notification', 'modal', {
      id: 'delete-wallet-confirm',
      title: 'Delete Wallet',
      message: `Are you sure you want to delete wallet "${wallet.name || wallet.address}"? This action cannot be undone.`,
      modalType: 'confirm',
      okLabel: 'Delete',
      cancelLabel: 'Cancel'
    })
    
    if (confirmed) {
      try {
        await plugin.call('remixWallet', 'deleteWallet', wallet.address)
        plugin.call('notification', 'toast', 'Wallet deleted successfully')
      } catch (err: any) {
        plugin.call('notification', 'toast', err.message)
      }
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="p-3">
        <div className="alert alert-info">
          <h5 className="alert-heading">
            <i className="fas fa-wallet me-2"></i>
            Remix Wallet
          </h5>
          <p className="mb-2">
            Create a secure wallet to deploy contracts and interact with the blockchain without MetaMask.
          </p>
          <hr />
          <p className="mb-0">
            <strong>Please log in</strong> with Google, GitHub, or Discord to create and manage your wallets.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-3 text-center">
        <i className="fas fa-spinner fa-spin me-2"></i>
        Loading wallets...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-3">
        <div className="alert alert-danger">
          <i className="fas fa-exclamation-triangle me-2"></i>
          {error}
        </div>
        <button className="btn btn-primary" onClick={loadState}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="wallet-manager p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0">
          <i className="fas fa-wallet me-2"></i>
          Remix Wallet
        </h5>
        <div>
          <button 
            className="btn btn-sm btn-outline-secondary me-2" 
            onClick={handleImportWallet}
            title="Import wallet from seed phrase"
          >
            <i className="fas fa-file-import me-1"></i>
            Import
          </button>
          <button 
            className="btn btn-sm btn-primary" 
            onClick={handleCreateWallet}
          >
            <i className="fas fa-plus me-1"></i>
            Create Wallet
          </button>
        </div>
      </div>

      {state.wallets.length === 0 ? (
        <div className="text-center py-4">
          <i className="fas fa-wallet fa-3x text-muted mb-3 d-block"></i>
          <p className="text-muted">No wallets yet</p>
          <button className="btn btn-primary" onClick={handleCreateWallet}>
            Create Your First Wallet
          </button>
        </div>
      ) : (
        <div className="wallet-list">
          {state.wallets.map(wallet => (
            <WalletCard
              key={wallet.address}
              wallet={wallet}
              isUnlocked={state.unlockedAddress?.toLowerCase() === wallet.address.toLowerCase()}
              onUnlock={() => handleUnlockWallet(wallet)}
              onLock={() => handleLockWallet(wallet.address)}
              onExport={() => handleExportSeed(wallet)}
              onDelete={() => handleDeleteWallet(wallet)}
            />
          ))}
        </div>
      )}

      {/* Create Wallet Modal */}
      {showCreateModal && (
        <CreateWalletModal
          plugin={plugin}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {/* Unlock Wallet Modal */}
      {showUnlockModal && selectedWallet && (
        <UnlockWalletModal
          plugin={plugin}
          wallet={selectedWallet}
          onClose={() => {
            setShowUnlockModal(false)
            setSelectedWallet(null)
          }}
        />
      )}

      {/* Export Seed Modal */}
      {showExportModal && selectedWallet && (
        <ExportSeedModal
          plugin={plugin}
          wallet={selectedWallet}
          onClose={() => {
            setShowExportModal(false)
            setSelectedWallet(null)
          }}
        />
      )}

      {/* Import Wallet Modal */}
      {showImportModal && (
        <ImportWalletModal
          plugin={plugin}
          onClose={() => setShowImportModal(false)}
        />
      )}
    </div>
  )
}

/**
 * Individual wallet card component
 */
interface WalletCardProps {
  wallet: RemixWallet
  isUnlocked: boolean
  onUnlock: () => void
  onLock: () => void
  onExport: () => void
  onDelete: () => void
}

const WalletCard: React.FC<WalletCardProps> = ({
  wallet,
  isUnlocked,
  onUnlock,
  onLock,
  onExport,
  onDelete
}) => {
  const formatAddress = (address: string) => {
    return `${address.substring(0, 8)}...${address.substring(address.length - 6)}`
  }

  const copyAddress = () => {
    navigator.clipboard.writeText(wallet.address)
  }

  return (
    <div className={`card mb-2 ${isUnlocked ? 'border-success' : ''}`}>
      <div className="card-body py-2 px-3">
        <div className="d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center">
            <div 
              className={`rounded-circle me-2 d-flex align-items-center justify-content-center ${isUnlocked ? 'bg-success' : 'bg-secondary'}`}
              style={{ width: 32, height: 32 }}
            >
              <i className={`fas ${isUnlocked ? 'fa-unlock' : 'fa-lock'} text-white`} style={{ fontSize: 12 }}></i>
            </div>
            <div>
              <div className="d-flex align-items-center">
                <strong>{wallet.name || 'Unnamed Wallet'}</strong>
                {wallet.isPrimary && (
                  <span className="badge bg-primary ms-2" style={{ fontSize: '0.65rem' }}>Primary</span>
                )}
                {isUnlocked && (
                  <span className="badge bg-success ms-2" style={{ fontSize: '0.65rem' }}>Unlocked</span>
                )}
              </div>
              <div className="text-muted small d-flex align-items-center">
                <code style={{ fontSize: '0.75rem' }}>{formatAddress(wallet.address)}</code>
                <button 
                  className="btn btn-link btn-sm p-0 ms-1" 
                  onClick={copyAddress}
                  title="Copy address"
                >
                  <i className="far fa-copy" style={{ fontSize: 10 }}></i>
                </button>
              </div>
            </div>
          </div>
          
          <div className="btn-group">
            {isUnlocked ? (
              <button className="btn btn-sm btn-warning" onClick={onLock} title="Lock wallet">
                <i className="fas fa-lock"></i>
              </button>
            ) : (
              <button className="btn btn-sm btn-success" onClick={onUnlock} title="Unlock wallet">
                <i className="fas fa-unlock"></i>
              </button>
            )}
            
            {wallet.hasSeedBackup && (
              <button className="btn btn-sm btn-info" onClick={onExport} title="Export seed phrase">
                <i className="fas fa-key"></i>
              </button>
            )}
            
            <button className="btn btn-sm btn-danger" onClick={onDelete} title="Delete wallet">
              <i className="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Create Wallet Modal
 */
interface CreateWalletModalProps {
  plugin: any
  onClose: () => void
}

const CreateWalletModal: React.FC<CreateWalletModalProps> = ({ plugin, onClose }) => {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ address: string; mnemonic: string } | null>(null)
  const [mnemonicSaved, setMnemonicSaved] = useState(false)

  const handleCreate = async () => {
    setError(null)
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    
    setLoading(true)
    
    try {
      const walletResult = await plugin.call('remixWallet', 'createWallet', password, name || undefined)
      setResult(walletResult)
    } catch (err: any) {
      setError(err.message || 'Failed to create wallet')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (result && !mnemonicSaved) {
      plugin.call('notification', 'toast', 'Please save your recovery phrase before closing!')
      return
    }
    onClose()
  }

  const copyMnemonic = () => {
    if (result) {
      navigator.clipboard.writeText(result.mnemonic)
      plugin.call('notification', 'toast', 'Recovery phrase copied!')
    }
  }

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="fas fa-plus-circle me-2"></i>
              Create New Wallet
            </h5>
            <button className="btn-close" onClick={handleClose}></button>
          </div>
          
          <div className="modal-body">
            {!result ? (
              <>
                <div className="mb-3">
                  <label className="form-label">Wallet Name (optional)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Wallet"
                  />
                </div>
                
                <div className="mb-3">
                  <label className="form-label">Password *</label>
                  <input
                    type="password"
                    className="form-control"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                  <small className="text-muted">
                    This password encrypts your wallet. You'll need it to unlock and use your wallet.
                  </small>
                </div>
                
                <div className="mb-3">
                  <label className="form-label">Confirm Password *</label>
                  <input
                    type="password"
                    className="form-control"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                  />
                </div>
                
                {error && (
                  <div className="alert alert-danger py-2">
                    <i className="fas fa-exclamation-triangle me-2"></i>
                    {error}
                  </div>
                )}
                
                <div className="alert alert-warning py-2">
                  <i className="fas fa-exclamation-triangle me-2"></i>
                  <strong>Important:</strong> If you forget your password, you can only recover your wallet using the recovery phrase we'll show you next.
                </div>
              </>
            ) : (
              <>
                <div className="alert alert-success">
                  <i className="fas fa-check-circle me-2"></i>
                  Wallet created successfully!
                </div>
                
                <div className="mb-3">
                  <label className="form-label">Your Wallet Address</label>
                  <div className="input-group">
                    <input
                      type="text"
                      className="form-control font-monospace"
                      value={result.address}
                      readOnly
                    />
                    <button 
                      className="btn btn-outline-secondary"
                      onClick={() => navigator.clipboard.writeText(result.address)}
                    >
                      <i className="far fa-copy"></i>
                    </button>
                  </div>
                </div>
                
                <div className="alert alert-danger">
                  <h6 className="alert-heading">
                    <i className="fas fa-exclamation-triangle me-2"></i>
                    Save Your Recovery Phrase!
                  </h6>
                  <p className="mb-2">
                    This is the <strong>only time</strong> you'll see this phrase. Write it down and store it safely.
                  </p>
                  <div className="bg-light p-3 rounded border mb-2">
                    <code className="text-dark" style={{ wordBreak: 'break-word' }}>
                      {result.mnemonic}
                    </code>
                  </div>
                  <button className="btn btn-sm btn-outline-dark" onClick={copyMnemonic}>
                    <i className="far fa-copy me-1"></i>
                    Copy to Clipboard
                  </button>
                </div>
                
                <div className="form-check">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="mnemonicSaved"
                    checked={mnemonicSaved}
                    onChange={(e) => setMnemonicSaved(e.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="mnemonicSaved">
                    I have saved my recovery phrase in a safe place
                  </label>
                </div>
              </>
            )}
          </div>
          
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={handleClose}>
              {result ? 'Close' : 'Cancel'}
            </button>
            {!result && (
              <button 
                className="btn btn-primary" 
                onClick={handleCreate}
                disabled={loading || !password || !confirmPassword}
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin me-2"></i>
                    Creating...
                  </>
                ) : (
                  <>
                    <i className="fas fa-plus me-2"></i>
                    Create Wallet
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Unlock Wallet Modal
 */
interface UnlockWalletModalProps {
  plugin: any
  wallet: RemixWallet
  onClose: () => void
}

const UnlockWalletModal: React.FC<UnlockWalletModalProps> = ({ plugin, wallet, onClose }) => {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUnlock = async () => {
    setError(null)
    setLoading(true)
    
    try {
      await plugin.call('remixWallet', 'unlockWallet', wallet.address, password)
      plugin.call('notification', 'toast', 'Wallet unlocked!')
      onClose()
    } catch (err: any) {
      setError(err.message || 'Invalid password')
    } finally {
      setLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && password) {
      handleUnlock()
    }
  }

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered modal-sm">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="fas fa-unlock me-2"></i>
              Unlock Wallet
            </h5>
            <button className="btn-close" onClick={onClose}></button>
          </div>
          
          <div className="modal-body">
            <p className="text-muted small mb-3">
              {wallet.name || wallet.address.substring(0, 12) + '...'}
            </p>
            
            <div className="mb-3">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter your wallet password"
                autoFocus
              />
            </div>
            
            {error && (
              <div className="alert alert-danger py-2">
                <i className="fas fa-exclamation-triangle me-2"></i>
                {error}
              </div>
            )}
          </div>
          
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button 
              className="btn btn-success" 
              onClick={handleUnlock}
              disabled={loading || !password}
            >
              {loading ? (
                <>
                  <i className="fas fa-spinner fa-spin me-2"></i>
                  Unlocking...
                </>
              ) : (
                <>
                  <i className="fas fa-unlock me-2"></i>
                  Unlock
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Export Seed Phrase Modal
 */
interface ExportSeedModalProps {
  plugin: any
  wallet: RemixWallet
  onClose: () => void
}

const ExportSeedModal: React.FC<ExportSeedModalProps> = ({ plugin, wallet, onClose }) => {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [seedPhrase, setSeedPhrase] = useState<string | null>(null)

  const handleExport = async () => {
    setError(null)
    setLoading(true)
    
    try {
      const seed = await plugin.call('remixWallet', 'exportSeedPhrase', wallet.address, password)
      setSeedPhrase(seed)
    } catch (err: any) {
      setError(err.message || 'Invalid password')
    } finally {
      setLoading(false)
    }
  }

  const copySeed = () => {
    if (seedPhrase) {
      navigator.clipboard.writeText(seedPhrase)
      plugin.call('notification', 'toast', 'Seed phrase copied!')
    }
  }

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="fas fa-key me-2"></i>
              Export Recovery Phrase
            </h5>
            <button className="btn-close" onClick={onClose}></button>
          </div>
          
          <div className="modal-body">
            {!seedPhrase ? (
              <>
                <div className="alert alert-warning py-2">
                  <i className="fas fa-exclamation-triangle me-2"></i>
                  <strong>Warning:</strong> Never share your recovery phrase with anyone!
                </div>
                
                <p className="text-muted small mb-3">
                  Wallet: {wallet.name || wallet.address.substring(0, 12) + '...'}
                </p>
                
                <div className="mb-3">
                  <label className="form-label">Enter Password to Export</label>
                  <input
                    type="password"
                    className="form-control"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your wallet password"
                  />
                </div>
                
                {error && (
                  <div className="alert alert-danger py-2">
                    <i className="fas fa-exclamation-triangle me-2"></i>
                    {error}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="alert alert-danger">
                  <h6 className="alert-heading">
                    <i className="fas fa-shield-alt me-2"></i>
                    Your Recovery Phrase
                  </h6>
                  <p className="mb-2 small">
                    Anyone with this phrase can access your wallet. Keep it secret!
                  </p>
                </div>
                
                <div className="bg-light p-3 rounded border mb-3">
                  <code className="text-dark" style={{ wordBreak: 'break-word' }}>
                    {seedPhrase}
                  </code>
                </div>
                
                <button className="btn btn-outline-secondary" onClick={copySeed}>
                  <i className="far fa-copy me-1"></i>
                  Copy to Clipboard
                </button>
              </>
            )}
          </div>
          
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Close</button>
            {!seedPhrase && (
              <button 
                className="btn btn-warning" 
                onClick={handleExport}
                disabled={loading || !password}
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin me-2"></i>
                    Decrypting...
                  </>
                ) : (
                  <>
                    <i className="fas fa-key me-2"></i>
                    Show Phrase
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Import Wallet Modal
 */
interface ImportWalletModalProps {
  plugin: any
  onClose: () => void
}

const ImportWalletModal: React.FC<ImportWalletModalProps> = ({ plugin, onClose }) => {
  const [mnemonic, setMnemonic] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleImport = async () => {
    setError(null)
    
    if (!mnemonic.trim()) {
      setError('Please enter your recovery phrase')
      return
    }
    
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    
    setLoading(true)
    
    try {
      await plugin.call('remixWallet', 'importWallet', mnemonic.trim(), password, name || 'Imported Wallet')
      setSuccess(true)
      plugin.call('notification', 'toast', 'Wallet imported successfully!')
      setTimeout(onClose, 1500)
    } catch (err: any) {
      setError(err.message || 'Failed to import wallet')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="fas fa-file-import me-2"></i>
              Import Wallet
            </h5>
            <button className="btn-close" onClick={onClose}></button>
          </div>
          
          <div className="modal-body">
            {success ? (
              <div className="alert alert-success text-center">
                <i className="fas fa-check-circle fa-2x mb-2 d-block"></i>
                Wallet imported successfully!
              </div>
            ) : (
              <>
                <div className="mb-3">
                  <label className="form-label">Recovery Phrase</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={mnemonic}
                    onChange={(e) => setMnemonic(e.target.value)}
                    placeholder="Enter your 12-word recovery phrase..."
                  />
                  <small className="text-muted">
                    Enter the 12-word seed phrase, separated by spaces
                  </small>
                </div>
                
                <div className="mb-3">
                  <label className="form-label">Wallet Name (optional)</label>
                  <input
                    type="text"
                    className="form-control"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Imported Wallet"
                  />
                </div>
                
                <div className="mb-3">
                  <label className="form-label">New Password *</label>
                  <input
                    type="password"
                    className="form-control"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                  />
                  <small className="text-muted">
                    Create a new password to encrypt this wallet
                  </small>
                </div>
                
                <div className="mb-3">
                  <label className="form-label">Confirm Password *</label>
                  <input
                    type="password"
                    className="form-control"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                  />
                </div>
                
                {error && (
                  <div className="alert alert-danger py-2">
                    <i className="fas fa-exclamation-triangle me-2"></i>
                    {error}
                  </div>
                )}
              </>
            )}
          </div>
          
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            {!success && (
              <button 
                className="btn btn-primary" 
                onClick={handleImport}
                disabled={loading || !mnemonic || !password || !confirmPassword}
              >
                {loading ? (
                  <>
                    <i className="fas fa-spinner fa-spin me-2"></i>
                    Importing...
                  </>
                ) : (
                  <>
                    <i className="fas fa-file-import me-2"></i>
                    Import Wallet
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default WalletManager
