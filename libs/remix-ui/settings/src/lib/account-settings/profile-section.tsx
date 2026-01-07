import React, { useState, useEffect } from 'react'

interface UserProfile {
  username: string
  email: string
  avatar_url: string
  avatar_file?: File
}

interface ProfileSectionProps {
  plugin: any
}

export const ProfileSection: React.FC<ProfileSectionProps> = ({ plugin }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editedProfile, setEditedProfile] = useState<UserProfile | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [loginProvider, setLoginProvider] = useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const loadProfile = async () => {
    try {
      setLoading(true)
      setError(null)

      // Get user data from auth plugin
      try {
        const user = await plugin.call('auth', 'getUser')

        if (user) {
          // Store the login provider
          setLoginProvider(user.provider || null)

          // Map AuthUser to UserProfile
          const profileData: UserProfile = {
            username: user.name || '',
            email: user.email || '',
            avatar_url: user.picture || ''
          }
          setProfile(profileData)
          setEditedProfile(profileData)
        }
      } catch (authErr) {
        console.log('Auth plugin not available or user not logged in')
      }
    } catch (err: any) {
      console.error('Error loading profile:', err)
      setError(err.message || 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfile()

    const onAuthStateChanged = async (_payload: any) => {
      await loadProfile()
    }

    try {
      plugin.on('auth', 'authStateChanged', onAuthStateChanged)
    } catch (e) {
      // noop
    }

    return () => {
      try {
        plugin.off('auth', 'authStateChanged')
      } catch (e) {
        // ignore
      }
    }
  }, [])

  const handleFieldChange = (field: keyof UserProfile, value: string) => {
    setEditedProfile(prev => prev ? { ...prev, [field]: value } : null)
    setHasChanges(true)
  }

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select a valid image file')
        return
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Image size should be less than 5MB')
        return
      }

      // Create preview URL
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string)
        setEditedProfile(prev => prev ? { ...prev, avatar_file: file } : null)
        setHasChanges(true)
        setError(null)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleCancel = () => {
    setEditedProfile(profile)
    setAvatarPreview(null)
    setError(null)
    setHasChanges(false)
  }

  const handleSave = async () => {
    if (!editedProfile) return

    try {
      setSaving(true)
      setError(null)

      // TODO: Implement profile update API when backend is ready
      // For now, just update local state
      console.log('Saving profile:', editedProfile)

      if (editedProfile.avatar_file) {
        console.log('Avatar file to upload:', editedProfile.avatar_file.name, editedProfile.avatar_file.size)
        // TODO: Upload the avatar file to server and get URL back
        // const formData = new FormData()
        // formData.append('avatar', editedProfile.avatar_file)
        // const uploadResponse = await fetch('/api/upload-avatar', { method: 'POST', body: formData })
        // const { avatarUrl } = await uploadResponse.json()
        // editedProfile.avatar_url = avatarUrl
      }

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500))

      // If we have avatar preview, keep it as the avatar_url for now
      if (avatarPreview && editedProfile.avatar_file) {
        editedProfile.avatar_url = avatarPreview
      }

      setProfile(editedProfile)
      setAvatarPreview(null)
      setHasChanges(false)

      // Show success message (optional)
      console.log('Profile updated successfully (local only - API not implemented yet)')
    } catch (err: any) {
      console.error('Error updating profile:', err)
      setError(err.message || 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="p-3">
        <div className="spinner-border spinner-border-sm" role="status">
          <span className="sr-only">Loading...</span>
        </div>
        <span className="ms-2">Loading profile...</span>
      </div>
    )
  }

  // Use profile data or fallback to editedProfile or empty values
  const displayProfile = profile || editedProfile || { username: '', email: '', avatar_url: '' }

  // Only allow editing if logged in with email
  const isEditable = loginProvider === 'email'

  return (
    <div>
      {error && (
        <div className="alert alert-danger p-2 mb-3" role="alert">
          <i className="fas fa-exclamation-circle me-2"></i>
          {error}
        </div>
      )}

      {!isEditable && loginProvider && (
        <div className="alert alert-info p-2 mb-3" role="alert">
          <i className="fas fa-info-circle me-2"></i>
          Profile editing is only available for email login. You are currently logged in with {loginProvider}.
        </div>
      )}

      <div className="bg-light rounded p-3">
        <div className="row">
          <div className="col-md-3 mb-3 mb-md-0 text-center">
            <div className="mb-2 position-relative d-inline-block">
              <img
                src={avatarPreview || editedProfile?.avatar_url || displayProfile.avatar_url || 'https://via.placeholder.com/100'}
                alt="Profile Avatar"
                className="rounded-circle"
                style={{ width: '100px', height: '100px', objectFit: 'cover' }}
                onError={(e) => {
                  const target = e.target as HTMLImageElement
                  target.src = 'https://via.placeholder.com/100'
                }}
              />
            </div>
            <div>
              <button
                type="button"
                className="btn btn-sm btn-secondary d-flex align-items-center justify-content-center mx-auto"
                onClick={handleUploadClick}
                disabled={!isEditable}
                style={{ gap: '0.25rem' }}
              >
                <i className="fas fa-upload"></i>
                <span>Upload</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                disabled={!isEditable}
                style={{ display: 'none' }}
              />
            </div>
          </div>

          <div className="col-md-9">
            <div className="mb-3">
              <label className="form-label small font-weight-bold mb-1">Username</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={editedProfile?.username || ''}
                onChange={(e) => handleFieldChange('username', e.target.value)}
                placeholder="Enter username"
                disabled={!isEditable}
                readOnly={!isEditable}
              />
            </div>

            <div className="mb-3">
              <label className="form-label small font-weight-bold mb-1">Email</label>
              <input
                type="email"
                className="form-control form-control-sm"
                value={editedProfile?.email || ''}
                onChange={(e) => handleFieldChange('email', e.target.value)}
                placeholder="Enter email"
                disabled={!isEditable}
                readOnly={!isEditable}
              />
            </div>

            {hasChanges && (
              <div className="d-flex gap-2">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                      Saving...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-save me-1"></i>
                      Save
                    </>
                  )}
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={handleCancel}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
