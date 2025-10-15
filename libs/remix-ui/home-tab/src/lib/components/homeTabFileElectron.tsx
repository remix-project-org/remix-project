/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useRef, useReducer, useContext } from 'react'
import { FormattedMessage } from 'react-intl'
import { ModalDialog } from '@remix-ui/modal-dialog' // eslint-disable-line
import { Toaster } from '@remix-ui/toaster' // eslint-disable-line
import { CustomTooltip } from '@remix-ui/helper'
import { HomeTabEvent, MatomoEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'

interface HomeTabFileProps {
  plugin: any
}

function HomeTabFileElectron({ plugin }: HomeTabFileProps) {
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)

  // Component-specific tracker with default HomeTabEvent type
  const trackMatomoEvent = <T extends MatomoEvent = HomeTabEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  const loadTemplate = async () => {
    plugin.call('filePanel', 'loadTemplate')
  }

  const clone = async () => {
    plugin.call('filePanel', 'clone')
  }

  const importFromGist = () => {
    trackMatomoEvent({
      category: 'hometab',
      action: 'filesSection',
      name: 'importFromGist',
      isClick: true
    })
    plugin.call('gistHandler', 'load', '')
    plugin.verticalIcons.select('filePanel')
  }

  return (
    <div className="justify-content-start mt-1 p-2 d-flex flex-column" id="hTFileSection">
      <label style={{ fontSize: "1.2rem" }}><FormattedMessage id='home.files' /></label>
      <label style={{ fontSize: "0.8rem" }} className="pt-2"><FormattedMessage id='home.loadFrom' /></label>
      <div className="d-flex">

        <button className="btn p-2 border me-2" data-id="landingPageImportFromTemplate" onClick={async () => await loadTemplate()}>Project Template</button>
        <button className="btn p-2 border me-2" data-id="landingPageImportFromGit" onClick={async () => await clone()}>Clone a Git Repository</button>
        <button className="btn p-2 border me-2" data-id="landingPageImportFromGist" onClick={() => importFromGist()}>Gist</button>
      </div>
    </div>
  )
}

export { HomeTabFileElectron }