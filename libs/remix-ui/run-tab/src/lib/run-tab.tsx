// eslint-disable-next-line no-use-before-define
import React, { Fragment, useCallback, useEffect, useReducer, useState } from 'react'
import semver from 'semver'
import { FormattedMessage } from 'react-intl'
import { ModalDialog } from '@remix-ui/modal-dialog'
// eslint-disable-next-line no-unused-vars
import { Toaster } from '@remix-ui/toaster'
import { ContractDropdownUI } from './components/contractDropdownUI'
import { InstanceContainerUI } from './components/instanceContainerUI'
import { RecorderUI } from './components/recorderCardUI'
import { SettingsUI } from './components/settingsUI'
import { Modal, Network, RunTabProps, Tx } from './types'
import { ContractData } from '@remix-project/core-plugin'
import { runTabInitialState, runTabReducer } from './reducers/runTab'
import {
  initRunTab,
  setAccountAddress,
  setUnitValue,
  setGasFeeAmount,
  setExecutionEnvironment,
  hideToaster,
  createNewAddress,
  setPassphraseModal,
  setMatchPassphraseModal,
  createNewSmartAccount,
  internalDelegationAuthorization,
  signMessage,
  fetchSelectedContract,
  createNewInstance,
  setSendValue,
  setBaseFeePerGas,
  setConfirmSettings,
  setGasPrice,
  setGasPriceStatus,
  setMaxFee,
  setMaxPriorityFee,
  unpinPinnedInstance,
  pinUnpinnedInstance,
  removeInstances,
  removeSingleInstance,
  getExecutionContext,
  executeTransactions,
  loadFromAddress,
  storeNewScenario,
  runScenario,
  setScenarioPath,
  getFuncABIValues,
  setNetworkName,
  updateSelectedContract,
  syncContracts,
  isValidProxyAddress,
  isValidProxyUpgrade,
  addFile
} from './actions'
import './css/run-tab.css'
import { PublishToStorage } from '@remix-ui/publish-to-storage'
import { PassphrasePrompt } from './components/passphrase'
import { MainnetPrompt } from './components/mainnet'
import { ScenarioPrompt } from './components/scenario'
import { setIpfsCheckedState, setRemixDActivated } from './actions/payload'
import { ChainCompatibleInfo, getCompatibleChain, getCompatibleChains, HardFork, isChainCompatible, isChainCompatibleWithAnyFork } from './actions/evmmap'

export type CheckStatus = 'Passed' | 'Failed' | 'Not Found'

