import { createNonClashingNameAsync, extractNameFromKey, logBuilder } from "@remix-ui/helper"
import { MainnetPrompt } from "../types"
import { RunTab } from "../types/run-tab"
import { addInstance } from "./actions"
import { confirmationHandler, continueHandler, promptHandler, terminalLogger } from "./deploy"
import { displayNotification } from "./payload"

const saveScenario = async (plugin: RunTab, newPath: string, provider, promptCb, cb) => {
  const txJSON = JSON.stringify(plugin.recorder.getAll(), (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  , 2)

  promptCb(async () => {
    try {
      await provider.set(newPath, txJSON)
      await plugin.fileManager.open(newPath)
    } catch (error) {
      if (error) return cb('Failed to create file. ' + newPath + ' ' + error)
    }
  })
}

export const storeScenario = async (plugin: RunTab, dispatch: React.Dispatch<any>, prompt: (msg: string, defaultValue: string) => JSX.Element) => {
  const path = plugin.fileManager.currentPath()
  const fileProvider = await plugin.fileManager.fileProviderOf(path)

  if (!fileProvider) return displayNotification('Alert', 'Invalid File Provider', 'OK', null)
  const newPath = await createNonClashingNameAsync(path + '/' + plugin.REACT_API.recorder.pathToScenario, plugin.fileManager)
  const newName = extractNameFromKey(newPath)

  saveScenario(plugin, newPath, fileProvider,
    (cb) => {
      dispatch(displayNotification('Save transactions as scenario', prompt('Transactions will be saved in a file under ' + path, newName), 'OK', 'Cancel', cb, null))
    },
    (error) => {
      if (error) return dispatch(displayNotification('Alert', error, 'OK', null))
    }
  )
}

const runScenario = async (liveMode: boolean, plugin: RunTab, dispatch: React.Dispatch<any>, file: string): Promise<{ abi: any, address: string, contractName: string }> => {
  if (!file) {
    dispatch(displayNotification('Alert', 'Unable to run scenario, no specified scenario file', 'OK', null))
    throw new Error('Unable to run scenario, no specified scenario file')
  }

  try {
    const json = await plugin.fileManager.readFile(file)
    // TODO: there is still a UI dependency to remove here, it's still too coupled at this point to remove easily
    const { abi, address, contractName } = await plugin.recorder.runScenario(liveMode, json)

    addInstance(dispatch, { name: contractName, address, abi })
    return { abi, address, contractName }
  } catch (error) {
    dispatch(displayNotification('Alert', error, 'OK', null))
    throw error
  }
}

export const runCurrentScenario = async (liveMode: boolean, plugin: RunTab, dispatch: React.Dispatch<any>): Promise<{ abi: any, address: string, contractName: string }> => {
  const file = plugin.config.get('currentFile')

  if (!file) {
    dispatch(displayNotification('Alert', 'A scenario file has to be selected', 'Ok', null))
    throw new Error('A scenario file has to be selected')
  }
  return await runScenario(liveMode, plugin, dispatch, file)
}
