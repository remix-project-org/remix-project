import React, { useMemo } from 'react'
import { useDialogDispatchers, useDialogs } from '../../context/provider'
import { ToasterContainer } from '@remix-ui/toaster'
import ModalWrapper from './modal-wrapper'
import ActionNotificationContainer from './action-notification-container'

const AppDialogs = () => {
  const { handleHideModal, handleToaster } = useDialogDispatchers()
  const { focusModal, toasters } = useDialogs()

  // Map toasters to ToasterProps format with useMemo to prevent recreating on every render
  const toastList = useMemo(() => {
    return toasters.map((toaster) => ({
      message: toaster.message,
      id: toaster.toastId || `toast-${toaster.timestamp}`,
      timeout: toaster.timeout,
      timestamp: toaster.timestamp,
      handleHide: handleToaster
    }))
  }, [toasters, handleToaster])

  return (
    <>
      <ModalWrapper {...focusModal} handleHide={handleHideModal}></ModalWrapper>
      <ToasterContainer toasts={toastList} />
      <ActionNotificationContainer />
    </>
  )
}
export default AppDialogs
