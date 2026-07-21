/* eslint-disable @nx/enforce-module-boundaries */
import React, { useRef, useState } from 'react'
import { cloneRepository } from 'libs/remix-ui/workspace/src/lib/actions'
import { IntlShape } from 'react-intl'
import { appPlatformTypes } from 'libs/remix-ui/app/src/lib/remix-app/context/context'
import { Modal, Button, Form } from 'react-bootstrap'

interface CloneRepositoryModalProps {
  intl: IntlShape
  platform: (typeof appPlatformTypes)[keyof typeof appPlatformTypes]
  plugin: any
}

export const useCloneRepositoryModal = ({ intl, platform, plugin }: CloneRepositoryModalProps) => {
  const cloneUrlRef = useRef<HTMLInputElement>(null)
  const modal = (title: string, message: any, okLabel: string, okFn: () => void, cancelLabel: string) => {
    const upgradeModal = {
      id: 'topbarModal',
      title,
      message,
      modalType: 'modal',
      okLabel,
      cancelLabel,
      okFn: () => {
        okFn()
      },
      cancelFn: () => {},
      hideFn: () => null,
    }
    plugin.call('notification', 'modal', upgradeModal)
  }
  const cloneModalMessage = () => {
    return (
      <>
        <input
          type="text"
          data-id="modalDialogCustomPromptTextClone"
          placeholder={intl.formatMessage({
            id: 'filePanel.workspace.enterGitUrl',
          })}
          ref={cloneUrlRef}
          className="form-control"
        />
      </>
    )
  }

  const handleTypingUrl = () => {
    const url = cloneUrlRef.current?.value

    if (url) {
      cloneRepository(url)
    } else {
      modal(intl.formatMessage({ id: 'filePanel.workspace.clone' }), intl.formatMessage({ id: 'filePanel.workspace.cloneMessage' }), intl.formatMessage({ id: platform !== appPlatformTypes.desktop ? 'filePanel.ok' : 'filePanel.selectFolder' }), () => {}, intl.formatMessage({ id: 'filePanel.cancel' }))
    }
  }

  const showCloneModal = () => {
    modal(intl.formatMessage({ id: 'filePanel.workspace.clone' }), cloneModalMessage(), intl.formatMessage({ id: platform !== appPlatformTypes.desktop ? 'filePanel.ok' : 'filePanel.selectFolder' }), handleTypingUrl, intl.formatMessage({ id: 'filePanel.cancel' }))
  }

  return { showCloneModal }
}

// Standalone component version that doesn't require a modal context
interface StandaloneCloneModalProps {
  show: boolean
  onHide: () => void
  platform?: (typeof appPlatformTypes)[keyof typeof appPlatformTypes]
}

export const StandaloneCloneModal = ({ show, onHide, platform }: StandaloneCloneModalProps) => {
  const [url, setUrl] = useState('')

  const handleClone = () => {
    if (url) {
      cloneRepository(url)
      setUrl('')
      onHide()
    }
  }

  const handleCancel = () => {
    setUrl('')
    onHide()
  }

  return (
    <Modal show={show} onHide={handleCancel} centered>
      <Modal.Header closeButton>
        <Modal.Title>Clone Git Repository</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group>
          <Form.Control
            type="text"
            placeholder="Enter Git repository URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            data-id="modalDialogCustomPromptTextClone"
            autoFocus
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleClone()
              }
            }}
          />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleClone} disabled={!url}>
          {platform === appPlatformTypes.desktop ? 'Select Folder' : 'OK'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
