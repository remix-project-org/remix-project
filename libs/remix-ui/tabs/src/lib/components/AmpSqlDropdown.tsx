import React from 'react'
import DropdownMenu, { MenuItem } from './DropdownMenu'
import { ArrowRightBig, NewScript, ScriptConfig } from '@remix-ui/tabs'

interface AmpSqlDropdownProps {
  disabled?: boolean
  plugin?: any
  onNotify?: (msg: string) => void
}

const AmpSqlDropdown: React.FC<AmpSqlDropdownProps> = ({ plugin, disabled, onNotify }) => {
  const items: MenuItem[] = [
    { label: 'Run Query and ask RemixAI', icon: <ArrowRightBig />, onClick: async () => {
      const path = await plugin.call('fileManager', 'getCurrentFile')
      const content = await plugin.call('fileManager', 'readFile', path)
      const authToken: string | undefined = await plugin.call('config', 'getEnv', 'AMP_QUERY_TOKEN');
      const baseUrl: string | undefined = await plugin.call('config', 'getEnv', 'AMP_QUERY_URL');
      // Perform the Amp query
      onNotify?.('Performing the query...')
      const data = await plugin.call('amp', 'performAmpQuery', content, baseUrl, authToken)
      const resultPath = `./amp/results/query-${Date.now()}.json`
      await plugin.call('fileManager', 'writeFile', resultPath, JSON.stringify(data, null, '\t'))
      const message = `You will find in the file located at ${resultPath} the output of the following query: ${content}. Sum up and Analyze this result.`
      // Show right side panel if it's hidden
      const isPanelHidden = await plugin.call('rightSidePanel', 'isPanelHidden')
      if (isPanelHidden) {
        await plugin.call('rightSidePanel', 'togglePanel')
      }
      await plugin.call('menuicons', 'select', 'remixaiassistant')

      plugin.call('remixaiassistant', 'chatPipe', message)
    }, borderBottom: true, dataId: 'run-askai-menu-item' },
    { label: 'Start generating a visualization', icon: <ArrowRightBig />, onClick: async () => {
      const path = await plugin.call('fileManager', 'getCurrentFile')
      const content = await plugin.call('fileManager', 'readFile', path)
      const authToken: string | undefined = await plugin.call('config', 'getEnv', 'AMP_QUERY_TOKEN');
      const baseUrl: string | undefined = await plugin.call('config', 'getEnv', 'AMP_QUERY_URL');
      // Perform the Amp query
      onNotify?.('Performing the query...')
      const data = await plugin.call('amp', 'performAmpQuery', content, baseUrl, authToken)
      const resultPath = `./amp/results/query-${Date.now()}.json`
      await plugin.call('fileManager', 'writeFile', resultPath, JSON.stringify(data, null, '\t'))
      const message = `I want to generate a visualization for this data. 1) Give me a very short summary of the data 2) let me explain you what I need. 3)
      call the tool amp_dataset_visualization with the description of what I need, the path ${resultPath} and the query ${content}.
      `
      
      // Show right side panel if it's hidden
      const isPanelHidden = await plugin.call('rightSidePanel', 'isPanelHidden')
      if (isPanelHidden) {
        await plugin.call('rightSidePanel', 'togglePanel')
      }      
      await plugin.call('menuicons', 'select', 'remixaiassistant')

      plugin.call('remixaiassistant', 'chatPipe', message)
    }, dataId: 'run-with-default-menu-item' },
    { label: 'Ask RemixAI about the current dataset manifest', icon: <ArrowRightBig />, onClick: async () => {
      onNotify?.('Getting the manifest')
      const path = await plugin.call('fileManager', 'getCurrentFile')
      const content = await plugin.call('fileManager', 'readFile', path)
      const message = `1) Extract the dataset name from the following query 2) use the Amp tool named amp_dataset_manifest to fetch the manifest of that dataset 3) give me information about that manifest, like which table are available, some query examples, etc... \n query: ${content}`
      // Show right side panel if it's hidden
      const isPanelHidden = await plugin.call('rightSidePanel', 'isPanelHidden')
      if (isPanelHidden) {
        await plugin.call('rightSidePanel', 'togglePanel')
      }
      await plugin.call('menuicons', 'select', 'remixaiassistant')

      plugin.call('remixaiassistant', 'chatPipe', message)
    }, dataId: 'run-with-default-menu-item' },
    { label: 'Download the list of public datasets list', icon: <ArrowRightBig />, onClick: async () => {
      const response = await plugin.call('amp', 'listDatasets')
      const path = `./amp/public-datasets.json`
      await plugin.call('fileManager', 'writeFile', path, JSON.stringify(await response.json(), null, '\t'));
      onNotify?.(`${path} updated.`)
    }, dataId: 'run-with-ethers6-menu-item' }
  ]

  return (
    <DropdownMenu
      items={items}
      disabled={disabled}
      triggerDataId="ampsql-dropdown-trigger"
      panelDataId="ampsql-dropdown-panel"
    />
  )
}

export default AmpSqlDropdown
