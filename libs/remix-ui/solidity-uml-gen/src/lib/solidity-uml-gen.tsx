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
        <div className="absolute bg-transparent mt-2" id="buttons" style={{ zIndex: 3, top: '10', right: '2em' }}>
          <div className="py-2 px-2 flex justify-center items-center">
            <UmlDownload download={download} />
            <CustomTooltip
              tooltipText="Zoom in"
              tooltipId="genUMLzoomin"
              placement="top"
            >
              <button data-id="umlZoominbtn" className="badge text-bg-secondary remixui_no-shadow p-2 rounded-full mr-2" onClick={() => zoomIn()}>
                <i className="far fa-plus uml-btn-icon"></i>
              </button>
            </CustomTooltip>
            <CustomTooltip
              tooltipText="Zoom out"
              tooltipId="genUMLzoomout"
              placement="top"
            >
              <button data-id="umlZoomoutbtn" className="badge text-bg-secondary remixui_no-shadow p-2 rounded-full mr-2" onClick={() => zoomOut()}>
                <i className="far fa-minus uml-btn-icon"></i>
              </button>
            </CustomTooltip>
            <CustomTooltip
              tooltipText="Undo"
              tooltipId="genUMLundo"
              placement="top"
            >
              <button data-id="umlResetbtn" className="badge text-bg-secondary remixui_no-shadow p-2 rounded-full mr-2" onClick={() => resetTransform()}>
                <i className="far fa-undo uml-btn-icon"></i>
              </button>
            </CustomTooltip>
          </div>
        </div>
      </>
    )
  }

  const DefaultInfo = () => (
    <div className="flex flex-col justify-center items-center mt-5 ml-5">
      <h3 className="h3 self-start text-dark">
        <p>
          <FormattedMessage id="solUmlGen.text1" />
        </p>
      </h3>
      <ul className="ml-3 justify-start self-start">
        <li>
          <h5 className="h5 self-start text-dark">
            <p>
              <FormattedMessage id="solUmlGen.text2" />
            </p>
          </h5>
        </li>
        <li>
          <h5 className="h5 self-start text-dark">
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
      <div id="umlImageHolder" className="w-full px-2 py-2 flex">
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
          <div className="justify-center items-center flex  mx-auto my-auto">
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
