import axios from 'axios'
import { endpointUrls } from '@remix-endpoints-helper'
import { ScanReport } from '@remix-ui/helper'

function trackMatomoEvent(category: string, action: string, name?: string) {
  try {
    if (typeof window !== 'undefined' && (window as any)._matomoManagerInstance) {
      (window as any)._matomoManagerInstance.trackEvent(category, action, name)
    }
  } catch (error) {
    // Silent fail for tracking
  }
}

/**
 * Core function to perform Solidity scan and return the scan report
 * @param api - Remix API instance
 * @param compiledFileName - Name of the file to scan
 * @returns Promise with the scan report or throws error
 */
export const performSolidityScan = async (api: any, compiledFileName: string): Promise<ScanReport> => {
  const workspace = await api.call('filePanel', 'getCurrentWorkspace')
  const fileName = `${workspace.name}/${compiledFileName}`
  const filePath = `.workspaces/${fileName}`
  const file = await api.call('fileManager', 'readFile', filePath)

  const urlResponse = await axios.post(`${endpointUrls.solidityScan}/uploadFile`, { file, fileName })

  if (urlResponse.data.status !== 'success') {
    throw new Error(urlResponse.data.error || 'Failed to upload file to SolidityScan')
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${endpointUrls.solidityScanWebSocket}/solidityscan`)

    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('Scan timeout'))
    }, 300000) // 5 minute timeout

    ws.addEventListener('error', (error) => {
      clearTimeout(timeout)
      reject(new Error('WebSocket connection failed'))
    })

    ws.addEventListener('message', async (event) => {
      try {
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
          clearTimeout(timeout)
          ws.close()
          reject(new Error(data.payload.scan_status_err_message || 'Scan failed'))
        } else if (data.type === "scan_status" && data.payload.scan_status === "scan_done") {
          clearTimeout(timeout)
          const { data: scanData } = await axios.post(`${endpointUrls.solidityScan}/downloadResult`, { url: data.payload.scan_details.link })
          const scanReport: ScanReport = scanData.scan_report

          if (scanReport?.multi_file_scan_details?.length) {
            // Process positions for each template
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
            ws.close()
            resolve(scanReport)
          } else {
            ws.close()
            reject(new Error('No scan results found'))
          }
        }
      } catch (error) {
        clearTimeout(timeout)
        ws.close()
        reject(error)
      }
    })
  })
}

/**
 * Callback type for rendering scan results
 * @param scanReport - The scan report to render
 * @param fileName - The name of the scanned file
 * @returns JSX element or any renderable content for the terminal
 */
export type ScanReportRenderer = (scanReport: ScanReport, fileName: string) => any

/**
 * Handler for Solidity scan with notifications and terminal output
 * @param api - Remix API instance
 * @param compiledFileName - Name of the file to scan
 * @param modalMessage - Error modal title message
 * @param renderResults - Callback function to render the scan results (e.g., as JSX)
 */
export const handleSolidityScan = async (
  api: any,
  compiledFileName: string,
  modalMessage: string,
  renderResults: ScanReportRenderer
) => {
  await api.call('notification', 'toast', 'Processing data to scan...')
  trackMatomoEvent('solidityCompiler', 'solidityScan', 'initiateScan')

  try {
    const workspace = await api.call('filePanel', 'getCurrentWorkspace')
    const fileName = `${workspace.name}/${compiledFileName}`

    await api.call('notification', 'toast', 'Loading scan result in Remix terminal...')

    const scanReport = await performSolidityScan(api, compiledFileName)

    trackMatomoEvent('solidityCompiler', 'solidityScan', 'scanSuccess')
    const renderedResults = renderResults(scanReport, fileName)
    await api.call('terminal', 'logHtml', renderedResults)
  } catch (error) {
    trackMatomoEvent('solidityCompiler', 'solidityScan', 'scanFailed')
    await api.call('notification', 'modal', {
      id: 'SolidityScanError',
      title: modalMessage,
      message: error.message || 'Some error occurred! Please try again',
      okLabel: 'Close'
    })
    console.error(error)
  }
}