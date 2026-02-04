import React, { useState, useEffect, useCallback, useRef } from 'react'
import { ProfileUsername, UsernameValidation, PublicProfile } from '@remix-api'

export interface ProfileManagerProps {
  /** API function to get current username */
  getUsername: () => Promise<ProfileUsername>
  /** API function to check username availability */
  checkUsernameAvailability: (username: string) => Promise<UsernameValidation>
  /** API function to set username */
  setUsername: (username: string) => Promise<{ success: boolean; username?: string; error?: string; suggestion?: string }>
  /** API function to set display name */
  setDisplayName: (displayName: string) => Promise<{ success: boolean; displayName?: string; error?: string }>
  /** Whether to show in compact mode (for dropdowns/bottom bar) */
  compact?: boolean
  /** Whether username editing is enabled */
  allowUsernameEdit?: boolean
  /** Whether display name editing is enabled */
  allowDisplayNameEdit?: boolean
  /** Callback when profile is updated */
  onProfileUpdate?: (profile: ProfileUsername) => void
  /** Optional class name for styling */
  className?: string
  /** Profile URL base (e.g., 'remix.ethereum.org') for copy functionality */
  profileUrlBase?: string
}

/**
 * Profile management component for username and display name
 * Supports both full edit mode and compact display mode
 */
