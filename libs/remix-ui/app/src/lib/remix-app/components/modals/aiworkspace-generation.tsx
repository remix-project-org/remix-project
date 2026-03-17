import React, { useContext, useEffect, useState } from 'react'
import { ModalDialog } from '@remix-ui/modal-dialog'
import { useDialogDispatchers } from '../../context/provider'
import { AppContext } from '../../context/context'
import { useIntl } from 'react-intl'

export function AiWorkspaceGeneration() {
  const { alert } = useDialogDispatchers()
  const [content, setContent] = useState<string>(null)
  const { isAiWorkspaceBeingGenerated } = useContext(AppContext)
  const intl = useIntl()

  useEffect(() => {
    if (isAiWorkspaceBeingGenerated){
      setContent(intl.formatMessage({ id: 'remixApp.aiWorkspaceGenerating' }))
    }
  }, [])

  useEffect(() => {
    if (content) {
      alert({ id: 'aiWorkspaceGeneration', title: null, message: content })
    }
  }, [content])

  return <></>
}

