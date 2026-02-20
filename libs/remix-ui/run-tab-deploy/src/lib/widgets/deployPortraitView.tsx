import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { Dropdown } from 'react-bootstrap'
import { AddressToggle, CustomMenu, CustomToggle, extractNameFromKey, getMultiValsString, ProxyAddressToggle, ProxyDropdownMenu, shortenDate, shortenProxyAddress } from '@remix-ui/helper'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { DeployAppContext } from '../contexts'
import { Provider } from '@remix-ui/run-tab-environment'
import { useIntl } from 'react-intl'
import * as remixLib from '@remix-project/remix-lib'
import { deployContract, getNetworkProxyAddresses } from '../actions'
import { ToggleSwitch } from '@remix-ui/toggle'
import { ContractKebabMenu } from './contractKebabMenu'
import { VerificationSettingsUI } from '../components/verificationSettingsUI'

const txFormat = remixLib.execution.txFormat
const txHelper = remixLib.execution.txHelper

function DeployPortraitView() {
  const { plugin, widgetState, dispatch, themeQuality } = useContext(DeployAppContext)
  // TODO: Move all state to reducer
  const [isExpanded, setIsExpanded] = useState(true)
  const [defaultProvider, setDefaultProvider] = useState<string | null>(null)
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null)
  const [expandedInputs, setExpandedInputs] = useState<Set<number>>(new Set())
  const [inputValues, setInputValues] = useState<{[key: number]: string}>({})
  const [expandedProxyInputs, setExpandedProxyInputs] = useState<Set<number>>(new Set())
  const [proxyInputValues, setProxyInputValues] = useState<{[key: number]: string}>({})
  const [deployWithProxy, setDeployWithProxy] = useState<boolean>(false)
  const [upgradeWithProxy, setUpgradeWithProxy] = useState<boolean>(false)
  const [isContractMenuOpen, setIsContractMenuOpen] = useState(false)
  const [proxyDeployments, setProxyDeployments] = useState<Array<{ address: string, date: Date, contractName: string }>>([])
  const [proxyAddress, setProxyAddress] = useState<string>('')
  const [showProxyDropdown, setShowProxyDropdown] = useState<boolean>(false)
  const [isVerifyChecked, setVerifyChecked] = useState<boolean>(false)
  const [isNetworkSupported, setNetworkSupported] = useState<boolean>(false)
  const contractKebabIconRef = useRef<HTMLElement>(null)
  const intl = useIntl()

  useEffect(() => {
    (async () => {
      const defaultProvider = await plugin.call('udappEnv', 'getDefaultProvider')

      setDefaultProvider(defaultProvider)
    })()

    plugin.on('udappEnv', 'providersChanged', (provider: Provider) => {
      setSelectedProvider(provider)
    })
  }, [])

  const selectedContract = useMemo(() => {
    return widgetState.contracts.contractList[widgetState.selectedContractIndex] || null
  }, [widgetState.contracts.contractList, widgetState.selectedContractIndex])

  useEffect(() => {
    (async () => {
      const deployments = await getNetworkProxyAddresses(plugin)

      setProxyDeployments(deployments || [])
    })()
  }, [selectedProvider, selectedContract])

  useEffect(() => {
    const checkVerificationSupport = async () => {
      if (selectedProvider) {
        try {
          const supportedChain = await getSupportedChain(plugin)
          const chainExistsInList = !!supportedChain

          let isConfigValid = false
          if (chainExistsInList) {
            const status = await plugin.call('blockchain', 'detectNetwork')
            const currentChainId = status?.id?.toString()
            if (currentChainId) {
              isConfigValid = await plugin.call(
                'contract-verification',
                'isVerificationSupportedForChain',
                currentChainId
              )
            }
          }

          const isSupported = chainExistsInList && isConfigValid
          setNetworkSupported(isSupported)

          if (isSupported) {
            const saved = window.localStorage.getItem('deploy-verify-contract-checked')
            setVerifyChecked(saved !== null ? JSON.parse(saved) : true)
          } else {
            setVerifyChecked(false)
          }
        } catch (e) {
          console.error("Failed to check verification support:", e)
          setNetworkSupported(false)
          setVerifyChecked(false)
        }
      } else {
        setNetworkSupported(false)
        setVerifyChecked(false)
      }
    }
    checkVerificationSupport()
  }, [selectedProvider])

  useEffect(() => {
    setInputValues({})
    setExpandedInputs(new Set())
    setProxyInputValues({})
    setExpandedProxyInputs(new Set())
  }, [selectedContract])

  const constructorInterface = useMemo(() => {
    return selectedContract?.contractData?.getConstructorInterface() || null
  }, [widgetState.contracts.contractList, selectedContract])

  const getEncodedCall = () => {
    const multiString = getMultiValsString(Object.values(inputValues))
    // copy-to-clipboard icon is only visible for method requiring input params
    if (!multiString) {
      return intl.formatMessage({ id: 'udapp.getEncodedCallError' })
    }
    const multiJSON = JSON.parse('[' + multiString + ']')

    const encodeObj = txFormat.encodeData(constructorInterface, multiJSON, constructorInterface?.type === 'constructor' ? selectedContract?.contractData?.bytecodeObject : null)

    if (encodeObj.error) {
      console.error(encodeObj.error)
      return encodeObj.error
    } else {
      return encodeObj.data
    }
  }

  const getEncodedParams = () => {
    try {
      const multiString = getMultiValsString(Object.values(inputValues))
      // copy-to-clipboard icon is only visible for method requiring input params
      if (!multiString) {
        return intl.formatMessage({ id: 'udapp.getEncodedCallError' })
      }
      const multiJSON = JSON.parse('[' + multiString + ']')
      return txHelper.encodeParams(constructorInterface, multiJSON)
    } catch (e) {
      console.error(e)
    }
  }

  const toggleInputExpansion = (index: number) => {
    setExpandedInputs(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  const handleInputChange = (index: number, value: string) => {
    setInputValues(prev => ({
      ...prev,
      [index]: value
    }))
  }

  const toggleProxyInputExpansion = (index: number) => {
    setExpandedProxyInputs(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  const handleProxyInputChange = (index: number, value: string) => {
    setProxyInputValues(prev => ({
      ...prev,
      [index]: value
    }))
  }

  const handleDeployClick = () => {
    const args = getMultiValsString(Object.values(inputValues))
    const deployArgs = deployWithProxy ?getMultiValsString(Object.values(proxyInputValues)) : proxyAddress
    const proxyOptions = selectedContract?.isUpgradeable
      ? { deployWithProxy, upgradeWithProxy, deployArgs }
      : { deployWithProxy: false, upgradeWithProxy: false }

    deployContract(selectedContract?.contractData, args, proxyOptions, isVerifyChecked, plugin, intl, dispatch)
  }

  const handleKebabClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (selectedContract) {
      setIsContractMenuOpen(prev => !prev)
    }
  }

  const getABI = () => {
    if (!selectedContract?.contractData?.object?.abi) {
      return intl.formatMessage({ id: 'udapp.noABIAvailable' })
    }
    return JSON.stringify(selectedContract.contractData.object.abi, null, 2)
  }

  const getBytecode = () => {
    if (!selectedContract?.contractData?.bytecodeObject) {
      return intl.formatMessage({ id: 'udapp.noBytecodeAvailable' })
    }
    return selectedContract.contractData.bytecodeObject
  }

  const switchProxyAddress = (address: string) => {
    setProxyAddress(address)
    setShowProxyDropdown(false)
  }

  const toggleProxyDropdown = (isOpen: boolean) => {
    setShowProxyDropdown(isOpen)
  }

  const handleProxyAddressChange = (e: any) => {
    const address = e.target.value
    setProxyAddress(address)
  }

  const getSupportedChain = async (plugin: any): Promise<any> => {
    try {
      const response = await fetch('https://chainid.network/chains.json')
      if (!response.ok) return null
      const allChains = await response.json()

      const status = await plugin.call('blockchain', 'detectNetwork')
      if (!status || !status.id || status.id === '-') return null

      const currentChainId = parseInt(status.id)
      return allChains.find((chain: any) => chain.chainId === currentChainId) || null
    } catch (e) {
      console.error(e)
      return null
    }
  }

  const handleVerifyCheckedChange = (isChecked: boolean) => {
    setVerifyChecked(isChecked)
    window.localStorage.setItem('deploy-verify-contract-checked', JSON.stringify(isChecked))
  }

  return (
    <>
      <div className="card mx-2" style={{ backgroundColor: 'var(--custom-onsurface-layer-1)', '--theme-text-color': themeQuality === 'dark' ? 'white' : 'black' } as React.CSSProperties}>
        <div className="p-3 d-flex align-items-center justify-content-between" onClick={() => setIsExpanded(!isExpanded)} style={{ cursor: 'pointer' }}>
          <div className='d-flex align-items-center gap-2'>
            <h6 className="my-auto" style={{ color: themeQuality === 'dark' ? 'white' : 'black', margin: 0 }}>
              <FormattedMessage id="udapp.deploy" defaultMessage="Deploy" />
            </h6>
            <span className="small text-secondary">{ selectedProvider && selectedProvider?.category ? `${selectedProvider.category} ${selectedProvider?.displayName}` : `Remix VM ${defaultProvider?.replace('vm-', '')}` }</span>
          </div>
          <i className={`fas fa-chevron-${isExpanded ? 'down' : 'right'}`} style={{ color: 'var(--bs-tertiary-color)' }}></i>
        </div>
        {isExpanded && (
          <div className="px-3 pb-3">
            {/* Contract Selection */}
            <div className="d-flex pb-3">
              <Dropdown className="w-100">
                <div className='d-flex align-items-center justify-content-between'>
                  <Dropdown.Toggle as={AddressToggle} className="w-100 d-inline-block border form-control" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }} data-id="contractDropdownToggle">
                    <div className="d-flex align-items-center">
                      <div className="me-auto text-nowrap text-truncate overflow-hidden font-sm w-100">
                        <div className="d-flex align-items-center justify-content-between w-100">
                          <div className='d-flex flex-column align-items-start'>
                            <div className="text-truncate" style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>
                              <span>Contract</span>
                            </div>
                            <div style={{ color: 'var(--bs-tertiary-color)' }}>
                              <span className="small">{extractNameFromKey(selectedContract?.filePath) || 'No contract selected'}</span>
                            </div>
                          </div>
                          {selectedContract && !selectedContract?.isCompiled && !selectedContract?.isCompiling && (
                            <div
                              className="btn btn-primary d-flex align-items-center justify-content-center"
                              data-id="compile-action"
                              role="button"
                              tabIndex={0}
                              style={{
                                padding: "4px 8px",
                                height: "28px",
                                fontFamily: "Nunito Sans, sans-serif",
                                fontSize: "11px",
                                fontWeight: 700,
                                lineHeight: "14px",
                                whiteSpace: "nowrap",
                                cursor: "pointer"
                              }}
                              onClick={async (e) => {
                                e.stopPropagation()
                                if (selectedContract?.filePath) {
                                  dispatch({ type: 'SET_COMPILING', payload: selectedContract.filePath })
                                  try {
                                    await plugin.call('solidity', 'compile', selectedContract.filePath)
                                  } catch (error) {
                                    console.error('Compilation error: ', error)
                                    dispatch({ type: 'SET_COMPILING', payload: selectedContract.filePath })
                                  }
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  e.currentTarget.click()
                                }
                              }}
                            >
                              <i className="fas fa-play"></i>
                              <span className="ms-2" style={{ lineHeight: "12px", position: "relative", top: "1px" }}>
                              Compile
                              </span>
                            </div>
                          )}
                          {selectedContract?.isCompiled && (
                            <div
                              role="button"
                              tabIndex={0}
                              style={{ cursor: "pointer" }}
                              onClick={async (e) => {
                                e.stopPropagation()
                                if (selectedContract?.filePath) {
                                  dispatch({ type: 'SET_COMPILING', payload: selectedContract.filePath })
                                  try {
                                    await plugin.call('solidity', 'compile', selectedContract.filePath)
                                  } catch (error) {
                                    console.error('Compilation error: ', error)
                                    dispatch({ type: 'SET_COMPILING', payload: selectedContract.filePath })
                                  }
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  e.currentTarget.click()
                                }
                              }}
                            >
                              <span className={`badge border p-2 text-success`} style={{ fontWeight: 'light', backgroundColor: 'var(--custom-onsurface-layer-3)' }}>
                                <i className="fas fa-check"></i> Compiled
                              </span>
                            </div>
                          )}
                          {selectedContract?.isCompiling && (
                            <div>
                              <span className={`badge border p-2 text-info`} style={{ fontWeight: 'light', backgroundColor: 'var(--custom-onsurface-layer-3)' }}>
                                <i className="fas fa-spinner fa-spin"></i> Compiling
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Dropdown.Toggle>
                  <span
                    ref={contractKebabIconRef}
                    className="ms-2"
                    style={{ color: 'var(--bs-tertiary-color)', position: 'relative' }}
                    onClick={handleKebabClick}
                  >
                    <i className="fas fa-ellipsis-v px-1" style={{ cursor: 'pointer', fontSize: '1rem' }}></i>
                  </span>
                </div>

                {widgetState.contracts.contractList.length > 0 && (
                  <Dropdown.Menu as={CustomMenu} className="w-100 custom-dropdown-items overflow-hidden" style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', '--theme-text-color': themeQuality === 'dark' ? 'white' : 'black' } as React.CSSProperties} data-id="contractDropdownMenu">
                    {widgetState.contracts.contractList.map((contract, index) => (
                      <Dropdown.Item key={`${contract.filePath}:${contract.name}`} className="d-flex align-items-center contract-dropdown-item-hover" onClick={() => dispatch({ type: 'SET_SELECTED_CONTRACT_INDEX', payload: index })} data-id={`contractDropdownItem-${contract.name}`}>
                        <div className="me-auto text-nowrap text-truncate overflow-hidden font-sm w-100">
                          <div className="d-flex align-items-center justify-content-between w-100">
                            <div className='d-flex flex-column align-items-start'>
                              <div className="text-truncate" style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>
                                <span>{contract.name}</span>
                              </div>
                              <div style={{ color: 'var(--bs-tertiary-color)' }}>
                                <span className="small">{extractNameFromKey(contract.filePath)}</span>
                              </div>
                            </div>
                            <div>
                              {contract.isCompiled && (
                                <span className={`badge border p-2 text-success`} style={{ fontWeight: 'light', backgroundColor: 'var(--custom-onsurface-layer-3)' }}>
                                  <i className="fas fa-check"></i> Compiled
                                </span>
                              )}
                              {contract.isCompiling && (
                                <span className={`badge border p-2 text-info`} style={{ fontWeight: 'light', backgroundColor: 'var(--custom-onsurface-layer-3)' }}>
                                  <i className="fas fa-spinner fa-spin"></i> Compiling
                                </span>)}
                              {!contract.isCompiled && !contract.isCompiling && (
                                <span className={`badge border p-2 text-secondary`} style={{ fontWeight: 'light', backgroundColor: 'var(--custom-onsurface-layer-3)' }}>
                                Not compiled
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                )}
              </Dropdown>
              <ContractKebabMenu
                show={isContractMenuOpen && contractKebabIconRef.current !== null}
                target={contractKebabIconRef.current}
                onHide={() => setIsContractMenuOpen(false)}
                onCopyABI={getABI}
                onCopyBytecode={getBytecode}
                menuIndex="contract"
              />
            </div>
            {/* Proxy Options */}
            { selectedContract?.isUpgradeable && (
              <>
                <div className="d-flex align-items-center justify-content-between">
                  <div className='d-flex align-items-center'>
                    <span className="fw-light" data-id="contractGUIDeployWithProxyLabel">Deploy with Proxy</span>
                  </div>
                  <div className="toggle-container">
                    <div
                      data-id="contractGUIDeployWithProxy"
                      aria-label={`Deploy with Proxy`}>
                      <ToggleSwitch
                        id={`deployWithProxyToggle`}
                        isOn={deployWithProxy}
                        onClick={() => {
                          if (!deployWithProxy) {
                            setUpgradeWithProxy(false)
                          }
                          setDeployWithProxy(!deployWithProxy)
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="d-flex align-items-center justify-content-between pb-2">
                  <div className='d-flex align-items-center'>
                    <span className="fw-light" data-id="contractGUIUpgradeImplementationLabel">Upgrade with Proxy</span>
                  </div>
                  <div className="toggle-container">
                    <div
                      data-id="contractGUIUpgradeImplementation"
                      aria-label={`Upgrade with Proxy`}>
                      <ToggleSwitch
                        id={`upgradeWithProxyToggle`}
                        isOn={upgradeWithProxy}
                        onClick={() => {
                          if (!upgradeWithProxy) {
                            setDeployWithProxy(false)
                          }
                          setUpgradeWithProxy(!upgradeWithProxy)
                        }}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Proxy Dropdown - Only show when upgrading with proxy */}
            {
              selectedContract?.isUpgradeable && upgradeWithProxy && (
                <div className='border-top my-3 pt-3'>
                  <div data-id="proxy-dropdown-items">
                    <Dropdown onToggle={toggleProxyDropdown} show={showProxyDropdown}>
                      <Dropdown.Toggle
                        id="dropdown-custom-proxy-components"
                        as={ProxyAddressToggle}
                        address={proxyAddress}
                        onChange={handleProxyAddressChange}
                        className="d-inline-block border border-dark"
                        style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', width: '100%' }}
                      />

                      {proxyDeployments.length > 0 && (
                        <Dropdown.Menu as={ProxyDropdownMenu} className="w-100 form-select" style={{ overflow: 'hidden', backgroundColor: 'var(--custom-onsurface-layer-2)' }}>
                          {proxyDeployments.map((deployment, index) => (
                            <Dropdown.Item
                              key={index}
                              onClick={() => {
                                switchProxyAddress(deployment.address)
                              }}
                              data-id={`proxyAddress${index}`}
                              className="d-flex align-items-center px-2"
                              style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}
                            >
                              <span style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>
                                {proxyAddress === deployment.address ? (
                                  <span>&#10003; {deployment.contractName + ' ' + shortenProxyAddress(deployment.address)} </span>
                                ) : (
                                  <span>{deployment.contractName + ' ' + shortenProxyAddress(deployment.address)}</span>
                                )}
                              </span>
                              <span className="ms-2 text-secondary small">
                                {shortenDate(deployment.date.toString())}
                              </span>
                            </Dropdown.Item>
                          ))}
                        </Dropdown.Menu>
                      )}
                    </Dropdown>
                  </div>
                </div>
              )
            }

            {/* Proxy Options Parameters - Only show when deploying with proxy */}
            {
              selectedContract?.isUpgradeable && selectedContract?.deployOptions && selectedContract.deployOptions.inputs && selectedContract.deployOptions.inputs.length > 0 && deployWithProxy && (
                <div className='border-top mt-3'>
                  {
                    selectedContract.deployOptions.inputs.map((input, index) => {
                      const isExpanded = expandedProxyInputs.has(index)
                      const currentValue = proxyInputValues[index] || ''
                      return (
                        <div key={index} className="my-3">
                          <div className="d-flex gap-2">
                            <div
                              className='btn border-0 p-0'
                              style={{ minWidth: '120px', cursor: 'pointer' }}
                              onClick={() => toggleProxyInputExpansion(index)}
                            >
                              <div className='d-flex flex-column align-items-start'>
                                <span className="small" style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>{input.name}</span>
                                <span className="text-secondary font-weight-light" style={{ fontSize: '0.7rem' }}>{input.type}</span>
                              </div>
                            </div>
                            {!isExpanded && (
                              <div className="position-relative flex-fill input-with-copy-hover">
                                <input
                                  data-id={`proxyInput-${index}`}
                                  type="text"
                                  className="form-control form-control-sm border-0"
                                  placeholder={input.type}
                                  value={currentValue}
                                  onChange={(e) => handleProxyInputChange(index, e.target.value)}
                                  style={{ backgroundColor: 'var(--bs-body-bg)', color: themeQuality === 'dark' ? 'white' : 'black', fontSize: '0.7rem', paddingRight: '1.5rem', minHeight: '30px' }}
                                />
                                <div className="copy-icon-hover" style={{ position: 'absolute', right: '8px', top: '40%', transform: 'translateY(-50%)', cursor: 'pointer', opacity: 0, transition: 'opacity 0.2s', pointerEvents: 'none' }}>
                                  <CopyToClipboard tip="Copy" icon="fa-copy" direction="top" getContent={() => currentValue}>
                                    <span style={{ pointerEvents: 'auto' }}>
                                      <i className="far fa-copy" style={{ color: 'var(--bs-secondary)', fontSize: '0.75rem' }}></i>
                                    </span>
                                  </CopyToClipboard>
                                </div>
                              </div>
                            )}
                          </div>
                          {isExpanded && (
                            <div className="mt-2 position-relative input-with-copy-hover">
                              <textarea
                                className="form-control form-control-sm border-0"
                                placeholder={input.type}
                                value={currentValue}
                                onChange={(e) => handleProxyInputChange(index, e.target.value)}
                                style={{ backgroundColor: 'var(--bs-body-bg)', color: themeQuality === 'dark' ? 'white' : 'black', fontSize: '0.7rem', paddingRight: '1.5rem', minHeight: '80px', resize: 'vertical' }}
                              />
                              <div className="copy-icon-hover" style={{ position: 'absolute', right: '8px', top: '8px', cursor: 'pointer', opacity: 0, transition: 'opacity 0.2s', pointerEvents: 'none' }}>
                                <CopyToClipboard tip="Copy" icon="fa-copy" direction="top" getContent={() => currentValue}>
                                  <span style={{ pointerEvents: 'auto' }}>
                                    <i className="far fa-copy" style={{ color: 'var(--bs-secondary)', fontSize: '0.75rem' }}></i>
                                  </span>
                                </CopyToClipboard>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })
                  }
                </div>
              )}

            {/* Verification Settings - Only show for supported networks */}
            {isNetworkSupported && (
              <div className='border-top pt-2'>
                <VerificationSettingsUI
                  isVerifyChecked={isVerifyChecked}
                  onVerifyCheckedChange={handleVerifyCheckedChange}
                />
              </div>
            )}

            {/* Constructor Parameters */}
            {
              constructorInterface?.type === 'constructor' && constructorInterface?.inputs.length > 0 && (
                <div className='border-top pb-3'>
                  {
                    constructorInterface?.inputs.map((input, index) => {
                      const isExpanded = expandedInputs.has(index)
                      const currentValue = inputValues[index] || ''
                      return (
                        <div key={index} className="my-3">
                          <div className="d-flex gap-2">
                            <div
                              className='btn border-0 p-0'
                              style={{ minWidth: '120px', cursor: 'pointer' }}
                              onClick={() => toggleInputExpansion(index)}
                            >
                              <div className='d-flex flex-column align-items-start'>
                                <span className="small" style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>{input.name}</span>
                                <span className="text-secondary font-weight-light" style={{ fontSize: '0.7rem' }}>{input.type}</span>
                              </div>
                            </div>
                            {!isExpanded && (
                              <div className="position-relative flex-fill input-with-copy-hover">
                                <input
                                  type="text"
                                  className="form-control form-control-sm border-0"
                                  placeholder={input.type}
                                  value={currentValue}
                                  onChange={(e) => handleInputChange(index, e.target.value)}
                                  style={{ backgroundColor: 'var(--bs-body-bg)', color: themeQuality === 'dark' ? 'white' : 'black', fontSize: '0.7rem', paddingRight: '1.5rem', minHeight: '30px' }}
                                  data-id={`constructorInput${index}`}
                                />
                                <div className="copy-icon-hover" style={{ position: 'absolute', right: '8px', top: '40%', transform: 'translateY(-50%)', cursor: 'pointer', opacity: 0, transition: 'opacity 0.2s', pointerEvents: 'none' }}>
                                  <CopyToClipboard tip="Copy" icon="fa-copy" direction="top" getContent={() => currentValue}>
                                    <span style={{ pointerEvents: 'auto' }}>
                                      <i className="far fa-copy" style={{ color: 'var(--bs-secondary)', fontSize: '0.75rem' }}></i>
                                    </span>
                                  </CopyToClipboard>
                                </div>
                              </div>
                            )}
                          </div>
                          {isExpanded && (
                            <div className="mt-2 position-relative input-with-copy-hover">
                              <textarea
                                className="form-control form-control-sm border-0"
                                placeholder={input.type}
                                value={currentValue}
                                onChange={(e) => handleInputChange(index, e.target.value)}
                                style={{ backgroundColor: 'var(--bs-body-bg)', color: themeQuality === 'dark' ? 'white' : 'black', fontSize: '0.7rem', paddingRight: '1.5rem', minHeight: '80px', resize: 'vertical' }}
                                data-id={`constructorInput${index}`}
                              />
                              <div className="copy-icon-hover" style={{ position: 'absolute', right: '8px', top: '8px', cursor: 'pointer', opacity: 0, transition: 'opacity 0.2s', pointerEvents: 'none' }}>
                                <CopyToClipboard tip="Copy" icon="fa-copy" direction="top" getContent={() => currentValue}>
                                  <span style={{ pointerEvents: 'auto' }}>
                                    <i className="far fa-copy" style={{ color: 'var(--bs-secondary)', fontSize: '0.75rem' }}></i>
                                  </span>
                                </CopyToClipboard>
                              </div>
                              <input
                                type="hidden"
                                value={currentValue}
                                onChange={(e) => handleInputChange(index, e.target.value)}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })
                  }
                  {/* Call Data and Parameters */}
                  <div className="d-flex align-items-center justify-content-between gap-2">
                    <CopyToClipboard tip="Copy Call Data" icon="fa-clipboard" direction="bottom" getContent={getEncodedCall}>
                      <button className="btn btn-sm flex-fill border-0" style={{ minWidth: '120px', backgroundColor: 'var(--custom-onsurface-layer-3)' }}>
                        <span className="text-secondary">Call data</span>
                        <i className="far fa-copy ms-1 text-secondary"></i>
                      </button>
                    </CopyToClipboard>
                    <CopyToClipboard tip="Copy Parameters" icon="fa-clipboard" direction="bottom" getContent={getEncodedParams}>
                      <button className="btn btn-sm flex-fill border-0" style={{ minWidth: '120px', backgroundColor: 'var(--custom-onsurface-layer-3)' }}>
                        <span className="text-secondary">Parameters</span>
                        <i className="far fa-copy ms-1 text-secondary"></i>
                      </button>
                    </CopyToClipboard>
                  </div>
                </div>
              )}

            {/* Value and Gas Limit */}
            <div className='border-top pt-3'>
              {/* Value */}
              <div className="d-flex align-items-center gap-3 mb-3">
                <label className="mb-2" style={{ fontSize: '0.9rem', minWidth: '75px', color: themeQuality === 'dark' ? 'white' : 'black' }}>
                  <FormattedMessage id="udapp.value" defaultMessage="Value" />
                </label>
                <div className="position-relative flex-fill">
                  <input
                    id='value'
                    data-id='udapp_value'
                    type="number"
                    min="0"
                    className="form-control form-control-sm border-0"
                    placeholder="0"
                    value={widgetState.value || ''}
                    onChange={(e) => {
                      const value = e.target.value === '' ? 0 : parseInt(e.target.value, 10)
                      dispatch({ type: 'SET_VALUE', payload: isNaN(value) ? 0 : Math.max(0, value) })
                    }}
                    style={{ backgroundColor: 'var(--bs-body-bg)', color: themeQuality === 'dark' ? 'white' : 'black', flex: 1, paddingRight: '4rem' }}
                  />
                  <Dropdown style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', zIndex: 2 }}>
                    <Dropdown.Toggle
                      as={CustomToggle}
                      className="btn-sm border-0 p-0 ps-1 text-secondary rounded"
                      style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', color: themeQuality === 'dark' ? 'white' : 'black' }}
                      icon="fas fa-caret-down ms-2"
                      useDefaultIcon={false}
                    >
                      {widgetState.valueUnit}
                    </Dropdown.Toggle>
                    <Dropdown.Menu style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', '--theme-text-color': themeQuality === 'dark' ? 'white' : 'black' } as React.CSSProperties}>
                      <Dropdown.Item className="unit-dropdown-item-hover" onClick={() => dispatch({ type: 'SET_VALUE_UNIT', payload: 'wei' })} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>wei</Dropdown.Item>
                      <Dropdown.Item className="unit-dropdown-item-hover" onClick={() => dispatch({ type: 'SET_VALUE_UNIT', payload: 'gwei' })} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>gwei</Dropdown.Item>
                      <Dropdown.Item className="unit-dropdown-item-hover" onClick={() => dispatch({ type: 'SET_VALUE_UNIT', payload: 'finney' })} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>finney</Dropdown.Item>
                      <Dropdown.Item className="unit-dropdown-item-hover" onClick={() => dispatch({ type: 'SET_VALUE_UNIT', payload: 'ether' })} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>ether</Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                </div>
              </div>

              {/* Gas Limit */}
              <div className="d-flex align-items-center gap-3 mb-3">
                <label className="mb-2" style={{ fontSize: '0.9rem', minWidth: '75px', color: themeQuality === 'dark' ? 'white' : 'black' }}>
                  <FormattedMessage id="udapp.gasLimit" defaultMessage="Gas limit" />
                </label>
                <div className="position-relative flex-fill">
                  <span
                    className="p-1 pt-0 rounded"
                    style={{
                      position: 'absolute',
                      left: '0.5rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      backgroundColor: 'var(--custom-onsurface-layer-2)',
                      color: 'var(--bs-primary)',
                      cursor: 'pointer',
                      zIndex: 1
                    }}
                    onClick={() => {
                      if (widgetState.gasLimit === 0) {
                        // Switch from auto to custom - set a default value
                        dispatch({ type: 'SET_GAS_LIMIT', payload: 3000000 })
                      } else {
                        // Switch from custom to auto - set to 0
                        dispatch({ type: 'SET_GAS_LIMIT', payload: 0 })
                      }
                    }}
                  >
                    {widgetState.gasLimit === 0 ? 'auto' : 'custom'}
                  </span>
                  <input
                    type="number"
                    className="form-control form-control-sm border-0"
                    placeholder="0000000"
                    value={widgetState.gasLimit}
                    onChange={(e) => dispatch({ type: 'SET_GAS_LIMIT', payload: parseInt(e.target.value) })}
                    disabled={widgetState.gasLimit === 0}
                    style={{
                      backgroundColor: 'var(--bs-body-bg)',
                      color: themeQuality === 'dark' ? 'white' : 'black',
                      flex: 1,
                      paddingLeft: '4rem',
                      opacity: widgetState.gasLimit === 0 ? 0.6 : 1,
                      cursor: widgetState.gasLimit === 0 ? 'not-allowed' : 'text'
                    }}
                  />
                </div>
              </div>

              {/* Deploy Button */}
              <div>
                <button
                  onClick={handleDeployClick}
                  data-id="deployButton"
                  className="btn btn-primary w-100 py-2"
                  style={{ fontSize: '1rem', fontWeight: '500' }}
                >
                  <FormattedMessage id="udapp.deploy" defaultMessage="Deploy" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default DeployPortraitView
