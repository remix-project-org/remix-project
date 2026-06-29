// eslint-disable-next-line no-use-before-define
import React, { useContext } from 'react'
import parse from 'html-react-parser'
import { ScanReport } from '@remix-ui/helper'
import { MatomoEvent, CompilerEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'
import { FormattedMessage } from 'react-intl'

interface SolScanTableProps {
  scanReport: ScanReport
  fileName: string
}

export function SolScanTable(props: SolScanTableProps) {
  const { scanReport, fileName } = props
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = CompilerEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const { multi_file_scan_details, multi_file_scan_summary } = scanReport

  return (
    <>
      <br/>
      <h6><FormattedMessage id="helper.solidityScanResult" /> <b>{fileName}</b>:</h6>
      <table className="table table-bordered table-hover">
        <thead>
          <tr>
            <td scope="col" style={{ wordBreak: "keep-all" }}>#</td>
            <td scope="col" style={{ wordBreak: "keep-all" }}><FormattedMessage id="helper.scanColName" /></td>
            <td scope="col" style={{ wordBreak: "keep-all" }}><FormattedMessage id="helper.scanColSeverity" /></td>
            <td scope="col" style={{ wordBreak: "keep-all" }}><FormattedMessage id="helper.scanColConfidence" /></td>
            <td scope="col" style={{ wordBreak: "keep-all" }}><FormattedMessage id="helper.scanColDescription" /></td>
            <td scope="col" style={{ wordBreak: "keep-all" }}><FormattedMessage id="helper.scanColRemediation" /></td>
          </tr>
        </thead>
        <tbody>
          {
            Array.from(multi_file_scan_details, (template, index) => {
              return (
                <tr key={template.template_details.issue_id}>
                  <td scope="col">{index + 1}.</td>
                  <td scope="col">{template.template_details.issue_name}</td>
                  <td scope="col">{template.template_details.issue_severity}</td>
                  <td scope="col">{template.template_details.issue_confidence}</td>
                  <td scope="col">{parse(template.template_details.static_issue_description)} {template.positions ? `Lines: ${template.positions}`: ''}</td>
                  <td scope="col">{template.template_details.issue_remediation ? parse(template.template_details.issue_remediation) : <FormattedMessage id="helper.scanNotAvailable" /> }</td>
                </tr>
              )
            })
          }

        </tbody>
      </table>

      { multi_file_scan_summary ? (
        <>
          <p className='text-success'><b><FormattedMessage id="helper.scanSummaryLabel" /></b></p>
          <p>&emsp; <FormattedMessage id="helper.scanLinesAnalyzed" /> {multi_file_scan_summary.lines_analyzed_count}</p>
          <p>&emsp; <FormattedMessage id="helper.scanScore" /> {multi_file_scan_summary.score_v2}</p>
          <p>&emsp; <FormattedMessage id="helper.scanIssueDistribution" /> { JSON.stringify(multi_file_scan_summary.issue_severity_distribution, null, 1)} </p>
          <p><FormattedMessage id="helper.scanForMoreDetails" />&nbsp;
            <a href="https://solidityscan.com/?utm_campaign=remix&utm_source=remix"
              target='_blank'
              onClick={() => trackMatomoEvent({ category: 'solidityCompiler', action: 'solidityScan', name: 'goToSolidityScan', isClick: true })}>
              <FormattedMessage id="helper.scanGoToSolidityScan" />
            </a>
          </p>
        </>
      ): null}
    </>
  )
}
