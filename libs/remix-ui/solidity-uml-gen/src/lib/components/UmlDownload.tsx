import { CustomTooltip } from '@remix-ui/helper'
import React, { Fragment, Ref, useContext } from 'react'
import { FormattedMessage } from 'react-intl'
import { Dropdown } from 'react-bootstrap'
import { UmlFileType } from '../utilities/UmlDownloadStrategy'
import { MatomoEvent, SolidityUMLGenEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'

export const Markup = React.forwardRef(
  (
    {
      children,
      onClick,
      icon,
      className = ''
    }: {
      children: React.ReactNode
      onClick: (e) => void
      icon: string
      className: string
    },
    ref: Ref<HTMLButtonElement>
  ) => (
    <button
      ref={ref}
      onClick={(e) => {
        e.preventDefault()
        onClick(e)
      }}
      className={className.replace('dropdown-toggle', '')}
    >
      <i className={icon}></i>
    </button>
  )
)

export const UmlCustomMenu = React.forwardRef(
  (
    {
      children,
      style,
      className,
      'aria-labelledby': labeledBy
    }: {
      'children': React.ReactNode
      'style'?: React.CSSProperties
      'className': string
      'aria-labelledby'?: string
    },
    ref: Ref<HTMLDivElement>
  ) => {
    const height = window.innerHeight * 0.6
    return (
      <div ref={ref} style={style} className={className} aria-labelledby={labeledBy}>
        <ul className="overflow-auto list-unstyled mb-0" style={{ maxHeight: height + 'px' }}>
          {children}
        </ul>
      </div>
    )
  }
)

interface UmlDownloadProps {
  download: (fileType: UmlFileType) => void
}

export default function UmlDownload(props: UmlDownloadProps) {
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = SolidityUMLGenEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  return (
    <Fragment>
      <CustomTooltip
        tooltipText="Download the UML"
        tooltipId="genUMLundo"
        placement="top"
      >
        <Dropdown id="solUmlMenuDropdown">
          <Dropdown.Toggle icon="far fa-arrow-to-bottom uml-btn-icon" as={Markup} className="badge text-bg-info remixui_no-shadow p-2 rounded-circle me-2"></Dropdown.Toggle>
          <Dropdown.Menu as={UmlCustomMenu} className="form-select">
            <Dropdown.Item
              onClick={() => {
                trackMatomoEvent({ category: 'solidityUMLGen', action: 'umlpngdownload', name: 'downloadAsPng', isClick: true })
                props.download('png')
              }}
              data-id="umlPngDownload"
            >
              <CustomTooltip
                placement="left-start"
                tooltipId="solUmlgenDownloadAsPngTooltip"
                tooltipClasses="text-nowrap"
                tooltipText={<FormattedMessage id="solUmlGen.pngDownloadTooltip" />}
              >
                <div data-id="umlPngDownload">
                  <span id="umlPngDownloadBtn" data-id="umlPngDownload" className="far fa-image ps-2"></span>
                  <span className="ps-1">
                    <FormattedMessage id="solUmlGen.pngDownload" />
                  </span>
                </div>
              </CustomTooltip>
            </Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown.Item
              onClick={() => {
                trackMatomoEvent({ category: 'solidityUMLGen', action: 'umlpdfdownload', name: 'downloadAsPdf', isClick: true })
                props.download('pdf')
              }}
              data-id="umlPdfDownload"
            >
              <CustomTooltip
                placement="left-start"
                tooltipId="solUmlgenDownloadAsPdfTooltip"
                tooltipClasses="text-nowrap"
                tooltipText={<FormattedMessage id="solUmlGen.pdfDownloadTooltip" />}
              >
                <div data-id="umlPdfDownload">
                  <span id="umlPdfDownloadBtn" data-id="umlPdfDownload" className="far fa-file-pdf ps-2"></span>
                  <span className="ps-2">
                    <FormattedMessage id="solUmlGen.pdfDownload" />
                  </span>
                </div>
              </CustomTooltip>
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </CustomTooltip>
    </Fragment>
  )
}