export function RunTabUI(props: RunTabProps) {
  const { plugin } = props
  const [focusModal, setFocusModal] = useState<Modal>({
    hide: true,
    title: '',
    message: '',
    okLabel: '',
    okFn: () => {},
    cancelLabel: '',
    cancelFn: () => {}
  })
  const [modals, setModals] = useState<Modal[]>([])
  const [focusToaster, setFocusToaster] = useState<string>('')
  const [toasters, setToasters] = useState<string[]>([])
  const [publishData, setPublishData] = useState<{
    storage: 'ipfs' | 'swarm'
    contract: ContractData
  }>({
    storage: null,
    contract: null
  })
  const initialState = props.initialState || runTabInitialState

  initialState.selectExEnv = plugin.blockchain.getProvider()
  const [runTab, dispatch] = useReducer(runTabReducer, initialState)
  const REACT_API = { runTab }
  const currentfile = plugin.config.get('currentFile')
  const [solcVersion, setSolcVersion] = useState<{version: string, canReceive: boolean}>({ version: '', canReceive: true })
  const [evmCheckComplete, setEvmCheckComplete] = useState(false)

  const getVersion = () => {
    let version = '0.8.25'
    try {
      const regVersion = window.location.href.match(/soljson-v(.*)\+commit/g)
      if (regVersion && regVersion[1]) version = regVersion[1]
      if (semver.lt(version, '0.6.0')) {
        setSolcVersion({ version: version, canReceive: false })
      } else {
        setSolcVersion({ version: version, canReceive: true })
      }
    } catch (e) {
      setSolcVersion({ version, canReceive: true })
    }
  }

  const getCompilerDetails = async () => await checkEvmChainCompatibility()

  const returnCompatibleChain = async (evmVersion: HardFork, targetChainId: number) => {
    const result = getCompatibleChain(evmVersion ?? 'paris', targetChainId) // using paris evm as a default fallback version
    return result
  }

  const checkEvmChainCompatibilityOkFunction = async (fetchDetails: ChainCompatibleInfo) => {
    const compilerParams = {
      evmVersion: fetchDetails.evmVersion,
      optimize: false,
      language: 'Solidity',
      runs: '200',
      version: fetchDetails.minCompilerVersion
    }
    await plugin.call('solidity', 'setCompilerConfig', compilerParams)
    const currentFile = await plugin.call('fileManager', 'getCurrentFile')
    await plugin.call('solidity', 'compile', currentFile)
    setEvmCheckComplete(true)
  }

  const checkEvmChainCompatibility = async () => {
    const fetchDetails = await plugin.call('solidity', 'getCompilerQueryParameters')
    const compilerState = await plugin.call('solidity', 'getCompilerState')

    // if no contract file is open, don't do anything
    if (compilerState.target !== null) {
      const targetChainId = runTab.chainId
      const ideDefault = fetchDetails && fetchDetails.evmVersion !== null ? fetchDetails.evmVersion : 'osaka'
      const IsCompatible = isChainCompatible(ideDefault, targetChainId)
      const chain = await returnCompatibleChain(ideDefault, targetChainId)
      if (chain === undefined) {
        return 'Not Found'
      } else {
        if (!IsCompatible) {
        //show modal
          plugin.call('notification', 'modal', {
            id: 'evm-chainId-incompatible',
            title: 'Incompatible EVM for the selected chain',
            message: <div className="px-3">
              <p>The smart contract has not been compiled with an EVM version that is compatible with the selected chain.</p>
              <ul className="px-3">
                <li>Have Remix switch to a compatible EVM version for this chain and recompile the contract.</li>
                <li>Cancel to keep the current EVM version.</li>
              </ul>
              <p>To manually change the EVM version, go to the Advanced Configurations section of the Solidity compiler.</p>
            </div>,
            modalType: 'modal',
            okLabel: 'Switch EVM and Recompile',
            cancelLabel: 'Cancel',
            okFn: () => checkEvmChainCompatibilityOkFunction(chain),
            cancelFn: () => {}
          })
          return 'Failed'
        } else {
          return 'Passed'
        }
      }
    }
  }

  useEffect(() => {
    if (!props.initialState) {
      initRunTab(plugin, true)(dispatch)
      plugin.onInitDone()
    } else {
      initRunTab(plugin, false)(dispatch)
    }
  }, [plugin])

  useEffect(() => {
    plugin.onReady(runTab)
    plugin.call('pluginStateLogger', 'logPluginState', 'udapp', runTab)
  }, [REACT_API])

  useEffect(() => {
    if (modals.length > 0) {
      setFocusModal(() => {
        const focusModal = {
          hide: false,
          title: modals[0].title,
          message: modals[0].message,
          okLabel: modals[0].okLabel,
          okFn: modals[0].okFn,
          cancelLabel: modals[0].cancelLabel,
          cancelFn: modals[0].cancelFn,
          okBtnClass: modals[0].okBtnClass,
          cancelBtnClass: modals[0].cancelBtnClass
        }
        return focusModal
      })
      const modalList = modals.slice()

      modalList.shift()
      setModals(modalList)
    }
  }, [modals])

  useEffect(() => {
    if (runTab.notification.title) {
      modal(
        runTab.notification.title,
        runTab.notification.message,
        runTab.notification.labelOk,
        runTab.notification.actionOk,
        runTab.notification.labelCancel,
        runTab.notification.actionCancel
      )
    }
  }, [runTab.notification])

  useEffect(() => {
    if (toasters.length > 0) {
      setFocusToaster(() => {
        return toasters[0]
      })
      const toasterList = toasters.slice()

      toasterList.shift()
      setToasters(toasterList)
    }
  }, [toasters])

  useEffect(() => {
    if (runTab.popup) {
      toast(runTab.popup)
    }
  }, [runTab.popup])

  useEffect(() => {
    if (runTab.selectExEnv.includes('injected') &&
      Object.entries(runTab.accounts.loadedAccounts).length === 0 &&
    runTab.accounts.selectedAccount.length > 0) {
      // switch to vm-cancum because no account is loaded from injected provider
      const context = plugin.blockchain.defaultPinnedProviders[0] // vm-cancun
      setExecutionEnvironment({ context, fork: '' })
    }
  }, [runTab.accounts.loadedAccounts])

  const setCheckIpfs = (value: boolean) => {
    dispatch(setIpfsCheckedState(value))
  }

  const modal = (
    title: string,
    message: string | JSX.Element,
    okLabel: string,
    okFn: () => void,
    cancelLabel?: string,
    cancelFn?: () => void,
    okBtnClass?: string,
    cancelBtnClass?: string
  ) => {
    setModals((modals) => {
      modals.push({
        message,
        title,
        okLabel,
        okFn,
        cancelLabel,
        cancelFn,
        okBtnClass,
        cancelBtnClass
      })
      return [...modals]
    })
  }

  const handleHideModal = () => {
    setFocusModal((modal) => {
      return { ...modal, hide: true, message: null }
    })
  }

  const handleToaster = () => {
    setFocusToaster('')
    hideToaster()
  }

  const toast = (toasterMsg: string) => {
    setToasters((messages) => {
      messages.push(toasterMsg)
      return [...messages]
    })
  }

  const resetStorage = () => {
    setPublishData({
      storage: null,
      contract: null
    })
  }

  const publishToStorage = (storage: 'ipfs' | 'swarm', contract: ContractData) => {
    setPublishData({
      storage,
      contract
    })
  }

  const gasEstimationPrompt = (msg: string) => {
    return (
      <div>
        <FormattedMessage id="udapp.gasEstimationPromptText" /> <br />
        {msg}
      </div>
    )
  }

  const passphrasePrompt = (message: string) => {
    return <PassphrasePrompt message={message} setPassphrase={setPassphraseModal} defaultValue={runTab.passphrase} />
  }

  const scenarioPrompt = (message: string, defaultValue) => {
    return <ScenarioPrompt message={message} setScenarioPath={setScenarioPath} defaultValue={defaultValue} />
  }

  const mainnetPrompt = (
    tx: Tx,
    network: Network,
    amount: string,
    gasEstimation: string,
    gasFees: (maxFee: string, cb: (txFeeText: string, priceStatus: boolean) => void) => void,
    determineGasPrice: (cb: (txFeeText: string, gasPriceValue: string, gasPriceStatus: boolean) => void) => void
  ) => {
    return (
      <MainnetPrompt
        init={determineGasPrice}
        network={network}
        tx={tx}
        amount={amount}
        gasEstimation={gasEstimation}
        setNewGasPrice={gasFees}
        updateBaseFeePerGas={setBaseFeePerGas}
        updateConfirmSettings={setConfirmSettings}
        updateGasPrice={setGasPrice}
        updateGasPriceStatus={setGasPriceStatus}
        updateMaxFee={setMaxFee}
        updateMaxPriorityFee={setMaxPriorityFee}
        maxFee={runTab.maxFee}
        maxPriorityFee={runTab.maxPriorityFee}
      />
    )
  }

  return (
    <Fragment>
      <div className="udapp_runTabView run-tab" id="runTabView" data-id="runTabView">
        <div className="list-group pb-4 list-group-flush">
          <SettingsUI
            addFile={addFile}
            networkName={runTab.networkName}
            personalMode={runTab.personalMode}
            selectExEnv={runTab.selectExEnv}
            EvaluateEnvironmentSelection={checkEvmChainCompatibility}
            accounts={runTab.accounts}
            setAccount={setAccountAddress}
            setUnit={setUnitValue}
            sendValue={runTab.sendValue}
            setSendValue={setSendValue}
            sendUnit={runTab.sendUnit}
            gasLimit={runTab.gasLimit}
            setGasFee={setGasFeeAmount}
            providers={runTab.providers}
            runTabPlugin={plugin}
            setExecutionContext={setExecutionEnvironment}
            createNewBlockchainAccount={createNewAddress}
            createNewSmartAccount={createNewSmartAccount}
            delegationAuthorization={internalDelegationAuthorization}
            setPassphrase={setPassphraseModal}
            setMatchPassphrase={setMatchPassphraseModal}
            modal={modal}
            tooltip={toast}
            signMessageWithAddress={signMessage}
            passphrase={runTab.passphrase}
            udappState={runTab}
            envLabel={runTab.selectExEnv}
          />
          <ContractDropdownUI
            selectedAccount={runTab.accounts.selectedAccount}
            syncContracts={syncContracts}
            exEnvironment={runTab.selectExEnv}
            contracts={runTab.contracts}
            getSelectedContract={fetchSelectedContract}
            modal={modal}
            passphrase={runTab.passphrase}
            setPassphrase={setPassphraseModal}
            createInstance={createNewInstance}
            ipfsCheckedState={runTab.ipfsChecked}
            setIpfsCheckedState={setCheckIpfs}
            publishToStorage={publishToStorage}
            gasEstimationPrompt={gasEstimationPrompt}
            passphrasePrompt={passphrasePrompt}
            mainnetPrompt={mainnetPrompt}
            tooltip={toast}
            loadAddress={loadFromAddress}
            networkName={runTab.networkName}
            setNetworkName={setNetworkName}
            setSelectedContract={updateSelectedContract}
            remixdActivated={runTab.remixdActivated}
            isValidProxyAddress={isValidProxyAddress}
            isValidProxyUpgrade={isValidProxyUpgrade}
            proxy={runTab.proxy}
            solCompilerVersion={solcVersion}
            setCompilerVersion={setSolcVersion}
            getCompilerVersion={getVersion}
            getCompilerDetails={getCompilerDetails}
            evmCheckComplete={evmCheckComplete}
            setEvmCheckComplete={setEvmCheckComplete}
            plugin={plugin}
            runTabState={runTab}
          />
          <RecorderUI
            plugin={plugin}
            gasEstimationPrompt={gasEstimationPrompt}
            passphrasePrompt={passphrasePrompt}
            mainnetPrompt={mainnetPrompt}
            storeScenario={storeNewScenario}
            runCurrentScenario={runScenario}
            scenarioPrompt={scenarioPrompt}
            count={runTab.recorder.transactionCount}
            currentFile={currentfile}
          />
          <InstanceContainerUI
            plugin={plugin}
            getCompilerDetails={getCompilerDetails}
            evmCheckComplete={evmCheckComplete}
            runTabState={runTab}
            instances={runTab.instances}
            clearInstances={removeInstances}
            unpinInstance={unpinPinnedInstance}
            pinInstance={pinUnpinnedInstance}
            removeInstance={removeSingleInstance}
            getContext={getExecutionContext}
            gasEstimationPrompt={gasEstimationPrompt}
            passphrasePrompt={passphrasePrompt}
            mainnetPrompt={mainnetPrompt}
            runTransactions={executeTransactions}
            sendValue={runTab.sendValue}
            solcVersion={solcVersion}
            getVersion={getVersion}
            getFuncABIInputs={getFuncABIValues}
            exEnvironment={runTab.selectExEnv}
            editInstance={(addressOrInstance, abi, name, devdoc, metadata, htmlTemplate) => {

              const payload = {
                address: '',
                abi: null,
                name: '',
                network: runTab.networkName,
                devdoc: null,
                methodIdentifiers: null,
                solcVersion: '',
                htmlTemplate: null
              }

              let targetPlugin = 'quick-dapp'

              try {
                if (typeof addressOrInstance === 'object' && addressOrInstance !== null) {
                  targetPlugin = 'quick-dapp'

                  const instance = addressOrInstance as any
                  const { metadata: metaFromInst, abi: abiFromInst, object } = instance.contractData || {}

                  payload.address = instance.address
                  payload.abi = abiFromInst
                  payload.name = instance.name

                  if (object) {
                    payload.devdoc = object.devdoc
                    payload.methodIdentifiers = object.evm?.methodIdentifiers
                  }

                  if (metaFromInst) {
                    try {
                      payload.solcVersion = JSON.parse(metaFromInst).compiler.version
                    } catch (e) {
                      console.warn('[RunTab] Failed to parse solcVersion from V1 metadata', e)
                    }
                  }

                } else {
                  targetPlugin = 'quick-dapp-v2'

                  payload.address = addressOrInstance as string
                  payload.abi = abi
                  payload.name = name
                  payload.devdoc = devdoc
                  payload.htmlTemplate = htmlTemplate

                  if (metadata) {
                    try {
                      payload.solcVersion = JSON.parse(metadata).compiler.version
                    } catch (e) {
                      console.warn('[RunTab] Failed to parse solcVersion from V2 metadata', e)
                    }
                  }
                }

                plugin.call(targetPlugin, 'edit', payload)

              } catch (error) {
                console.error('[RunTab] Critical Error in editInstance:', error)
              }
            }}
          />
        </div>
      </div>
      <ModalDialog id="udappNotify" {...focusModal} handleHide={handleHideModal} />
      <Toaster message={focusToaster} handleHide={handleToaster} />
      <PublishToStorage id="udapp" api={plugin} resetStorage={resetStorage} storage={publishData.storage} contract={publishData.contract} />
    </Fragment>
  )
}
