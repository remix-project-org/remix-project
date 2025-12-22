import { Plugin } from '@remixproject/engine'

const profile = {
  name: 'chartjs',
  displayName: 'Chart.js',
  description: 'Chart.js visualization plugin',
  methods: ['generateChart'],
  events: [],
  version: '1.0.0'
}

export class ChartJsPlugin extends Plugin {
  constructor() {
    super(profile)
  }

  /**
   * Generate a chart using Chart.js
   * @param chartType - The type of chart to generate (e.g., 'bar', 'line', 'pie', 'doughnut', 'radar', 'polarArea', 'bubble', 'scatter')
   * @param dataTransformFn - A string representing a function that shapes the data to be Chart.js compliant
   *                          The function should take raw data as input and return Chart.js compatible data object
   * @param rawData - Path to the raw data to be transformed and visualized
   * @returns The URL of the generated chart image
   */
  async generateChart(chartType: string, dataTransformFn: string, rawDataPath: any, description: string, title: string) {
    let toastId
    let toastIdChart
    try {
      toastId = await this.call('notification', 'toast', 'The chart generation may take some time. Please be patient', 200000)
      // Create a canvas element for Chart.js
      const canvas = document.createElement('canvas')
      const id = `chart_${Date.now()}`
      canvas.setAttribute('id', id)
      canvas.width = 800
      canvas.height = 600
      canvas.style.display = 'none'
      document.body.appendChild(canvas)

      // Parse the data transformation function
      let transformedData
      try {
        let content = await this.call('fileManager', 'readFile', rawDataPath)
        content = JSON.parse(content)
        // Create a function from the string
        const transformFn = new Function('data', `return (${dataTransformFn})(data)`)
        try {
          transformedData = transformFn(content.data)
        } catch (e) {
          console.error(e)
        }
        if (!transformedData) {
          try {
            transformedData = transformFn(JSON.stringify(content.data))
          } catch (e) {
            console.error(e)
            throw e
          }
        }
        console.log(dataTransformFn, transformedData)
      } catch (e) {
        this.call('terminal', 'log', {
          type: 'error',
          value: `Failed to execute data transformation function: ${e.message}`
        })
        throw new Error(`Data transformation failed: ${e.message}`)
      }

      // Validate that transformedData has the required Chart.js structure
      if (!transformedData || typeof transformedData !== 'object') {
        throw new Error('Data transformation function must return an object')
      }

      // Get the canvas context
      const ctx = canvas.getContext('2d')

      // Import Chart.js dynamically
      // @ts-ignore
      const Chart = window.Chart || (await import('chart.js/auto')).default

      console.log({
        type: chartType,
        data: transformedData,
        options: {
          responsive: false,
          animation: false,
          plugins: {
            title: {
              display: true,
              text: transformedData.title || 'Chart'
            }
          }
        }
      })
      // Create the chart
      const chart = new Chart(ctx, {
        type: chartType,
        data: transformedData,
        options: {
          responsive: false,
          animation: false,
          plugins: {
            title: {
              display: true,
              text: transformedData.title || 'Chart'
            }
          }
        }
      })

      // Wait for chart to render
      await new Promise(resolve => setTimeout(resolve, 500))

      toastIdChart = await this.call('notification', 'toast', 'The chart is ready, publishing it...', 200000)

      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob)
        }, 'image/png')
      })

      // Upload to IPFS
      const formData = new FormData()
      formData.append('file', blob, 'chart.png')
      const data = await this.postIpfs(formData)

      // Wait for IPFS availability
      try {
        await this.checkAvailability(data.gatewayUrl)
      } catch (e) {
        this.call('terminal', 'log', {
          type: 'warning',
          value: 'IPFS gateway might be slow to respond, but the chart was uploaded successfully'
        })
      }

      await this.call('notification', 'hideToaster', toastIdChart)
      toastIdChart = await this.call('notification', 'toast', 'Getting the markdown file ready...', 200000)

      // Clean up
      chart.destroy()
      document.body.removeChild(canvas)

      // Save markdown file with the chart
      title = title || `${chartType}_chart_${Date.now()}`
      const markdownFile = await this.saveMdFile(title, data.gatewayUrl, description)

      await this.call('notification', 'hideToaster', toastIdChart)
      await this.call('notification', 'hideToaster', toastId)
      this.call('notification', 'toast', 'The visualization and the markdown file has been created. The visualization will be visible in short time.')
      return { pngUrl: data.gatewayUrl, markdownFile }
    } catch (error) {
      this.call('terminal', 'log', {
        type: 'error',
        value: `Chart generation failed: ${error.message}`
      })
      await this.call('notification', 'hideToaster', toastId)
      await this.call('notification', 'hideToaster', toastIdChart)
      throw error
    }
  }

  async saveMdFile(title: string, chartUrl: string, description: string) {
    try {
      const mdFile = `./charts/${title.replace(/ /g, '_')}.md`
      const mdContent = `## ${title}
${description}
![Chart image](${chartUrl})`
      await this.call('fileManager', 'writeFile', mdFile, mdContent)
      return mdFile
    } catch (e) {
      this.call('terminal', 'log', {
        type: 'error',
        value: `Unable to save MD file: ${e.message}`
      })
    }
  }

  async postIpfs(content: FormData) {
    const REMIX_ENDPOINT_IPFS = 'https://quickdapp-ipfs.api.remix.live'
    const responseIpfs = await fetch(`${REMIX_ENDPOINT_IPFS}/upload`, {
      method: 'POST',
      body: content
    })

    return await responseIpfs.json()
  }

  async checkAvailability(url: string): Promise<void> {
    const INTERVAL_MS = 4000
    const TIMEOUT_MS = 60000
    const controller = new AbortController()
    const startTime = Date.now()

    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const timeoutId = setTimeout(() => controller.abort(), 5000)
          const res = await fetch(url, { method: 'HEAD', signal: controller.signal })
          clearTimeout(timeoutId)

          if (res.ok) {
            console.log(`✅ Chart is available on gateway: ${url}`)
            resolve()
            return
          }

          console.log(`⏳ Not available yet (status ${res.status})`)
        } catch (err) {
          console.log('⏳ Gateway not responding yet')
        }

        if (Date.now() - startTime > TIMEOUT_MS) {
          console.error('❌ Timed out waiting for chart availability')
          reject(new Error('Timed out waiting for chart availability'))
          return
        }

        setTimeout(poll, INTERVAL_MS)
      }

      poll()
    })
  }
}

const transformData = (content: any, dataTransformFn: string) => {
  const transformFn = new Function('data', `return (${dataTransformFn})(data)`)
  return transformFn(content)
}
