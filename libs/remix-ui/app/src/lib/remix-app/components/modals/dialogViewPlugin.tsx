import React, { useContext, useEffect } from 'react'
import { AppContext } from '../../context/context'
import { useDialogDispatchers } from '../../context/provider'

const DialogViewPlugin = () => {
  const { modal, alert, toast, actionNotification, hideActionNotification } = useDialogDispatchers()
  const app = useContext(AppContext)

  useEffect(() => {
    app.modal.setDispatcher({ modal, alert, toast, actionNotification, hideActionNotification })
  }, [])
  return <></>
}

export default DialogViewPlugin
