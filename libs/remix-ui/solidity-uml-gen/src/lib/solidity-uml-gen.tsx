import React, { Fragment, useCallback, useEffect, useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import { GlassMagnifier, MagnifierContainer } from '@ricarso/react-image-magnifiers'
import { ThemeSummary } from '../types'
import { CustomTooltip } from '@remix-ui/helper'
import UmlDownload from './components/UmlDownload'
import './css/solidity-uml-gen.css'
import { UmlDownloadContext, UmlFileType } from './utilities/UmlDownloadStrategy'
export interface RemixUiSolidityUmlGenProps {
  updatedSvg?: string
  loading?: boolean
  themeSelected?: string
  themeName: string
  themeDark: string
  fileName: string
  themeCollection: ThemeSummary[]
}

interface ActionButtonsProps {
  actions: {
    zoomIn: () => void
    zoomOut: () => void
    resetTransform: () => void
  }
}

let umlCopy = ''
export function RemixUiSolidityUmlGen({ updatedSvg, loading, fileName, themeDark }: RemixUiSolidityUmlGenProps) {
  const [showViewer, setShowViewer] = useState(false)
  const [validSvg, setValidSvg] = useState(false)
  const umlDownloader = new UmlDownloadContext()

  useEffect(() => {
    if (updatedSvg.startsWith('<?xml') && updatedSvg.includes('<svg')) {
      umlCopy = updatedSvg
    }
    setValidSvg(updatedSvg.startsWith('<?xml') && updatedSvg.includes('<svg'))
    setShowViewer(updatedSvg.startsWith('<?xml') && updatedSvg.includes('<svg'))
  }, [updatedSvg])

  const encoder = new TextEncoder()
  const data = encoder.encode(updatedSvg)
  const final = btoa(String.fromCharCode.apply(null, data))

  const download = useCallback(
    (fileType: UmlFileType) => {
      if (umlCopy.length === 0) {
        return
      }
      umlDownloader.download(umlCopy, fileName, fileType)
    },
    [updatedSvg, fileName]
  )

  function ActionButtons({ actions: { zoomIn, zoomOut, resetTransform } }: ActionButtonsProps) {
    return (
      <>
        <div className="position-absolute bg-transparent mt-2" id="buttons" style={{ zIndex: 3, top: '10', right: '2em' }}>
          <div className="py-2 px-2 d-flex justify-content-center align-items-center">
            <UmlDownload download={download} />
            <CustomTooltip
              tooltipText="Zoom in"
              tooltipId="genUMLzoomin"
              placement="top"
            >
              <button data-id="umlZoominbtn" className="badge text-bg-secondary remixui_no-shadow p-2 rounded-circle me-2" onClick={() => zoomIn()}>
                <i className="far fa-plus uml-btn-icon fs-6"></i>
              </button>
            </CustomTooltip>
            <CustomTooltip
              tooltipText="Zoom out"
              tooltipId="genUMLzoomout"
              placement="top"
            >
              <button data-id="umlZoomoutbtn" className="badge text-bg-secondary remixui_no-shadow p-2 rounded-circle me-2" onClick={() => zoomOut()}>
                <i className="far fa-minus uml-btn-icon fs-6"></i>
              </button>
            </CustomTooltip>
            <CustomTooltip
              tooltipText="Undo"
              tooltipId="genUMLundo"
              placement="top"
            >
              <button data-id="umlResetbtn" className="badge text-bg-secondary remixui_no-shadow p-2 rounded-circle me-2" onClick={() => resetTransform()}>
                <i className="far fa-undo uml-btn-icon fs-6"></i>
              </button>
            </CustomTooltip>
          </div>
        </div>
      </>
    )
  }

  const DefaultInfo = () => (
    <div className="d-flex flex-column justify-content-center align-items-center mt-5 ms-5">
      <h3 className="h3 align-self-start text-dark">
        <p>
          <FormattedMessage id="solUmlGen.text1" />
        </p>
      </h3>
      <ul className="ms-3 justify-content-start align-self-start">
        <li>
          <h5 className="h5 align-self-start text-dark">
            <p>
              <FormattedMessage id="solUmlGen.text2" />
            </p>
          </h5>
        </li>
        <li>
          <h5 className="h5 align-self-start text-dark">
            <p>
              <FormattedMessage id="solUmlGen.clickOn" />{' '}
              <b>
                <FormattedMessage id="solUmlGen.generateUML" />
              </b>
            </p>
          </h5>
        </li>
      </ul>
    </div>
  )
  const Display = () => {
    return (
      <div id="umlImageHolder" className="w-100 px-2 py-2 d-flex">
        {validSvg && showViewer ? (
          <MagnifierContainer>
            <TransformWrapper initialScale={1}>
              {({ zoomIn, zoomOut, resetTransform }) => (
                <Fragment>
                  <ActionButtons actions={{ zoomIn, zoomOut, resetTransform }} />
                  <TransformComponent contentStyle={{ zIndex: 2 }}>
                    <GlassMagnifier imageSrc={`data:image/svg+xml;base64,${final}`} magnifierSize={300} magnifierBorderSize={3} magnifierBorderColor={themeDark} square />
                  </TransformComponent>
                </Fragment>
              )}
            </TransformWrapper>
          </MagnifierContainer>
        ) : loading ? (
          <div className="justify-content-center align-items-center d-flex  mx-auto my-auto">
            <i className="fas fa-spinner fa-spin fa-4x"></i>
          </div>
        ) : (
          <DefaultInfo />
        )}
      </div>
    )
  }
  return <>{<Display />}</>
}

export default RemixUiSolidityUmlGen
