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
        <div className="animate-spin inline-block w-4 h-4 border-[3px] border-current border-t-transparent text-blue-600 rounded-full" role="status">
          <span className="sr-only">Loading...</span>
        </div>
        <span className="ml-2">Loading profile...</span>
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
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 px-3 py-2 mb-3 rounded-md" role="alert">
          <i className="fas fa-exclamation-circle mr-2"></i>
          {error}
        </div>
      )}

      {!isEditable && loginProvider && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 px-3 py-2 mb-3 rounded-md" role="alert">
          <i className="fas fa-info-circle mr-2"></i>
          Profile editing is only available for email login. You are currently logged in with {loginProvider}.
        </div>
      )}

      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-3 text-center">
            <div className="mb-2 relative inline-block">
              {(avatarPreview || editedProfile?.avatar_url || displayProfile.avatar_url) ? (
                <img
                  src={avatarPreview || editedProfile?.avatar_url || displayProfile.avatar_url}
                  alt="Profile Avatar"
                  className="rounded-full"
                  style={{ width: '100px', height: '100px', objectFit: 'cover' }}
                  onError={(e) => {

                  }}
                />
              ) : (
                <div
                  className="rounded-full flex items-center justify-center bg-gray-500 text-white"
                  style={{ width: '100px', height: '100px', fontSize: '0.7rem' }}
                  title="Avatar not available"
                >
                  Not available
                </div>
              )}
            </div>
            <div>
              <button
                type="button"
                className="px-3 py-1.5 text-sm bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white rounded-md flex items-center justify-center mx-auto gap-1 transition-colors"
                onClick={handleUploadClick}
                disabled={!isEditable}
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

          <div className="md:col-span-9">
            <div className="mb-3">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Username</label>
              <input
                type="text"
                className="w-full px-3 py-2 text-sm border border-theme rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-100 dark:disabled:bg-gray-600 disabled:text-gray-500"
                value={editedProfile?.username || ''}
                onChange={(e) => handleFieldChange('username', e.target.value)}
                placeholder={isEditable ? "Enter username" : (!editedProfile?.username || editedProfile.username === '') ? "Not available" : ""}
                disabled={!isEditable}
                readOnly={!isEditable}
              />
            </div>

            <div className="mb-3">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input
                type="email"
                className="w-full px-3 py-2 text-sm border border-theme rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-100 dark:disabled:bg-gray-600 disabled:text-gray-500"
                value={editedProfile?.email || ''}
                onChange={(e) => handleFieldChange('email', e.target.value)}
                placeholder={isEditable ? "Enter email" : (!editedProfile?.email || editedProfile.email === '') ? "Not available" : ""}
                disabled={!isEditable}
                readOnly={!isEditable}
              />
            </div>

            {hasChanges && (
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md transition-colors flex items-center gap-1"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <div className="animate-spin inline-block w-4 h-4 border-[3px] border-current border-t-transparent rounded-full" role="status" aria-hidden="true"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-save"></i>
                      Save
                    </>
                  )}
                </button>
                <button
                  className="px-4 py-2 text-sm bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white rounded-md transition-colors"
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
