import React, { useContext, useEffect, useState } from 'react'
import { ModalDialog } from '@remix-ui/modal-dialog'
import { useDialogDispatchers } from '../../context/provider'
import { AppContext } from '../../context/context'

export function AiWorkspaceGeneration() {
  const { alert } = useDialogDispatchers()
  const [content, setContent] = useState<string>(null)
  const { isAiWorkspaceBeingGenerated } = useContext(AppContext)

  useEffect(() => {
    if (isAiWorkspaceBeingGenerated){
      setContent(`Your workspace is being generated. Please wait while I generate the workspace for you. It won't be long.`)
    }
  }, [])

  useEffect(() => {
    if (content) {
      alert({ id: 'aiWorkspaceGeneration', title: null, message: content })
    }
  }, [content])

  return <></>
}

