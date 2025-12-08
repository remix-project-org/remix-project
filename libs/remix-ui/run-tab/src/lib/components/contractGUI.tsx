// eslint-disable-next-line no-use-before-define
import React, { useEffect, useRef, useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import * as remixLib from '@remix-project/remix-lib'
import { ContractGUIProps } from '../types'
import { CopyToClipboard } from '@remix-ui/clipboard'
import { CustomTooltip, ProxyAddressToggle, ProxyDropdownMenu, shortenDate, shortenProxyAddress, unavailableProxyLayoutMsg, upgradeReportMsg } from '@remix-ui/helper'
import { Dropdown } from 'react-bootstrap'
import { getCompatibleChains, isChainCompatible, isChainCompatibleWithAnyFork } from '../actions/evmmap'

const txFormat = remixLib.execution.txFormat
const txHelper = remixLib.execution.txHelper
export function ContractGUI(props: ContractGUIProps) {
  const [title, setTitle] = useState<string>('')
  const [basicInput, setBasicInput] = useState<string>('')
  const [toggleContainer, setToggleContainer] = useState<boolean>(false)
  const [buttonOptions, setButtonOptions] = useState<{
    title: string
    content: string
    classList: string
    dataId: string
  }>({ title: '', content: '', classList: '', dataId: '' })
  const [toggleDeployProxy, setToggleDeployProxy] = useState<boolean>(false)
  const [toggleUpgradeImp, setToggleUpgradeImp] = useState<boolean>(false)
  const [deployState, setDeployState] = useState<{
    deploy: boolean
    upgrade: boolean
  }>({ deploy: false, upgrade: false })
  const [proxyAddress, setProxyAddress] = useState<string>('')
  const [proxyAddressError, setProxyAddressError] = useState<string>('')
  const [showDropdown, setShowDropdown] = useState<boolean>(false)
  const multiFields = useRef<Array<HTMLInputElement | null>>([])
  const initializeFields = useRef<Array<HTMLInputElement | null>>([])
  const basicInputRef = useRef<HTMLInputElement>()
  const [baseTitleForDataId, setBaseTitleForDataId] = useState<string>('')

  const intl = useIntl()
  useEffect(() => {
    if (props.deployOption && Array.isArray(props.deployOption)) {
      if (props.deployOption[0] && props.deployOption[0].title === 'Deploy with Proxy' && props.deployOption[0].active) handleDeployProxySelect(true)
      else if (props.deployOption[1] && props.deployOption[1].title === 'Upgrade with Proxy' && props.deployOption[1].active) handleUpgradeImpSelect(true)
    }
  }, [props.deployOption])

  useEffect(() => {
    let newTitle = ''
    let newBaseTitle = ''

    if (props.title) {
      newTitle = props.title
    } else if (props.funcABI.name) {
      newTitle = props.funcABI.name
    } else {
      newTitle = props.funcABI.type === 'receive' ? '(receive)' : '(fallback)'
    }

    if (props.isDeploy) {
      newBaseTitle = intl.formatMessage({ id: 'udapp.deploy', defaultMessage: 'Deploy' })
    } else if (props.funcABI.name) {
      newBaseTitle = props.funcABI.name
    } else {
      newBaseTitle = props.funcABI.type === 'receive' ? '(receive)' : '(fallback)'
    }

    setTitle(newTitle)
    setBaseTitleForDataId(newBaseTitle)

    setBasicInput('')
    // we have the reset the fields before resetting the previous references.
    basicInputRef.current.value = ''
    multiFields.current.filter((el) => el !== null && el !== undefined).forEach((el) => (el.value = ''))
    multiFields.current = []
  }, [props.title, props.funcABI, props.isDeploy, intl])

  useEffect(() => {
    if (props.lookupOnly) {
      //   // call. stateMutability is either pure or view
      setButtonOptions({
        title: title + ' - call',
        content: 'call',
        classList: 'btn-primary',
        dataId: baseTitleForDataId + ' - call'
      })
    } else if (props.funcABI.stateMutability === 'payable' || props.funcABI.payable) {
      //   // transact. stateMutability = payable
      setButtonOptions({
        title: title + ' - transact (payable)',
        content: 'transact',
        classList: 'btn-danger',
        dataId: baseTitleForDataId + ' - transact (payable)'
      })
    } else {
      //   // transact. stateMutability = nonpayable
      setButtonOptions({
        title: title + ' - transact (not payable)',
        content: 'transact',
        classList: 'btn-warning',
        dataId: baseTitleForDataId + ' - transact (not payable)'
      })
    }
  }, [props.lookupOnly, props.funcABI, title, baseTitleForDataId])

  const getEncodedCall = () => {
    const multiString = getMultiValsString(multiFields.current)
    // copy-to-clipboard icon is only visible for method requiring input params
    if (!multiString) {
      return intl.formatMessage({ id: 'udapp.getEncodedCallError' })
    }
    const multiJSON = JSON.parse('[' + multiString + ']')

    const encodeObj = txFormat.encodeData(props.funcABI, multiJSON, props.funcABI.type === 'constructor' ? props.evmBC : null)

    if (encodeObj.error) {
      console.error(encodeObj.error)
      return encodeObj.error
    } else {
      return encodeObj.data
    }
  }

  const getEncodedParams = () => {
    try {
      const multiString = getMultiValsString(multiFields.current)
      // copy-to-clipboard icon is only visible for method requiring input params
      if (!multiString) {
        return intl.formatMessage({ id: 'udapp.getEncodedCallError' })
      }
      const multiJSON = JSON.parse('[' + multiString + ']')
      return txHelper.encodeParams(props.funcABI, multiJSON)
    } catch (e) {
      console.error(e)
    }
  }

  const switchMethodViewOn = () => {
    setToggleContainer(true)
    makeMultiVal()
  }

  const switchMethodViewOff = () => {
    setToggleContainer(false)
    const multiValString = getMultiValsString(multiFields.current)

    if (multiValString) setBasicInput(multiValString)
  }

  const getMultiValsString = (fields: HTMLInputElement[]) => {
    const valArray = fields
    let ret = ''
    const valArrayTest = []

    for (let j = 0; j < valArray.length; j++) {
      if (ret !== '') ret += ','
      let elVal = valArray[j] ? valArray[j].value : ''

      valArrayTest.push(elVal)
      elVal = elVal.replace(/(^|,\s+|,)(\d+)(\s+,|,|$)/g, '$1"$2"$3') // replace non quoted number by quoted number
      elVal = elVal.replace(/(^|,\s+|,)(0[xX][0-9a-fA-F]+)(\s+,|,|$)/g, '$1"$2"$3') // replace non quoted hex string by quoted hex string
      if (elVal) {
        try {
          JSON.parse(elVal)
        } catch (e) {
          elVal = '"' + elVal + '"'
        }
      }
      ret += elVal
    }
    const valStringTest = valArrayTest.join('')

    if (valStringTest) {
      return ret
    } else {
      return ''
    }
  }

  const makeMultiVal = () => {
    const inputString = basicInput

    if (inputString) {
      const inputJSON = remixLib.execution.txFormat.parseFunctionParams(inputString)
      const multiInputs = multiFields.current

      for (let k = 0; k < multiInputs.length; k++) {
        if (inputJSON[k]) {
          multiInputs[k].value = JSON.stringify(inputJSON[k])
        }
      }
    }
  }

  const handleDeploy = async () => {
    if (deployState.deploy) {
      const proxyInitializeString = getMultiValsString(initializeFields.current)
      props.clickCallBack(props.initializerOptions.inputs.inputs, proxyInitializeString, ['Deploy with Proxy'])
    } else if (deployState.upgrade) {
      if (proxyAddress === '') {
        setProxyAddressError(intl.formatMessage({ id: 'udapp.proxyAddressError1' }))
      } else {
        const isValidProxyAddress = await props.isValidProxyAddress(proxyAddress)
        if (isValidProxyAddress) {
          setProxyAddressError('')
          const upgradeReport: any = await props.isValidProxyUpgrade(proxyAddress)
          if (upgradeReport.ok) {
            !proxyAddressError && props.clickCallBack(props.funcABI.inputs, proxyAddress, ['Upgrade with Proxy'])
          } else {
            if (upgradeReport.warning) {
              props.modal(
                'Proxy Upgrade Warning',
                unavailableProxyLayoutMsg(),
                'Proceed',
                () => {
                  !proxyAddressError && props.clickCallBack(props.funcABI.inputs, proxyAddress, ['Upgrade with Proxy'])
                },
                'Cancel',
                () => {},
                'btn-warning',
                'btn-secondary'
              )
            } else {
              props.modal(
                'Proxy Upgrade Error',
                upgradeReportMsg(upgradeReport),
                'Continue anyway ',
                () => {
                  !proxyAddressError && props.clickCallBack(props.funcABI.inputs, proxyAddress, ['Upgrade with Proxy'])
                },
                'Cancel',
                () => {},
                'btn-warning',
                'btn-secondary'
              )
            }
          }
        } else {
          setProxyAddressError(intl.formatMessage({ id: 'udapp.proxyAddressError2' }))
        }
      }
    } else {
      props.clickCallBack(props.funcABI.inputs, basicInput)
    }
  }

  const handleActionClick = async () => {
    props.getVersion()
    if (props.runTabState.selectExEnv.toLowerCase().startsWith('vm-') || props.runTabState.selectExEnv.toLowerCase().includes('basic-http-provider') || props.runTabState.contracts.loadType !== 'sol') {
      await handleDeploy()
    } else {
      const status = await props.getCompilerDetails()
      if (status === 'Not Found') {
        await handleDeploy()
        return
      }
      const tabState = props.runTabState
      const compilerState = await props.plugin.call('solidity', 'getCompilerState')
      const IsCompatible = isChainCompatible(compilerState.evmVersion ?? 'osaka', parseInt(tabState.chainId))
      if (status === 'Passed' && IsCompatible) {
        await handleDeploy()
      } else {
        // Show log in browser console in case of failure due to unknown reasons
        console.log('Failed to run because of EVM version incompatibility or some other compiler issue')
      }
    }
  }

  const handleBasicInput = (e) => {
    const value = e.target.value

    setBasicInput(value)
  }

  const handleExpandMultiClick = () => {
    const valsString = getMultiValsString(multiFields.current)

    if (valsString) {
      props.clickCallBack(props.funcABI.inputs, valsString)
    } else {
      props.clickCallBack(props.funcABI.inputs, '')
    }
  }

  const handleToggleDeployProxy = () => {
    setToggleDeployProxy(!toggleDeployProxy)
  }

  const handleDeployProxySelect = (value: boolean) => {
    if (value) setToggleUpgradeImp(false)
    setToggleDeployProxy(value)
    setDeployState({ upgrade: false, deploy: value })
  }

  const handleToggleUpgradeImp = () => {
    setToggleUpgradeImp(!toggleUpgradeImp)
  }

  const handleUpgradeImpSelect = (value: boolean) => {
    setToggleUpgradeImp(value)
    if (value) {
      setToggleDeployProxy(false)
    }
    setDeployState({ deploy: false, upgrade: value })
  }

  const switchProxyAddress = (address: string) => {
    setProxyAddress(address)
  }

  const toggleDropdown = (isOpen: boolean) => {
    setShowDropdown(isOpen)
  }

  const handleAddressChange = (e) => {
    const address = e.target.value

    setProxyAddress(address)
  }

  return (
    <div
      className={`udapp_contractProperty ${
        (props.funcABI.inputs && props.funcABI.inputs.length > 0) || props.funcABI.type === 'fallback' || props.funcABI.type === 'receive' ? 'udapp_hasArgs' : ''
      }`}
    >
      <div className="udapp_contractActionsContainerSingle pt-2" style={{ display: toggleContainer ? 'none' : 'flex' }}>
        <CustomTooltip
          delay={0}
          placement={'auto-end'}
          tooltipClasses="text-wrap"
          tooltipId="remixUdappInstanceButtonTooltip"
          tooltipText={
            toggleUpgradeImp && !proxyAddress
              ? intl.formatMessage({ id: 'udapp.tooltipText11' })
              : props.inputs !== '' && basicInput === ''
                ? intl.formatMessage({ id: 'udapp.tooltipText12' })
                : buttonOptions.title
          }
        >
          <div className="d-flex p-0 wrapperElement" onClick={handleActionClick} data-id={`${buttonOptions.dataId}-wrapper`} data-bs-title={`${buttonOptions.title}-wrapper`}>
            <button
              className={`udapp_instanceButton text-nowrap overflow-hidden text-truncate ${props.widthClass} btn btn-sm ${buttonOptions.classList}`}
              data-id={`${buttonOptions.dataId}`}
              data-bs-title={`${buttonOptions.title}`}
              disabled={(toggleUpgradeImp && !proxyAddress) || props.disabled || (props.inputs !== '' && basicInput === '')}
            >
              {title}
            </button>
          </div>
        </CustomTooltip>
        <input
          className="form-control border"
          data-id={props.funcABI.type === 'fallback' || props.funcABI.type === 'receive' ? `'(${props.funcABI.type}')` : 'multiParamManagerBasicInputField'}
          placeholder={props.inputs}
          onChange={handleBasicInput}
          data-bs-title={props.funcABI.type === 'fallback' || props.funcABI.type === 'receive' ? `'(${props.funcABI.type}')` : props.inputs}
          ref={basicInputRef}
          style={{
            height: '2rem',
            visibility: !((props.funcABI.inputs && props.funcABI.inputs.length > 0) || props.funcABI.type === 'fallback' || props.funcABI.type === 'receive') ? 'hidden' : 'visible'
          }}
        />
        <i
          data-id="udapp-instance-multi-caret-down"
          className="fas fa-angle-down udapp_methCaret"
          onClick={switchMethodViewOn}
          style={{
            visibility: !(props.funcABI.inputs && props.funcABI.inputs.length > 0) ? 'hidden' : 'visible'
          }}
        ></i>
      </div>
      <div className="udapp_contractActionsContainerMulti" style={{ display: toggleContainer ? 'flex' : 'none' }}>
        <div className="udapp_contractActionsContainerMultiInner text-dark">
          <div onClick={switchMethodViewOff} className="udapp_multiHeader">
            <div className="udapp_multiTitle run-instance-multi-title pt-3">{title}</div>
            <i data-id="udapp-instance-multi-caret" className="fas fa-angle-up udapp_methCaret"></i>
          </div>
          <div>
            {props.funcABI.inputs.map((inp, index) => {
              return (
                <div className="udapp_multiArg" key={index}>
                  <label htmlFor={inp.name}> {inp.name}: </label>
                  <CustomTooltip placement="left-end" tooltipId="udappContractActionsTooltip" tooltipClasses="text-nowrap" tooltipText={inp.name}>
                    <input
                      ref={(el) => {
                        multiFields.current[index] = el
                      }}
                      className="form-control border"
                      placeholder={inp.type}
                      data-id={`multiParamManagerInput${inp.name}`}
                      onChange={handleBasicInput}
                    />
                  </CustomTooltip>
                </div>
              )
            })}
          </div>
          <div className="d-flex udapp_group udapp_multiArg">
            <CopyToClipboard tip={intl.formatMessage({ id: 'udapp.copyCalldata' })} icon="fa-clipboard" direction={'bottom'} getContent={getEncodedCall}>
              <button className="btn remixui_copyButton">
                <i id="copyCalldata" className="m-0 remixui_copyIcon far fa-copy" aria-hidden="true"></i>
                <label htmlFor="copyCalldata">Calldata</label>
              </button>
            </CopyToClipboard>
            <CopyToClipboard tip={intl.formatMessage({ id: 'udapp.copyParameters' })} icon="fa-clipboard" direction={'bottom'} getContent={getEncodedParams}>
              <button className="btn remixui_copyButton">
                <i id="copyParameters" className="m-0 remixui_copyIcon far fa-copy" aria-hidden="true"></i>
                <label htmlFor="copyParameters">
                  <FormattedMessage id="udapp.parameters" />
                </label>
              </button>
            </CopyToClipboard>
            <CustomTooltip placement={'auto-end'} tooltipClasses="text-nowrap" tooltipId="remixUdappInstanceButtonTooltip" tooltipText={buttonOptions.title}>
              <div onClick={handleExpandMultiClick}>
                <button
                  type="button"
                  data-id={buttonOptions.dataId}
                  className={`udapp_instanceButton btn ${buttonOptions.classList} text-center d-flex justify-content-center align-items-center`}
                  disabled={props.disabled || (props.inputs !== '' && basicInput === '')}
                >
                  <div className="text-center d-flex justify-content-center align-items-center">
                    {buttonOptions.content}
                  </div>
                </button>
              </div>
            </CustomTooltip>
          </div>
        </div>
      </div>
      {props.deployOption && (props.deployOption || []).length > 0 ? (
        <>
          <div className="d-flex justify-content-between mt-3">
            <div className="d-flex py-1 align-items-center form-check">
              <input
                id="deployWithProxy"
                data-id="contractGUIDeployWithProxy"
                className="form-check-input"
                type="checkbox"
                onChange={(e) => handleDeployProxySelect(e.target.checked)}
                checked={deployState.deploy}
              />
              <label htmlFor="deployWithProxy" data-id="contractGUIDeployWithProxyLabel" className="m-0 form-check-label w-100 form-check-label udapp_checkboxAlign">
                <FormattedMessage id="udapp.deployWithProxy" />
              </label>
            </div>
            <div>
              {props.initializerOptions && props.initializerOptions.initializeInputs ? (
                <span onClick={handleToggleDeployProxy}>
                  <i className={!toggleDeployProxy ? 'fas fa-angle-right pt-2' : 'fas fa-angle-down'} aria-hidden="true"></i>
                </span>
              ) : null}
            </div>
          </div>
          {props.initializerOptions && props.initializerOptions.initializeInputs ? (
            <div className={`ps-4 flex-column ${toggleDeployProxy ? 'd-flex' : 'd-none'}`}>
              <div className={`flex-column 'd-flex'}`}>
                {props.initializerOptions.inputs.inputs.map((inp, index) => {
                  return (
                    <div className="mb-2" key={index}>
                      <label className="mt-2 text-start d-block" htmlFor={inp.name}>
                        {' '}
                        {inp.name}:{' '}
                      </label>
                      <input
                        data-id={`initializeInputs-${inp.name}`}
                        ref={(el) => {
                          initializeFields.current[index] = el
                        }}
                        style={{ height: 32 }}
                        className="form-control udapp_input"
                        placeholder={inp.type}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
          <div className="d-flex justify-content-between">
            <div className="d-flex py-1 align-items-center form-check">
              <input
                id="upgradeImplementation"
                data-id="contractGUIUpgradeImplementation"
                className="form-check-input"
                type="checkbox"
                onChange={(e) => handleUpgradeImpSelect(e.target.checked)}
                checked={deployState.upgrade}
              />
              <label htmlFor="upgradeImplementation" data-id="contractGUIUpgradeImplementationLabel" className="m-0 form-check-label udapp_checkboxAlign">
                <FormattedMessage id="udapp.upgradeWithProxy" />
              </label>
            </div>
            <span onClick={handleToggleUpgradeImp}>
              <i className={!toggleUpgradeImp ? 'fas fa-angle-right pt-2' : 'fas fa-angle-down'} aria-hidden="true"></i>
            </span>
          </div>
          <div className={`ps-4 flex-column ${toggleUpgradeImp ? 'd-flex' : 'd-none'}`}>
            <div data-id="proxy-dropdown-items">
              <Dropdown onToggle={toggleDropdown} show={showDropdown}>
                <Dropdown.Toggle
                  id="dropdown-custom-components"
                  as={ProxyAddressToggle}
                  address={proxyAddress}
                  onChange={handleAddressChange}
                  className="d-inline-block border border-dark bg-dark"
                />

                {props.proxy.deployments.length > 0 && (
                  <Dropdown.Menu as={ProxyDropdownMenu} className="w-100 form-select" style={{ overflow: 'hidden' }}>
                    {props.proxy.deployments.map((deployment, index) => (
                      <CustomTooltip
                        placement={'right'}
                        tooltipClasses="text-nowrap"
                        tooltipId={`proxyAddressTooltip${index}`}
                        tooltipText={<FormattedMessage id="udapp.tooltipText13" values={{ date: shortenDate(deployment.date) }} />}
                        key={index}
                      >
                        <Dropdown.Item
                          key={index}
                          onClick={() => {
                            switchProxyAddress(deployment.address)
                          }}
                          data-id={`proxyAddress${index}`}
                        >
                          <span>
                            {proxyAddress === deployment.address ? (
                              <span>&#10003; {deployment.contractName + ' ' + shortenProxyAddress(deployment.address)} </span>
                            ) : (
                              <span className="ps-3">{deployment.contractName + ' ' + shortenProxyAddress(deployment.address)}</span>
                            )}
                          </span>
                        </Dropdown.Item>
                      </CustomTooltip>
                    ))}
                  </Dropdown.Menu>
                )}
              </Dropdown>
            </div>
            <div className="d-flex">
              <div className="mb-2">
                {proxyAddressError && (
                  <span className="text-lowercase text-danger" data-id="errorMsgProxyAddress" style={{ fontSize: '.8em' }}>
                    {proxyAddressError}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
