import React from 'react'
import axios from 'axios'
import { FormattedMessage } from 'react-intl'
import { endpointUrls } from '@remix-endpoints-helper'
import { ScanReport, SolScanTable } from '@remix-ui/helper'
import { trackMatomoEvent } from '@remix-api'

import { CopyToClipboard } from '@remix-ui/clipboard'
import { CustomTooltip } from './components/custom-tooltip'

export const handleSolidityScan = async (api: any, compiledFileName: string) => {
  await api.call('notification', 'toast', 'Processing data to scan...')
  await trackMatomoEvent(api, { category: 'solidityCompiler', action: 'solidityScan', name: 'initiateScan', isClick: false })

  const workspace = await api.call('filePanel', 'getCurrentWorkspace')
  const fileName = `${workspace.name}/${compiledFileName}`
  const filePath = `.workspaces/${fileName}`
  const file = await api.call('fileManager', 'readFile', filePath)

  try {
    const urlResponse = await axios.post(`${endpointUrls.solidityScan}/uploadFile`, { file, fileName })

    if (urlResponse.data.status === 'success') {
      const ws = new WebSocket(`${endpointUrls.solidityScanWebSocket}/solidityscan`)
      ws.addEventListener('error', console.error)

      ws.addEventListener('open', async () => {
        await api.call('notification', 'toast', 'Loading scan result in Remix terminal...')
      })

      ws.addEventListener('message', async (event) => {
        const data = JSON.parse(event.data)
        if (data.type === "auth_token_register" && data.payload.message === "Auth token registered.") {
          ws.send(JSON.stringify({
            action: "message",
            payload: {
              type: "private_project_scan_initiate",
              body: {
                file_urls: [urlResponse.data.result.url],
                project_name: "RemixProject",
                project_type: "new"
              }
            }
          }))
        } else if (data.type === "scan_status" && data.payload.scan_status === "download_failed") {
          await trackMatomoEvent(api, { category: 'solidityCompiler', action: 'solidityScan', name: 'scanFailed', isClick: false })
          await api.call('notification', 'modal', {
            id: 'SolidityScanError',
            title: <FormattedMessage id="solidity.solScan.errModalTitle" />,
            message: data.payload.scan_status_err_message,
            okLabel: 'Close'
          })
          ws.close()
        } else if (data.type === "scan_status" && data.payload.scan_status === "scan_done") {
          await trackMatomoEvent(api, { category: 'solidityCompiler', action: 'solidityScan', name: 'scanSuccess', isClick: false })
          const { data: scanData } = await axios.post(`${endpointUrls.solidityScan}/downloadResult`, { url: data.payload.scan_details.link })
          const scanReport: ScanReport = scanData.scan_report

          if (scanReport?.multi_file_scan_details?.length) {
            for (const template of scanReport.multi_file_scan_details) {
              if (template.metric_wise_aggregated_findings?.length) {
                const positions = []
                for (const details of template.metric_wise_aggregated_findings) {
                  for (const f of details.findings)
                    positions.push(`${f.line_nos_start[0]}:${f.line_nos_end[0]}`)
                }
                template.positions = JSON.stringify(positions)
              }
            }
            await api.call('terminal', 'logHtml', <SolScanTable scanReport={scanReport} fileName={fileName}/>)
          } else {
            await api.call('notification', 'modal', {
              id: 'SolidityScanError',
              title: <FormattedMessage id="solidity.solScan.errModalTitle" />,
              message: "Some error occurred! Please try again",
              okLabel: 'Close'
            })
          }
          ws.close()
        }
      })
    } else {
      await api.call('notification', 'toast', 'Error in processing data to scan')
      console.error(urlResponse.data && urlResponse.data.error ? urlResponse.data.error : urlResponse)
    }
  } catch (error) {
    await api.call('notification', 'toast', 'Error in processing data to scan. Please check the console for details.')
    console.error(error)
  }
}