export const ProfileManager: React.FC<ProfileManagerProps> = ({
  getUsername,
  checkUsernameAvailability,
  setUsername,
  setDisplayName,
  compact = false,
  allowUsernameEdit = true,
  allowDisplayNameEdit = true,
  onProfileUpdate,
  className = '',
  profileUrlBase = 'remix.ethereum.org'
}) => {
  // Profile state
  const [profile, setProfile] = useState<ProfileUsername>({ username: null, displayName: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Username editing state
  const [editingUsername, setEditingUsername] = useState(false)
  const [usernameInput, setUsernameInput] = useState('')
  const [usernameValidation, setUsernameValidation] = useState<UsernameValidation | null>(null)
  const [checkingUsername, setCheckingUsername] = useState(false)
  const [savingUsername, setSavingUsername] = useState(false)

  // Display name editing state
  const [editingDisplayName, setEditingDisplayName] = useState(false)
  const [displayNameInput, setDisplayNameInput] = useState('')
  const [savingDisplayName, setSavingDisplayName] = useState(false)
  const [displayNameError, setDisplayNameError] = useState<string | null>(null)

  // Debounce timer for username check
  const usernameCheckTimer = useRef<NodeJS.Timeout | null>(null)

  // Copy state
  const [copied, setCopied] = useState(false)

  // Load profile on mount
  useEffect(() => {
    loadProfile()
  }, [])

  const loadProfile = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getUsername()
      setProfile(data)
    } catch (err) {
      setError('Failed to load profile')
      console.error('Failed to load profile:', err)
    } finally {
      setLoading(false)
    }
  }

  // Debounced username availability check
  const checkUsername = useCallback(async (username: string) => {
    if (username.length < 3) {
      setUsernameValidation({ valid: false, available: false, error: 'Username must be at least 3 characters' })
      return
    }

    setCheckingUsername(true)
    try {
      const validation = await checkUsernameAvailability(username)
      setUsernameValidation(validation)
    } catch (err) {
      setUsernameValidation({ valid: false, available: false, error: 'Failed to check availability' })
    } finally {
      setCheckingUsername(false)
    }
  }, [checkUsernameAvailability])

  // Handle username input change with debounce
  const handleUsernameChange = (value: string) => {
    // Sanitize input: lowercase, only allowed characters
    const sanitized = value.toLowerCase().replace(/[^a-z0-9_]/g, '')
    setUsernameInput(sanitized)
    setUsernameValidation(null)

    // Clear previous timer
    if (usernameCheckTimer.current) {
      clearTimeout(usernameCheckTimer.current)
    }

    // Set new debounced check
    if (sanitized.length >= 3) {
      usernameCheckTimer.current = setTimeout(() => {
        checkUsername(sanitized)
      }, 500)
    }
  }

  // Save username
  const handleSaveUsername = async () => {
    if (!usernameValidation?.valid || savingUsername) return

    setSavingUsername(true)
    try {
      const result = await setUsername(usernameInput)
      if (result.success && result.username) {
        const newProfile = { ...profile, username: result.username }
        setProfile(newProfile)
        setEditingUsername(false)
        onProfileUpdate?.(newProfile)
      } else {
        setUsernameValidation({
          valid: false,
          available: false,
          error: result.error || 'Failed to set username',
          suggestion: result.suggestion
        })
      }
    } catch (err) {
      setUsernameValidation({ valid: false, available: false, error: 'Failed to save username' })
    } finally {
      setSavingUsername(false)
    }
  }

  // Save display name
  const handleSaveDisplayName = async () => {
    if (savingDisplayName) return

    setSavingDisplayName(true)
    setDisplayNameError(null)
    try {
      const result = await setDisplayName(displayNameInput)
      if (result.success && result.displayName !== undefined) {
        const newProfile = { ...profile, displayName: result.displayName }
        setProfile(newProfile)
        setEditingDisplayName(false)
        onProfileUpdate?.(newProfile)
      } else {
        setDisplayNameError(result.error || 'Failed to set display name')
      }
    } catch (err) {
      setDisplayNameError('Failed to save display name')
    } finally {
      setSavingDisplayName(false)
    }
  }

  // Start editing username
  const startEditingUsername = () => {
    setUsernameInput(profile.username || '')
    setUsernameValidation(null)
    setEditingUsername(true)
  }

  // Start editing display name
  const startEditingDisplayName = () => {
    setDisplayNameInput(profile.displayName || '')
    setDisplayNameError(null)
    setEditingDisplayName(true)
  }

  // Cancel editing
  const cancelEditingUsername = () => {
    setEditingUsername(false)
    setUsernameInput('')
    setUsernameValidation(null)
  }

  const cancelEditingDisplayName = () => {
    setEditingDisplayName(false)
    setDisplayNameInput('')
    setDisplayNameError(null)
  }

  // Copy profile URL to clipboard
  const copyProfileUrl = async () => {
    if (!profile.username) return
    
    const url = `${profileUrlBase}/${profile.username}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // Use suggestion
  const useSuggestion = (suggestion: string) => {
    setUsernameInput(suggestion)
    checkUsername(suggestion)
  }

  // Loading state
  if (loading) {
    return (
      <div className={`profile-manager ${className}`}>
        <div className="d-flex align-items-center gap-2 text-muted">
          <div className="spinner-border spinner-border-sm" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <span>Loading profile...</span>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={`profile-manager ${className}`}>
        <div className="alert alert-danger mb-0 py-2">
          <i className="fas fa-exclamation-circle me-2"></i>
          {error}
          <button className="btn btn-sm btn-link p-0 ms-2" onClick={loadProfile}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Compact mode - just show username with copy button
  if (compact) {
    return (
      <div className={`profile-manager profile-manager-compact ${className}`}>
        <div className="d-flex align-items-center gap-2">
          {profile.username ? (
            <>
              <span className="text-muted small">@{profile.username}</span>
              <button
                className="btn btn-sm btn-link p-0"
                onClick={copyProfileUrl}
                title={copied ? 'Copied!' : 'Copy profile URL'}
              >
                <i className={`fas ${copied ? 'fa-check text-success' : 'fa-copy'}`}></i>
              </button>
            </>
          ) : (
            allowUsernameEdit && (
              <button
                className="btn btn-sm btn-outline-primary"
                onClick={startEditingUsername}
              >
                Set username
              </button>
            )
          )}
        </div>

        {/* Inline username editor for compact mode */}
        {editingUsername && (
          <div className="mt-2">
            <div className="input-group input-group-sm">
              <span className="input-group-text">@</span>
              <input
                type="text"
                className={`form-control ${usernameValidation ? (usernameValidation.valid ? 'is-valid' : 'is-invalid') : ''}`}
                value={usernameInput}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="username"
                maxLength={30}
                autoFocus
              />
              <button
                className="btn btn-success"
                onClick={handleSaveUsername}
                disabled={!usernameValidation?.valid || savingUsername}
              >
                {savingUsername ? <span className="spinner-border spinner-border-sm"></span> : <i className="fas fa-check"></i>}
              </button>
              <button className="btn btn-secondary" onClick={cancelEditingUsername}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            {usernameValidation && !usernameValidation.valid && (
              <div className="text-danger small mt-1">
                {usernameValidation.error}
                {usernameValidation.suggestion && (
                  <button
                    className="btn btn-link btn-sm p-0 ms-1"
                    onClick={() => useSuggestion(usernameValidation.suggestion!)}
                  >
                    Try "{usernameValidation.suggestion}"
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Full mode
  return (
    <div className={`profile-manager ${className}`}>
      {/* Display Name */}
      <div className="mb-3">
        <label className="form-label small text-muted mb-1">Display Name</label>
        {editingDisplayName ? (
          <div>
            <div className="input-group">
              <input
                type="text"
                className={`form-control ${displayNameError ? 'is-invalid' : ''}`}
                value={displayNameInput}
                onChange={(e) => setDisplayNameInput(e.target.value)}
                placeholder="Your display name"
                maxLength={100}
                autoFocus
              />
              <button
                className="btn btn-success"
                onClick={handleSaveDisplayName}
                disabled={savingDisplayName}
              >
                {savingDisplayName ? (
                  <span className="spinner-border spinner-border-sm"></span>
                ) : (
                  <i className="fas fa-check"></i>
                )}
              </button>
              <button className="btn btn-secondary" onClick={cancelEditingDisplayName}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            {displayNameError && (
              <div className="text-danger small mt-1">{displayNameError}</div>
            )}
          </div>
        ) : (
          <div className="d-flex align-items-center gap-2">
            <span className={profile.displayName ? '' : 'text-muted'}>
              {profile.displayName || 'Not set'}
            </span>
            {allowDisplayNameEdit && (
              <button
                className="btn btn-sm btn-link p-0"
                onClick={startEditingDisplayName}
                title="Edit display name"
              >
                <i className="fas fa-pencil-alt"></i>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Username */}
      <div className="mb-3">
        <label className="form-label small text-muted mb-1">Username</label>
        {editingUsername ? (
          <div>
            <div className="input-group">
              <span className="input-group-text">@</span>
              <input
                type="text"
                className={`form-control ${usernameValidation ? (usernameValidation.valid ? 'is-valid' : 'is-invalid') : ''}`}
                value={usernameInput}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="username"
                maxLength={30}
                autoFocus
              />
              {checkingUsername && (
                <span className="input-group-text">
                  <span className="spinner-border spinner-border-sm"></span>
                </span>
              )}
              <button
                className="btn btn-success"
                onClick={handleSaveUsername}
                disabled={!usernameValidation?.valid || savingUsername}
              >
                {savingUsername ? (
                  <span className="spinner-border spinner-border-sm"></span>
                ) : (
                  <i className="fas fa-check"></i>
                )}
              </button>
              <button className="btn btn-secondary" onClick={cancelEditingUsername}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            {usernameValidation && (
              <div className={`small mt-1 ${usernameValidation.valid ? 'text-success' : 'text-danger'}`}>
                {usernameValidation.valid ? (
                  <><i className="fas fa-check me-1"></i>Username is available</>
                ) : (
                  <>
                    {usernameValidation.error}
                    {usernameValidation.suggestion && (
                      <button
                        className="btn btn-link btn-sm p-0 ms-1"
                        onClick={() => useSuggestion(usernameValidation.suggestion!)}
                      >
                        Try "{usernameValidation.suggestion}"
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
            <div className="text-muted small mt-1">
              3-30 characters, lowercase letters, numbers, and underscores only
            </div>
          </div>
        ) : (
          <div className="d-flex align-items-center gap-2">
            {profile.username ? (
              <>
                <span>@{profile.username}</span>
                <button
                  className="btn btn-sm btn-link p-0"
                  onClick={copyProfileUrl}
                  title={copied ? 'Copied!' : 'Copy profile URL'}
                >
                  <i className={`fas ${copied ? 'fa-check text-success' : 'fa-copy'}`}></i>
                </button>
                {allowUsernameEdit && (
                  <button
                    className="btn btn-sm btn-link p-0"
                    onClick={startEditingUsername}
                    title="Edit username"
                  >
                    <i className="fas fa-pencil-alt"></i>
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="text-muted">Not set</span>
                {allowUsernameEdit && (
                  <button
                    className="btn btn-sm btn-outline-primary"
                    onClick={startEditingUsername}
                  >
                    Set username
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Profile URL */}
      {profile.username && (
        <div className="mb-0">
          <label className="form-label small text-muted mb-1">Public Profile URL</label>
          <div className="d-flex align-items-center gap-2">
            <code className="small">{profileUrlBase}/{profile.username}</code>
            <button
              className="btn btn-sm btn-link p-0"
              onClick={copyProfileUrl}
              title={copied ? 'Copied!' : 'Copy URL'}
            >
              <i className={`fas ${copied ? 'fa-check text-success' : 'fa-copy'}`}></i>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProfileManager
