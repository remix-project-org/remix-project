import React, { useState, useEffect } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { CustomTooltip } from '@remix-ui/helper'
import { ToggleSwitch } from '@remix-ui/toggle'
import { useCloudWorkspaces } from '../context'

export interface CurrentWorkspaceSectionProps {
  plugin: any
}

export const CurrentWorkspaceSection: React.FC<CurrentWorkspaceSectionProps> = ({ plugin }) => {
  const intl = useIntl()
  const {
    isAuthenticated,
    error,
    currentWorkspaceStatus: status,
    saveToCloud,
    createBackup,
    restoreAutosave,
    linkToCurrentUser,
    enableCloud,
    toggleAutosave,
    setWorkspaceRemoteId,
    toggleEncryption,
    setEncryptionPassphrase,
    generateNewPassphrase,
    clearEncryptionPassphrase
  } = useCloudWorkspaces()

  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [, setTick] = useState(0) // Force re-render for time updates

  // Encryption modal state
  const [showPassphraseModal, setShowPassphraseModal] = useState(false)
  const [passphraseInput, setPassphraseInput] = useState('')
  const [generatedPassphrase, setGeneratedPassphrase] = useState('')
  const [passphraseError, setPassphraseError] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)

  // Update relative times every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1)
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleSaveToCloud = async () => {
    setLocalError(null)
    try {
      await saveToCloud()
    } catch (e) {
      setLocalError(e.message || 'Save failed')
    }
  }

  const handleCreateBackup = async () => {
    setLocalError(null)
    try {
      await createBackup()
    } catch (e) {
      setLocalError(e.message || 'Backup failed')
    }
  }

  const handleRestoreAutosave = async () => {
    if (!status.remoteId) return

    // Show confirmation modal before restoring
    const restoreModal = {
      id: 'restoreAutosaveModal',
      title: intl.formatMessage({ id: 'cloudWorkspaces.restoreAutosave', defaultMessage: 'Restore Autosave' }),
      message: intl.formatMessage({
        id: 'cloudWorkspaces.restoreAutosaveConfirm',
        defaultMessage: 'This will restore the last autosave to your current workspace. Existing files with the same name will be overwritten. Continue?'
      }),
      modalType: 'modal',
      okLabel: intl.formatMessage({ id: 'cloudWorkspaces.restore', defaultMessage: 'Restore' }),
      cancelLabel: intl.formatMessage({ id: 'cloudWorkspaces.cancel', defaultMessage: 'Cancel' }),
      okFn: async () => {
        setLocalError(null)
        try {
          await restoreAutosave()
        } catch (e) {
          setLocalError(e.message || 'Restore failed')
        }
      },
      cancelFn: () => null,
      hideFn: () => null
    }

    await plugin.call('notification', 'modal', restoreModal)
  }

  const handleLinkToCurrentUser = async () => {
    // Show confirmation modal before re-linking
    const linkModal = {
      id: 'linkToCurrentUserModal',
      title: intl.formatMessage({ id: 'cloudWorkspaces.linkToAccount', defaultMessage: 'Link to My Account' }),
      message: intl.formatMessage({
        id: 'cloudWorkspaces.linkToAccountConfirm',
        defaultMessage: 'This will create a new cloud link for this workspace under your account. The existing cloud link will remain with the original owner. Continue?'
      }),
      modalType: 'modal',
      okLabel: intl.formatMessage({ id: 'cloudWorkspaces.linkToAccount', defaultMessage: 'Link to My Account' }),
      cancelLabel: intl.formatMessage({ id: 'cloudWorkspaces.cancel', defaultMessage: 'Cancel' }),
      okFn: async () => {
        setLocalError(null)
        try {
          await linkToCurrentUser()
        } catch (e) {
          setLocalError(e.message || 'Link failed')
        }
      },
      cancelFn: () => null,
      hideFn: () => null
    }

    await plugin.call('notification', 'modal', linkModal)
  }

  const handleEnableCloud = async () => {
    setLocalError(null)
    try {
      await enableCloud()
    } catch (e) {
      setLocalError(e.message || 'Failed to enable cloud')
    }
  }

  const handleStartEditName = () => {
    setEditedName(status.remoteId || '')
    setIsEditingName(true)
  }

  const handleCancelEditName = () => {
    setIsEditingName(false)
    setEditedName(status.remoteId || '')
  }

  const handleSaveName = async () => {
    if (!editedName.trim()) return

    setLocalError(null)
    try {
      await setWorkspaceRemoteId(status.workspaceName, editedName.trim())
      setIsEditingName(false)
    } catch (e) {
      setLocalError(e.message || 'Failed to rename')
    }
  }

  // ==================== Encryption Handlers ====================

  const handleOpenPassphraseModal = async () => {
    setPassphraseInput('')
    setGeneratedPassphrase('')
    setPassphraseError(null)
    setIsCopied(false)
    setShowPassphraseModal(true)
  }

  const handleGeneratePassphrase = async () => {
    try {
      const newPassphrase = await generateNewPassphrase()
      setGeneratedPassphrase(newPassphrase)
      setPassphraseInput(newPassphrase)
      setIsCopied(false)
    } catch (e) {
      setPassphraseError(e.message || 'Failed to generate passphrase')
    }
  }

  const handleSavePassphrase = async () => {
    const passphrase = passphraseInput.trim()
    if (passphrase.length < 8) {
      setPassphraseError(intl.formatMessage({
        id: 'cloudWorkspaces.passphraseTooShort',
        defaultMessage: 'Passphrase must be at least 8 characters'
      }))
      return
    }

    setPassphraseError(null)
    try {
      const success = await setEncryptionPassphrase(passphrase)
      if (success) {
        setShowPassphraseModal(false)
        // Actually enable encryption now that passphrase is set
        await toggleEncryption(true)
        await plugin.call('notification', 'toast', '🔐 Encryption enabled')
      }
    } catch (e) {
      setPassphraseError(e.message || 'Failed to set passphrase')
    }
  }

  const handleCopyPassphrase = async () => {
    try {
      await navigator.clipboard.writeText(passphraseInput)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (e) {
      console.error('Failed to copy:', e)
    }
  }

  const handleToggleEncryption = async (enabled: boolean) => {
    if (enabled && !status.hasEncryptionPassphrase) {
      // If enabling and no passphrase set, open modal first
      handleOpenPassphraseModal()
      return
    }

    if (!enabled) {
      // Show warning before disabling
      const disableModal = {
        id: 'disableEncryptionModal',
        title: intl.formatMessage({ id: 'cloudWorkspaces.disableEncryption', defaultMessage: 'Disable Encryption' }),
        message: intl.formatMessage({
          id: 'cloudWorkspaces.disableEncryptionWarning',
          defaultMessage: 'Disabling encryption will mean future backups are stored unencrypted. Existing encrypted backups will still require your passphrase to restore. Continue?'
        }),
        modalType: 'modal',
        okLabel: intl.formatMessage({ id: 'cloudWorkspaces.disable', defaultMessage: 'Disable' }),
        cancelLabel: intl.formatMessage({ id: 'cloudWorkspaces.cancel', defaultMessage: 'Cancel' }),
        okFn: async () => {
          await toggleEncryption(false)
        },
        cancelFn: () => null,
        hideFn: () => null
      }
      await plugin.call('notification', 'modal', disableModal)
      return
    }

    await toggleEncryption(enabled)
  }

  const formatRelativeTime = (dateStr: string | null): string => {
    if (!dateStr) return intl.formatMessage({ id: 'cloudWorkspaces.never', defaultMessage: 'Never' })

    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return intl.formatMessage({ id: 'cloudWorkspaces.justNow', defaultMessage: 'Just now' })
    if (diffMins < 60) return intl.formatMessage({ id: 'cloudWorkspaces.minsAgo', defaultMessage: '{mins} min ago' }, { mins: diffMins })
    if (diffHours < 24) return intl.formatMessage({ id: 'cloudWorkspaces.hoursAgo', defaultMessage: '{hours}h ago' }, { hours: diffHours })
    if (diffDays < 7) return intl.formatMessage({ id: 'cloudWorkspaces.daysAgo', defaultMessage: '{days}d ago' }, { days: diffDays })

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  // Display error from context or local error
  const displayError = localError || error

  if (!isAuthenticated) {
    return null
  }

  if (!status.workspaceName) {
    return (
      <div className="current-workspace-section border-bottom pb-2 mb-2">
        <div className="px-2 py-1 text-muted small">
          <i className="fas fa-folder-open me-1"></i>
          <FormattedMessage id="cloudWorkspaces.noWorkspaceOpen" defaultMessage="No workspace open" />
        </div>
      </div>
    )
  }

  return (
    <div className="current-workspace-section border-bottom pb-2 mb-2">
      {/* Section Header */}
      <div className="px-2 py-1 border-bottom">
        <span className="text-muted small">
          <i className="fas fa-folder me-1"></i>
          <FormattedMessage id="cloudWorkspaces.currentWorkspace" defaultMessage="Current Workspace" />
        </span>
      </div>

      {/* Workspace Info */}
      <div className="px-2 py-2">
        {/* Local workspace name */}
        <div className="small mb-1">
          <span className="text-muted">Local: </span>
          <span className="fw-bold text-truncate" title={status.workspaceName}>
            {status.workspaceName}
          </span>
        </div>

        {/* Remote ID with edit */}
        <div className="small mb-2">
          <span className="text-muted">Cloud: </span>
          {isEditingName ? (
            <div className="d-inline-flex align-items-center">
              <input
                type="text"
                className="form-control form-control-sm py-0"
                style={{ fontSize: '0.8rem', width: '120px' }}
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveName()
                  if (e.key === 'Escape') handleCancelEditName()
                }}
                onBlur={handleCancelEditName}
                autoFocus
              />
              <button
                className="btn btn-sm p-0 ms-1 text-success"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleSaveName}
                style={{ border: 'none', background: 'none' }}
              >
                <i className="fas fa-check" style={{ fontSize: '0.75rem' }}></i>
              </button>
              <button
                className="btn btn-sm p-0 ms-1 text-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleCancelEditName}
                style={{ border: 'none', background: 'none' }}
              >
                <i className="fas fa-times" style={{ fontSize: '0.75rem' }}></i>
              </button>
            </div>
          ) : (
            <>
              <span className="text-truncate" title={status.remoteId || ''}>
                {status.remoteId || <span className="text-muted fst-italic">
                  <FormattedMessage id="cloudWorkspaces.notLinked" defaultMessage="Not linked" />
                </span>}
              </span>
              {status.remoteId && (
                <CustomTooltip
                  placement="top"
                  tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.editCloudName', defaultMessage: 'Edit cloud name' })}
                >
                  <button
                    className="btn btn-sm p-0 ms-1 text-muted"
                    onClick={handleStartEditName}
                    style={{ border: 'none', background: 'none' }}
                  >
                    <i className="fas fa-pencil-alt" style={{ fontSize: '0.65rem' }}></i>
                  </button>
                </CustomTooltip>
              )}
            </>
          )}
        </div>

        {/* Status indicators */}
        {status.remoteId && status.ownedByCurrentUser && (
          <div className="d-flex flex-wrap gap-2 mb-2" style={{ fontSize: '0.7rem' }}>
            <span className="text-muted">
              <i className="fas fa-cloud-upload-alt me-1"></i>
              <FormattedMessage id="cloudWorkspaces.lastSaved" defaultMessage="Saved" />: {formatRelativeTime(status.lastSaved)}
            </span>
            <span className="text-muted">
              <i className="fas fa-archive me-1"></i>
              <FormattedMessage id="cloudWorkspaces.lastBackup" defaultMessage="Backup" />: {formatRelativeTime(status.lastBackup)}
            </span>
          </div>
        )}

        {/* Warning: Workspace linked to another user */}
        {status.linkedToAnotherUser && (
          <div className="alert alert-warning py-1 px-2 mb-2 small">
            <i className="fas fa-exclamation-triangle me-1"></i>
            <FormattedMessage
              id="cloudWorkspaces.linkedToAnotherUser"
              defaultMessage="This workspace is linked to another user's cloud storage."
            />
            <button
              className="btn btn-sm btn-link p-0 ms-1"
              onClick={handleLinkToCurrentUser}
              disabled={status.isLinking}
              style={{ fontSize: '0.75rem' }}
            >
              {status.isLinking ? (
                <i className="fas fa-spinner fa-spin me-1"></i>
              ) : null}
              <FormattedMessage id="cloudWorkspaces.linkToAccount" defaultMessage="Link to My Account" />
            </button>
          </div>
        )}

        {/* Error display */}
        {displayError && (
          <div className="alert alert-danger py-1 px-2 mb-2 small">
            <i className="fas fa-exclamation-triangle me-1"></i>
            {displayError}
          </div>
        )}

        {/* Enable Cloud CTA - show when workspace not linked */}
        {!status.remoteId && !status.linkedToAnotherUser && (
          <div className="text-center py-2">
            <p className="text-muted small mb-2">
              <FormattedMessage
                id="cloudWorkspaces.enableCloudDesc"
                defaultMessage="Back up this workspace to the cloud"
              />
            </p>
            <button
              className="btn btn-primary w-100"
              onClick={handleEnableCloud}
              disabled={status.isLinking || status.isSaving}
              style={{ fontSize: '0.85rem' }}
            >
              {(status.isLinking || status.isSaving) ? (
                <i className="fas fa-spinner fa-spin me-1"></i>
              ) : (
                <i className="fas fa-cloud me-1"></i>
              )}
              <FormattedMessage id="cloudWorkspaces.enableCloud" defaultMessage="Enable Cloud Backup" />
            </button>
          </div>
        )}

        {/* Action buttons - only show when linked */}
        {status.remoteId && status.ownedByCurrentUser && (
          <div className="d-flex gap-1">
            <CustomTooltip
              placement="top"
              tooltipText={
                status.linkedToAnotherUser
                  ? intl.formatMessage({ id: 'cloudWorkspaces.linkToAccountFirst', defaultMessage: 'Link to your account first' })
                  : intl.formatMessage({ id: 'cloudWorkspaces.saveToCloudTip', defaultMessage: 'Save current state to cloud' })
              }
            >
              <button
                className="btn btn-sm btn-primary flex-grow-1"
                onClick={handleSaveToCloud}
                disabled={status.isSaving || status.isBackingUp || status.isRestoring || !status.canSave}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
              >
                {status.isSaving ? (
                  <i className="fas fa-spinner fa-spin me-1"></i>
                ) : (
                  <i className="fas fa-cloud-upload-alt me-1"></i>
                )}
                <FormattedMessage id="cloudWorkspaces.saveToCloud" defaultMessage="Save" />
              </button>
            </CustomTooltip>

            <CustomTooltip
              placement="top"
              tooltipText={
                status.linkedToAnotherUser
                  ? intl.formatMessage({ id: 'cloudWorkspaces.linkToAccountFirst', defaultMessage: 'Link to your account first' })
                  : intl.formatMessage({ id: 'cloudWorkspaces.createBackupTip', defaultMessage: 'Create a timestamped backup' })
              }
            >
              <button
                className="btn btn-sm btn-secondary flex-grow-1"
                onClick={handleCreateBackup}
                disabled={status.isSaving || status.isBackingUp || status.isRestoring || !status.canSave}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
              >
                {status.isBackingUp ? (
                  <i className="fas fa-spinner fa-spin me-1"></i>
                ) : (
                  <i className="fas fa-archive me-1"></i>
                )}
                <FormattedMessage id="cloudWorkspaces.createBackup" defaultMessage="Backup" />
              </button>
            </CustomTooltip>

            {/* Restore button - only show if there's a saved state and user owns workspace */}
            {status.lastSaved && (
              <CustomTooltip
                placement="top"
                tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.restoreAutosaveTip', defaultMessage: 'Restore from last cloud save' })}
              >
                <button
                  className="btn btn-sm btn-success flex-grow-1"
                  onClick={handleRestoreAutosave}
                  disabled={status.isSaving || status.isBackingUp || status.isRestoring}
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                >
                  {status.isRestoring ? (
                    <i className="fas fa-spinner fa-spin me-1"></i>
                  ) : (
                    <i className="fas fa-download me-1"></i>
                  )}
                  <FormattedMessage id="cloudWorkspaces.restoreAutosave" defaultMessage="Restore" />
                </button>
              </CustomTooltip>
            )}
          </div>
        )}

        {/* Autosave toggle - only show when linked */}
        {status.remoteId && status.ownedByCurrentUser && (
          <div className="mt-2 d-flex align-items-center justify-content-between px-1">
            <span
              className="small text-muted mb-0 d-flex align-items-center"
              style={{ fontSize: '0.75rem' }}
            >
              <i className={`fas ${status.autosaveEnabled ? 'fa-cloud-upload-alt text-success' : 'fa-cloud text-muted'} me-1`}></i>
              <FormattedMessage id="cloudWorkspaces.autosave" defaultMessage="Autosave" />
            </span>
            <ToggleSwitch
              id="cloud-autosave-toggle"
              isOn={status.autosaveEnabled}
              onClick={() => toggleAutosave(!status.autosaveEnabled)}
              onstyle="text-success"
              offstyle="text-secondary"
              size="md"
            />
          </div>
        )}

        {/* Encryption toggle - only show when linked */}
        {status.remoteId && status.ownedByCurrentUser && (
          <div className="mt-2 d-flex align-items-center justify-content-between px-1">
            <span
              className="small text-muted mb-0 d-flex align-items-center"
              style={{ fontSize: '0.75rem' }}
            >
              <i className={`fas ${status.encryptionEnabled ? 'fa-lock text-warning' : 'fa-lock-open text-muted'} me-1`}></i>
              <FormattedMessage id="cloudWorkspaces.encryption" defaultMessage="Encryption" />
              {status.encryptionEnabled && !status.hasEncryptionPassphrase && (
                <CustomTooltip
                  placement="top"
                  tooltipText={intl.formatMessage({ id: 'cloudWorkspaces.passphraseRequired', defaultMessage: 'Passphrase required' })}
                >
                  <i className="fas fa-exclamation-circle text-warning ms-1" style={{ fontSize: '0.65rem' }}></i>
                </CustomTooltip>
              )}
            </span>
            <div className="d-flex align-items-center gap-1">
              {status.encryptionEnabled && (
                <CustomTooltip
                  placement="top"
                  tooltipText={intl.formatMessage({
                    id: 'cloudWorkspaces.setPassphraseTip',
                    defaultMessage: status.hasEncryptionPassphrase ? 'Change passphrase' : 'Set passphrase'
                  })}
                >
                  <button
                    className={`btn btn-sm p-0 ${status.hasEncryptionPassphrase ? 'text-muted' : 'text-warning'}`}
                    onClick={handleOpenPassphraseModal}
                    style={{ border: 'none', background: 'none', fontSize: '0.7rem' }}
                  >
                    <i className="fas fa-key"></i>
                  </button>
                </CustomTooltip>
              )}
              <ToggleSwitch
                id="cloud-encryption-toggle"
                isOn={status.encryptionEnabled}
                onClick={() => handleToggleEncryption(!status.encryptionEnabled)}
                onstyle="text-warning"
                offstyle="text-secondary"
                size="md"
              />
            </div>
          </div>
        )}

        {/* Encryption warning */}
        {status.remoteId && status.ownedByCurrentUser && status.encryptionEnabled && !status.hasEncryptionPassphrase && (
          <div className="alert alert-warning py-1 px-2 mt-2 small" style={{ fontSize: '0.7rem' }}>
            <i className="fas fa-key me-1"></i>
            <FormattedMessage
              id="cloudWorkspaces.setPassphraseWarning"
              defaultMessage="Set a passphrase to enable encrypted backups"
            />
            <button
              className="btn btn-sm btn-link p-0 ms-1"
              onClick={handleOpenPassphraseModal}
              style={{ fontSize: '0.7rem' }}
            >
              <FormattedMessage id="cloudWorkspaces.setPassphrase" defaultMessage="Set Passphrase" />
            </button>
          </div>
        )}
      </div>

      {/* Passphrase Modal */}
      {showPassphraseModal && (
        <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setShowPassphraseModal(false)}>
          <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header py-2">
                <h6 className="modal-title">
                  <i className="fas fa-key me-2"></i>
                  <FormattedMessage id="cloudWorkspaces.encryptionPassphrase" defaultMessage="Encryption Passphrase" />
                </h6>
                <button type="button" className="btn-close" onClick={() => setShowPassphraseModal(false)}></button>
              </div>
              <div className="modal-body">
                {/* Warning */}
                <div className="alert alert-danger py-2 mb-3" style={{ fontSize: '0.8rem' }}>
                  <i className="fas fa-exclamation-triangle me-1"></i>
                  <strong><FormattedMessage id="cloudWorkspaces.warning" defaultMessage="Warning" />:</strong>{' '}
                  <FormattedMessage
                    id="cloudWorkspaces.passphraseWarning"
                    defaultMessage="If you lose this passphrase, your encrypted data cannot be recovered. Save it securely!"
                  />
                </div>

                {/* Generate button */}
                <div className="mb-3">
                  <button
                    className="btn btn-outline-primary btn-sm w-100"
                    onClick={handleGeneratePassphrase}
                  >
                    <i className="fas fa-random me-1"></i>
                    <FormattedMessage id="cloudWorkspaces.generateSecurePassphrase" defaultMessage="Generate Secure Passphrase" />
                  </button>
                </div>

                {/* Generated passphrase display */}
                {generatedPassphrase && (
                  <div className="mb-3 p-2 bg-light rounded border">
                    <div className="d-flex justify-content-between align-items-center">
                      <code className="text-break" style={{ fontSize: '0.85rem' }}>{generatedPassphrase}</code>
                      <button
                        className="btn btn-sm btn-outline-secondary ms-2"
                        onClick={handleCopyPassphrase}
                      >
                        <i className={`fas ${isCopied ? 'fa-check text-success' : 'fa-copy'}`}></i>
                      </button>
                    </div>
                    <small className="text-muted d-block mt-1">
                      <FormattedMessage id="cloudWorkspaces.copyAndSave" defaultMessage="Copy and save this passphrase securely" />
                    </small>
                  </div>
                )}

                {/* Manual entry */}
                <div className="mb-3">
                  <label className="form-label small text-muted">
                    <FormattedMessage id="cloudWorkspaces.orEnterOwn" defaultMessage="Or enter your own passphrase (min 8 characters):" />
                  </label>
                  <input
                    type="password"
                    className="form-control form-control-sm"
                    value={passphraseInput}
                    onChange={(e) => setPassphraseInput(e.target.value)}
                    placeholder={intl.formatMessage({ id: 'cloudWorkspaces.enterPassphrase', defaultMessage: 'Enter passphrase...' })}
                    onKeyDown={(e) => e.key === 'Enter' && handleSavePassphrase()}
                  />
                </div>

                {/* Error display */}
                {passphraseError && (
                  <div className="alert alert-danger py-1 px-2 small">
                    <i className="fas fa-exclamation-triangle me-1"></i>
                    {passphraseError}
                  </div>
                )}
              </div>
              <div className="modal-footer py-2">
                <button className="btn btn-secondary btn-sm" onClick={() => setShowPassphraseModal(false)}>
                  <FormattedMessage id="cloudWorkspaces.cancel" defaultMessage="Cancel" />
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleSavePassphrase}
                  disabled={passphraseInput.length < 8}
                >
                  <i className="fas fa-check me-1"></i>
                  <FormattedMessage id="cloudWorkspaces.savePassphrase" defaultMessage="Save Passphrase" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
