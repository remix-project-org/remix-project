// eslint-disable-next-line no-use-before-define
import React, { useContext, useEffect, useRef, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { ContractDropdownProps, DeployMode } from '../types'
import { ContractData, FuncABI, OverSizeLimit } from '@remix-project/core-plugin'
import * as ethJSUtil from '@ethereumjs/util'
import { ContractGUI } from './contractGUI'
import { CustomTooltip, deployWithProxyMsg, upgradeWithProxyMsg } from '@remix-ui/helper'
import { TrackingContext } from '@remix-ide/tracking'
import { UdappEvent } from '@remix-api'
import { VerificationSettingsUI } from './verificationSettingsUI'

export function ContractDropdownUI(props: ContractDropdownProps) {
  const intl = useIntl()
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends UdappEvent = UdappEvent>(event: T) => baseTrackEvent?.<T>(event)
  const [abiLabel, setAbiLabel] = useState<{
    display: string
    content: string
  }>({
    display: '',
    content: '',
  })
  const [atAddressOptions, setAtAddressOptions] = useState<{
    title: string | JSX.Element
    disabled: boolean
  }>({
    title: <FormattedMessage id="udapp.atAddressOptionsTitle1" />,
    disabled: true,
  })
  const [loadedAddress, setLoadedAddress] = useState<string>('')
  const [contractOptions, setContractOptions] = useState<{
    title: string | JSX.Element
    disabled: boolean
  }>({
    title: <FormattedMessage id="udapp.contractOptionsTitle1" />,
    disabled: true,
  })
  const [loadedContractData, setLoadedContractData] = useState<ContractData>(null)
  const [constructorInterface, setConstructorInterface] = useState<FuncABI>(null)
  const [constructorInputs, setConstructorInputs] = useState(null)
  const [addressIsValid, setaddressIsValid] = useState(true)
  const [compilerName, setCompilerName] = useState<string>('')
  const contractsRef = useRef<HTMLSelectElement>(null)
  const atAddressValue = useRef<HTMLInputElement>(null)
  const { contractList, loadType, currentFile, compilationSource, currentContract, compilationCount, deployOptions } = props.contracts
  const [isVerifyChecked, setVerifyChecked] = useState<boolean>(false)
  const [isNetworkSupported, setNetworkSupported] = useState<boolean>(false)

  useEffect(() => {
    const checkSupport = async () => {
      if (props.plugin) {
        const supportedChain = await getSupportedChain(props.plugin)
        const isSupported = !!supportedChain
        setNetworkSupported(isSupported)

        if (isSupported) {
          const saved = window.localStorage.getItem('deploy-verify-contract-checked')
          setVerifyChecked(saved !== null ? JSON.parse(saved) : true)
        } else {
          setVerifyChecked(false)
        }
      }
    };
    checkSupport()
  }, [props.networkName])

  useEffect(() => {
    enableContractNames(Object.keys(props.contracts.contractList).length > 0)
  }, [Object.keys(props.contracts.contractList).length])

  useEffect(() => {
    enableAtAddress(false)
    setAbiLabel({
      display: 'none',
      content: intl.formatMessage({ id: 'udapp.abiFileSelected' }),
    })
  }, [])

  useEffect(() => {
    if (props.exEnvironment && props.networkName) {
      const savedConfig = window.localStorage.getItem(`ipfs/${props.exEnvironment}/${props.networkName}`)
      const isCheckedIPFS = savedConfig === 'true' ? true : false // eslint-disable-line

      props.setIpfsCheckedState(isCheckedIPFS)
    }
  }, [props.exEnvironment, props.networkName])

  useEffect(() => {
    if (!loadFromAddress || !ethJSUtil.isValidAddress(loadedAddress)) enableAtAddress(false)
  }, [loadedAddress])

  useEffect(() => {
    if (/.(.abi)$/.exec(currentFile) && '' !== atAddressValue.current.value) {
      setAbiLabel({
        display: 'block',
        content: currentFile,
      })
      enableAtAddress(true)
    } else if (isContractFile(currentFile)) {
      setAbiLabel({
        display: 'none',
        content: '',
      })
      if (!currentContract) enableAtAddress(false)
      if (currentContract && loadedAddress) enableAtAddress(true)
    } else {
      setAbiLabel({
        display: 'none',
        content: '',
      })
      if (!currentContract) enableAtAddress(false)
    }
    initSelectedContract()
  }, [loadType, currentFile, compilationCount])

  useEffect(() => {
    if (currentContract && contractList[currentFile]) {
      const contract = contractList[currentFile].find((contract) => contract.alias === currentContract)

      if (contract) {
        const loadedContractData = props.getSelectedContract(currentContract, contract.compiler)

        if (loadedContractData) {
          setLoadedContractData(loadedContractData)
          setConstructorInterface(loadedContractData.getConstructorInterface())
          setConstructorInputs(loadedContractData.getConstructorInputs())
        }
      }
    }
  }, [currentContract, compilationCount])

  useEffect(() => {
    initSelectedContract()
    updateCompilerName()
  }, [contractList])

  useEffect(() => {
    // if the file change the ui is already feed with another bunch of contracts.
    // we also need to update the state
    const contracts = contractList[currentFile]
    if (contracts && contracts.length > 0) {
      props.setSelectedContract(contracts[0].alias)
    }
    updateCompilerName()
  }, [currentFile])

  const initSelectedContract = () => {
    const contracts = contractList[currentFile]

    if (contracts && contracts.length > 0) {
      const contract = contracts.find((contract) => contract.alias === currentContract)

      if (!currentContract) props.setSelectedContract(contracts[0].alias)
      else if (!contract) props.setSelectedContract(currentContract)
      // TODO highlight contractlist box with css.
    }
  }

  const isContractFile = (file) => {
    return (
      /.(.sol)$/.exec(file) ||
      /.(.vy)$/.exec(file) || // vyper
      /.(.lex)$/.exec(file) || // lexon
      /.(.contract)$/.exec(file)
    )
  }

  const enableAtAddress = (enable: boolean) => {
    if (enable) {
      setAtAddressOptions({
        disabled: false,
        title: (
          <span className="text-start">
            <FormattedMessage id="udapp.atAddressOptionsTitle2" values={{ br: <br /> }} />
          </span>
        ),
      })
    } else {
      setAtAddressOptions({
        disabled: true,
        title: loadedAddress ? (
          <FormattedMessage id="udapp.atAddressOptionsTitle3" />
        ) : (
          <span className="text-start">
            <FormattedMessage id="udapp.atAddressOptionsTitle4" values={{ br: <br /> }} />
          </span>
        ),
      })
    }
  }

  const enableContractNames = (enable: boolean) => {
    if (enable) {
      setContractOptions({
        disabled: false,
        title: <FormattedMessage id="udapp.contractOptionsTitle2" />,
      })
    } else {
      setContractOptions({
        disabled: true,
        title:
        ['sol', 'vyper', 'lexon', 'contract'].includes(loadType) ? (
          <FormattedMessage id="udapp.contractOptionsTitle3" />
        ) : (
          <span className="text-start">
            <FormattedMessage id="udapp.contractOptionsTitle4" values={{ br: <br /> }} />
          </span>
        ),
      })
    }
  }

  const clickCallback = (inputs, value, deployMode?: DeployMode[]) => {
    createInstance(loadedContractData, value, deployMode)
  }

  const createInstance = (selectedContract, args, deployMode?: DeployMode[]) => {
    if (selectedContract.bytecodeObject.length === 0) {
      return props.modal(intl.formatMessage({ id: 'udapp.alert' }), intl.formatMessage({ id: 'udapp.thisContractMayBeAbstract' }), intl.formatMessage({ id: 'udapp.ok' }), () => {})
    }
    if (selectedContract.name !== currentContract && selectedContract.name === 'ERC1967Proxy') selectedContract.name = currentContract
    const isProxyDeployment = (deployMode || []).find((mode) => mode === 'Deploy with Proxy')
    const isContractUpgrade = (deployMode || []).find((mode) => mode === 'Upgrade with Proxy')

    if (isProxyDeployment) {
      props.modal(
        'Deploy Implementation & Proxy (ERC1967)',
        deployWithProxyMsg(),
        intl.formatMessage({ id: 'udapp.proceed' }),
        () => {
          props.createInstance(
            loadedContractData,
            props.gasEstimationPrompt,
            props.passphrasePrompt,
            props.publishToStorage,
            props.mainnetPrompt,
            isOverSizePrompt,
            args,
            deployMode,
            isVerifyChecked
          )
        },
        intl.formatMessage({ id: 'udapp.cancel' }),
        () => {}
      )
    } else if (isContractUpgrade) {
      props.modal(
        'Deploy Implementation & Update Proxy',
        upgradeWithProxyMsg(),
        intl.formatMessage({ id: 'udapp.proceed' }),
        () => {
          props.createInstance(
            loadedContractData,
            props.gasEstimationPrompt,
            props.passphrasePrompt,
            props.publishToStorage,
            props.mainnetPrompt,
            isOverSizePrompt,
            args,
            deployMode,
            isVerifyChecked
          )
        },
        intl.formatMessage({ id: 'udapp.cancel' }),
        () => {}
      )
    } else {
      props.createInstance(loadedContractData, props.gasEstimationPrompt, props.passphrasePrompt, props.publishToStorage, props.mainnetPrompt, isOverSizePrompt, args, deployMode, isVerifyChecked)
    }
  }

  const atAddressChanged = (event) => {
    const value = event.target.value
    if (!value) {
      enableAtAddress(false)
    } else {
      if (['sol', 'vyper', 'lexon', 'contract', 'abi'].includes(loadType)) {
        enableAtAddress(true)
      } else {
        enableAtAddress(false)
      }
    }
    setLoadedAddress(value)
  }

  const loadFromAddress = () => {
    let address = loadedAddress
    if (address == '') return
    try {
      if (!ethJSUtil.isValidChecksumAddress(address)) {
        props.tooltip(checkSumWarning())
        address = ethJSUtil.toChecksumAddress(address)
      }
      props.loadAddress(loadedContractData, address)
    } catch (e) {
      console.log('Invalid Address input: ', e)
      setaddressIsValid(false)
      return
    }
    setaddressIsValid(true)
  }

  const handleVerifyCheckedChange = (isChecked: boolean) => {
    setVerifyChecked(isChecked)
    window.localStorage.setItem('deploy-verify-contract-checked', JSON.stringify(isChecked))
  }

  const updateCompilerName = () => {
    if (contractsRef.current.value) {
      contractList[currentFile].forEach((contract) => {
        if (contract.alias === contractsRef.current.value) {
          setCompilerName(contract.compilerName)
          setContractOptions({
            disabled: false,
            title: <FormattedMessage id="udapp.contractOptionsTitle2" />,
          })
        }
      })
    } else {
      setCompilerName('')
      setContractOptions({
        title: <FormattedMessage id="udapp.contractOptionsTitle1" />,
        disabled: true,
      })
    }
  }

  const handleContractChange = (e) => {
    const value = e.target.value
    updateCompilerName()
    props.setSelectedContract(value)
  }

  const isValidProxyUpgrade = (proxyAddress: string) => {
    const solcVersion = loadedContractData.metadata ? JSON.parse(loadedContractData.metadata).compiler.version : ''
    return props.isValidProxyUpgrade(proxyAddress, loadedContractData.contractName || loadedContractData.name, loadedContractData.compiler.source, loadedContractData.compiler.data, solcVersion)
  }

  const getSupportedChain = async (plugin: any): Promise<any> => {
    try {
      const response = await fetch('https://chainid.network/chains.json')
      if (!response.ok) return null
      const allChains = await response.json()

      const status = plugin.blockchain.getCurrentNetworkStatus()
      if (status.error || !status.network) return null

      const currentChainId = parseInt(status.network.id)
      return allChains.find(chain => chain.chainId === currentChainId) || null
    } catch (e) {
      console.error(e)
      return null
    }
  }

  const checkSumWarning = () => {
    return (
      <span className="text-start">
        <FormattedMessage
          id="udapp.checkSumWarning"
          values={{
            br: <br />,
            a: (
              <a href="https://eips.ethereum.org/EIPS/eip-55" target="_blank" rel="noreferrer">
                EIP-55
              </a>
            ),
          }}
        />
      </span>
    )
  }

  const isOverSizePrompt = (values: OverSizeLimit) => {
    return (
      <div>
        {values.overSizeEip170 && (
          <div>
            <FormattedMessage
              id="udapp.isOverSizePromptEip170"
              values={{
                br: <br />,
                a: (
                  <a href="https://eips.ethereum.org/EIPS/eip-170" target="_blank" rel="noreferrer">
                    eip-170
                  </a>
                ),
              }}
            />
          </div>
        )}
        {values.overSizeEip3860 && (
          <div>
            <FormattedMessage
              id="udapp.isOverSizePromptEip3860"
              values={{
                br: <br />,
                a: (
                  <a href="https://eips.ethereum.org/EIPS/eip-3860" target="_blank" rel="noreferrer">
                    eip-3860
                  </a>
                ),
              }}
            />
          </div>
        )}
      </div>
    )
  }

  let evmVersion = null
  try {
    if (loadedContractData && loadedContractData.metadata) {
      evmVersion = JSON.parse(loadedContractData.metadata).settings.evmVersion
    }
  } catch (err) {}
  return (
    <div className="udapp_container mb-2" data-id="contractDropdownContainer">
      <div className="d-flex justify-content-between">
        <div className="d-flex justify-content-between align-items-end">
          <label className="udapp_settingsLabel pe-1">
            <FormattedMessage id="udapp.contract" />
          </label>
          {compilerName && compilerName !== '' && compilerName !== 'remix' && (
            <label className="udapp_settingsCompiledBy badge text-bg-secondary" data-id="udappCompiledBy">
              <FormattedMessage
                id="udapp.compiledBy"
                values={{
                  compilerName: <span className="text-capitalize">{compilerName}</span>,
                }}
              />
            </label>
          )}
          {props.remixdActivated ? (
            <CustomTooltip
              placement={'right'}
              tooltipClasses="text-wrap text-start"
              tooltipId="info-sync-compiled-contract"
              tooltipText={
                <span className="text-start">
                  <FormattedMessage id="udapp.infoSyncCompiledContractTooltip" values={{ br: <br /> }} />
                </span>
              }
            >
              <i style={{ cursor: 'pointer' }} onClick={(_) => {
                props.syncContracts()
                trackMatomoEvent({ category: 'udapp', action: 'syncContracts', name: compilationSource ? compilationSource : 'compilationSourceNotYetSet', isClick: true })
              }} className="udapp_syncFramework udapp_icon fa fa-refresh" aria-hidden="true"></i>
            </CustomTooltip>
          ) : null}
        </div>
      </div>
      <div className="udapp_subcontainer">
        <CustomTooltip placement={'auto-end'} tooltipClasses="text-nowrap text-start" tooltipId="remixUdappContractNamesTooltip" tooltipText={contractOptions.title}>
          <select
            ref={contractsRef}
            value={currentContract}
            name={contractOptions.title.toString()}
            onChange={handleContractChange}
            className="udapp_contractNames w-100 form-select p-2 border"
            disabled={contractOptions.disabled}
            style={{
              display: loadType === 'abi' && !isContractFile(currentFile) ? 'none' : 'block',
              pointerEvents: contractOptions.disabled ? 'none' : 'auto',
            }}
          >
            <option value="" disabled hidden>
              {intl.formatMessage({ id: 'udapp.noCompiledContracts' })}
            </option>
            {(contractList[currentFile] || []).map((contract, index) => {
              return (
                <option key={index} value={contract.alias}>
                  {contract.alias} - {contract.file}
                </option>
              )
            })}
          </select>
        </CustomTooltip>
        <span className="py-1" style={{ display: abiLabel.display }}>
          {abiLabel.content}
        </span>
      </div>
      {evmVersion && loadedContractData && (
        <CustomTooltip
          placement={'auto-end'}
          tooltipClasses="text-wrap text-start"
          tooltipId="info-evm-version-warn"
          tooltipText={
            <span className="text-start">
              <FormattedMessage id="udapp.warningEvmVersion" values={{ evmVersion }} />
            </span>
          }
        >
          <span className="udapp_evmVersion badge alert-warning">
            <FormattedMessage id="udapp.evmVersion" />: {evmVersion}
          </span>
        </CustomTooltip>
      )}
      <div>
        <div className="udapp_deployDropdown">
          {((contractList[currentFile] && contractList[currentFile].filter((contract) => contract)) || []).length > 0 && loadedContractData && (
            <div>
              <ContractGUI
                title={intl.formatMessage({ id: 'udapp.deploy' })}
                getCompilerDetails={props.getCompilerDetails}
                isDeploy={true}
                deployOption={deployOptions[currentFile] && deployOptions[currentFile][currentContract] ? deployOptions[currentFile][currentContract].options : null}
                initializerOptions={
                  deployOptions[currentFile] && deployOptions[currentFile][currentContract] ? deployOptions[currentFile][currentContract].initializeOptions : null
                }
                funcABI={constructorInterface}
                clickCallBack={clickCallback}
                inputs={constructorInputs}
                widthClass="w-50"
                evmBC={loadedContractData.bytecodeObject}
                lookupOnly={false}
                proxy={props.proxy}
                isValidProxyAddress={props.isValidProxyAddress}
                isValidProxyUpgrade={isValidProxyUpgrade}
                modal={props.modal}
                disabled={props.selectedAccount === ''}
                solcVersion={props.solCompilerVersion}
                setSolcVersion={props.setCompilerVersion}
                getVersion={props.getCompilerVersion}
                evmCheckComplete={props.evmCheckComplete}
                setEvmCheckComplete={props.setEvmCheckComplete}
                plugin={props.plugin}
                runTabState={props.runTabState}
              />
              {isNetworkSupported && (
                <VerificationSettingsUI
                  isVerifyChecked={isVerifyChecked}
                  onVerifyCheckedChange={handleVerifyCheckedChange}
                />
              )}
            </div>
          )}
        </div>
        <div className="pt-2 d-flex flex-column sudapp_button udapp_atAddressSect">
          <div className="d-flex flex-row">
            <CustomTooltip placement={'top-end'} tooltipClasses="text-wrap text-start" tooltipId="runAndDeployAddresstooltip" tooltipText={atAddressOptions.title}>
              <div id="runAndDeployAtAddressButtonContainer" data-bs-title={atAddressOptions.title}>
                <button
                  className={atAddressOptions.disabled ? "disabled udapp_atAddress btn btn-sm py-2 btn-primary" : "udapp_atAddress btn btn-sm py-2 btn-primary"}
                  id="runAndDeployAtAddressButton"
                  disabled={atAddressOptions.disabled}
                  style={{ border: 'none' }}
                  onClick={loadFromAddress}
                  data-bs-title={atAddressOptions.title}
                >
                  <FormattedMessage id="udapp.atAddress" />
                </button>
              </div>
            </CustomTooltip>
            <CustomTooltip
              placement={'top-end'}
              tooltipClasses="text-wrap text-start"
              tooltipId="runAndDeployAddressInputtooltip"
              tooltipText={<FormattedMessage id="udapp.addressOfContract" />}
            >
              <input
                ref={atAddressValue}
                className={(!addressIsValid ? 'border border-danger' : 'border-dark') + ' h-100 udapp_input udapp_ataddressinput ataddressinput form-control'}
                placeholder={intl.formatMessage({
                  id: 'udapp.loadContractFromAddress',
                })}
                onChange={atAddressChanged}
              />
            </CustomTooltip>
          </div>
          {!addressIsValid && (
            <span className="text-danger text-end">
              <FormattedMessage id="udapp.addressNotValid" />
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
