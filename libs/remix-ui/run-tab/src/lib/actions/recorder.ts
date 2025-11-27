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

const runScenario = (liveMode: boolean, plugin: RunTab, dispatch: React.Dispatch<any>, file: string, gasEstimationPrompt: (msg: string) => JSX.Element, passphrasePrompt: (msg: string) => JSX.Element, confirmDialogContent: MainnetPrompt) => {
  if (!file) return dispatch(displayNotification('Alert', 'Unable to run scenario, no specified scenario file', 'OK', null))

  plugin.fileManager.readFile(file).then((json) => {
    // TODO: there is still a UI dependency to remove here, it's still too coupled at this point to remove easily
    plugin.recorder.runScenario(
      liveMode,
      json,
      (error, continueTxExecution, cancelCb) => {
        continueHandler(dispatch, gasEstimationPrompt, error, continueTxExecution, cancelCb)
      }, (okCb, cancelCb) => {
        promptHandler(dispatch, passphrasePrompt, okCb, cancelCb)
      }, (msg) => {
        dispatch(displayNotification('Alert', msg, 'OK', null))
      }, (network, tx, gasEstimation, continueTxExecution, cancelCb) => {
        confirmationHandler(plugin, dispatch, confirmDialogContent, network, tx, gasEstimation, continueTxExecution, cancelCb)
      }, (msg: string) => {
        const log = logBuilder(msg)

        return terminalLogger(plugin, log)
      }, (error, abi, address, contractName) => {
        if (error) {
          return dispatch(displayNotification('Alert', error, 'OK', null))
        }
        addInstance(dispatch, { name: contractName, address, abi })
      })
  }).catch((error) => dispatch(displayNotification('Alert', error, 'OK', null)))
}

export const runCurrentScenario = (liveMode: boolean, plugin: RunTab, dispatch: React.Dispatch<any>, gasEstimationPrompt: (msg: string) => JSX.Element, passphrasePrompt: (msg: string) => JSX.Element, confirmDialogContent: MainnetPrompt) => {
  const file = plugin.config.get('currentFile')

  if (!file) return dispatch(displayNotification('Alert', 'A scenario file has to be selected', 'Ok', null))
  runScenario(liveMode, plugin, dispatch, file, gasEstimationPrompt, passphrasePrompt, confirmDialogContent)
}
