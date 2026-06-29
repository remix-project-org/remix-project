import React, { useEffect, useState } from 'react'
import { gitUIPanels } from '../../types'
import GitUIButton from '../buttons/gituibutton'
import { FormattedMessage } from 'react-intl'

export const Setup = ({ callback }) => {

  const startSettingUp = () => {
    callback(gitUIPanels.GITHUB)
  }

  return (
    <>
      <h6><FormattedMessage id="gitui.setupRequired" /></h6>
      <div>
        <div className='mt-1 mb-2'>
          <FormattedMessage id="gitui.setupDescription" /> <a href='#' onClick={startSettingUp} className='cursor-pointer me-1'><FormattedMessage id="gitui.setupConfigureLink" /></a>
          <FormattedMessage id="gitui.setupCredentialsInfo" />

          <a href='#' onClick={startSettingUp} className='ms-1 cursor-pointer'>
            <FormattedMessage id='git.setup' /></a>
        </div>
        <hr></hr>
      </div>
    </>
  )

}
