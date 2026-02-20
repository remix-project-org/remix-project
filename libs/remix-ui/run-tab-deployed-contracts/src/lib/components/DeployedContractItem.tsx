import React, { useContext, useEffect, useState, useRef } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { CustomToggle, CustomTooltip, extractDataDefault, getTimeAgo, shortenAddress, isNumeric, is0XPrefixed, isHexadecimal, logBuilder } from '@remix-ui/helper'
import { CopyToClipboard } from '@remix-ui/clipboard'
import * as remixLib from '@remix-project/remix-lib'
import { Dropdown } from 'react-bootstrap'
import { parseUnits } from 'ethers'
import { FuncABI } from '@remix-project/core-plugin'
import { DeployedContractsAppContext } from '../contexts'
import { DeployedContract } from '../types'
import { runTransactions } from '../actions'
import { TreeView, TreeViewItem } from '@remix-ui/tree-view'
import { ContractKebabMenu } from './ContractKebabMenu'
import BN from 'bn.js'

const txHelper = remixLib.execution.txHelper

interface DeployedContractItemProps {
  contract: DeployedContract
  index: number
}

export function DeployedContractItem({ contract, index }: DeployedContractItemProps) {
  const { dispatch, plugin, themeQuality } = useContext(DeployedContractsAppContext)
  const intl = useIntl()
  const [networkName, setNetworkName] = useState<string>('')
  const [isExpanded, setIsExpanded] = useState<boolean>(false)
  const [contractABI, setContractABI] = useState(null)
  const [value, setValue] = useState<number>(0)
  const [valueUnit, setValueUnit] = useState<string>('wei')
  const [gasLimit, setGasLimit] = useState<number>(0) // 0 means auto
  const [funcInputs, setFuncInputs] = useState<Record<number, string>>({})
  const [expandPath, setExpandPath] = useState<string[]>([])
  const [calldataValue, setCalldataValue] = useState<string>('')
  const [llIError, setLlIError] = useState<string>('')
  const [showKebabMenu, setShowKebabMenu] = useState<boolean>(false)
  const kebabIconRef = useRef<HTMLElement>(null)

  useEffect(() => {
    plugin.call('udappEnv', 'getNetwork').then((net) => {
      if (net && net.name) {
        const networkName = net.name === 'VM' ? 'Remix VM' : net.name

        setNetworkName(networkName)
      }
    })
  }, [])

  useEffect(() => {
    if (!contract.abi) {
      const abi = txHelper.sortAbiFunction(contract.contractData.abi)

      setContractABI(abi)
    } else {
      setContractABI(contract.abi)
    }
  }, [])

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation()

    // Remove from pinned contracts if pinned
    if (contract.isPinned) {
      const network = await plugin.call('udappEnv', 'getNetwork')
      const chainId = network?.chainId
      const providerName = network?.name === 'VM' ? await plugin.call('udappEnv', 'getSelectedProvider') : chainId

      await plugin.call('fileManager', 'remove', `.deploys/pinned-contracts/${providerName}/${contract.address}.json`)
    }

    dispatch({ type: 'REMOVE_CONTRACT', payload: contract.address })
  }

  const handlePinContract = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const network = await plugin.call('udappEnv', 'getNetwork')
    const chainId = network?.chainId
    const providerName = network?.name === 'VM' ? await plugin.call('udappEnv', 'getSelectedProvider') : chainId

    // Toggle pin/unpin
    if (contract.isPinned) {
      // Unpin the contract
      await plugin.call('fileManager', 'remove', `.deploys/pinned-contracts/${providerName}/${contract.address}.json`)
      dispatch({ type: 'UNPIN_CONTRACT', payload: index })
      return
    }

    // Pin the contract
    const provider = await plugin.call('blockchain', 'getProviderObject')
    if (!provider.config.statePath && provider.config.isRpcForkedState) {
      // we can't pin a contract in the following case:
      // - state is not persisted
      // - future state is browser stored (e.g it's not just a simple RPC provider)
      plugin.call('notification', 'toast', 'Cannot pin this contract in the current context: state is not persisted. Please fork this provider to start pinning a contract to it.')
      return
    }

    const workspace = await plugin.call('filePanel', 'getCurrentWorkspace')

    const objToSave = {
      name: contract.name,
      address: contract.address,
      timestamp: contract.timestamp,
      abi: contract.abi || contract.contractData?.abi,
      filePath: contract.filePath || `${workspace.name}/${contract.contractData?.contract?.file}`,
      pinnedAt: Date.now()
    }

    await plugin.call('fileManager', 'writeFile', `.deploys/pinned-contracts/${providerName}/${contract.address}.json`, JSON.stringify(objToSave, null, 2))

    dispatch({ type: 'PIN_CONTRACT', payload: { index, pinnedAt: objToSave.pinnedAt, filePath: objToSave.filePath } })
  }

  const handleContractClick = () => {
    setIsExpanded(!isExpanded)
  }

  const handleExecuteTransaction = async (funcABI: any, funcIndex: number, lookupOnly: boolean) => {
    const inputsValues = funcInputs[funcIndex] || ''
    const sendValue = parseUnits(value.toString() || '0', valueUnit || 'wei')
    const gasLimitValue = '0x' + new BN(gasLimit, 10).toString(16)

    try {
      await runTransactions(
        plugin,
        dispatch,
        index,
        lookupOnly,
        funcABI,
        inputsValues,
        contract,
        funcIndex,
        { value: sendValue, gasLimit: gasLimitValue }
      )
    } catch (error) {
      console.error('Error executing transaction:', error)
      await plugin.call('notification', 'toast', `Error: ${error.message}`)
    }
  }

  const handleInputChange = (funcIndex: number, value: string) => {
    setFuncInputs(prev => ({
      ...prev,
      [funcIndex]: value
    }))
  }

  const handleExpand = (path: string) => {
    if (expandPath.includes(path)) {
      const filteredPath = expandPath.filter((value) => value !== path)

      setExpandPath(filteredPath)
    } else {
      setExpandPath([...expandPath, path])
    }
  }

  const sendData = async () => {
    setLlIError('')
    const fallback = txHelper.getFallbackInterface(contractABI)
    const receive = txHelper.getReceiveInterface(contractABI)
    const amount = parseUnits(value.toString() || '0', valueUnit || 'wei').toString()

    if (amount !== '0') {
      // check for numeric and receive/fallback
      if (!isNumeric(value.toString())) {
        return setLlIError(intl.formatMessage({ id: 'udapp.llIError1' }))
      } else if (!receive && !(fallback && fallback.stateMutability === 'payable')) {
        return setLlIError(intl.formatMessage({ id: 'udapp.llIError2' }))
      }
    }
    let calldata = calldataValue

    if (calldata) {
      if (calldata.length < 4 && is0XPrefixed(calldata)) {
        return setLlIError(intl.formatMessage({ id: 'udapp.llIError3' }))
      } else {
        if (is0XPrefixed(calldata)) {
          calldata = calldata.substr(2, calldata.length)
        }
        if (!isHexadecimal(calldata)) {
          return setLlIError(intl.formatMessage({ id: 'udapp.llIError4' }))
        }
      }
      if (!fallback) {
        return setLlIError(intl.formatMessage({ id: 'udapp.llIError5' }))
      }
    }

    if (!receive && !fallback) return setLlIError(intl.formatMessage({ id: 'udapp.llIError6' }))

    // we have to put the right function ABI:
    // if receive is defined and that there is no calldata => receive function is called
    // if fallback is defined => fallback function is called
    let funcABI = null
    if (receive && !calldata) funcABI = receive
    else if (fallback) funcABI = fallback

    if (!funcABI) return setLlIError(intl.formatMessage({ id: 'udapp.llIError7' }))

    try {
      const sendValue = parseUnits(value.toString() || '0', valueUnit || 'wei')
      const gasLimitValue = '0x' + new BN(gasLimit, 10).toString(16)

      await runTransactions(
        plugin,
        dispatch,
        index,
        false,
        funcABI,
        calldata,
        contract,
        -1, // Use -1 for low level interactions
        { value: sendValue, gasLimit: gasLimitValue }
      )
    } catch (error) {
      console.error('Error executing low level transaction:', error)
      await plugin.call('terminal', 'logHtml', logBuilder(error.message))
    }
  }

  const handleKebabClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowKebabMenu(prev => !prev)
  }

  const handleCreateDapp = async (contract: DeployedContract) => {
    setShowKebabMenu(false)

    const network = await plugin.call('udappEnv', 'getNetwork')
    const payload = {
      address: '',
      abi: null,
      name: '',
      network: network?.name,
      devdoc: null,
      methodIdentifiers: null,
      solcVersion: '',
      htmlTemplate: null
    }

    const targetPlugin = 'quick-dapp'

    try {
      // We always have a contract instance with contractData
      const { metadata: metaFromInst, abi: abiFromInst, object } = contract.contractData || {}

      payload.address = contract.address
      payload.abi = contract.abi || abiFromInst
      payload.name = contract.name

      if (object) {
        payload.devdoc = object.devdoc
        payload.methodIdentifiers = object.evm?.methodIdentifiers
      }

      if (metaFromInst) {
        try {
          payload.solcVersion = JSON.parse(metaFromInst).compiler.version
        } catch (e) {
          console.warn('[DeployedContractItem] Failed to parse solcVersion from metadata', e)
        }
      }

      await plugin.call(targetPlugin, 'edit', payload)

    } catch (error) {
      console.error('[DeployedContractItem] Error creating dapp:', error)
      await plugin.call('notification', 'toast', `Error creating dapp: ${error.message}`)
    }
  }

  const handleCopyABI = async (contract: DeployedContract) => {
    setShowKebabMenu(false)
    const abi = contract.abi || contract.contractData?.abi
    if (abi) {
      navigator.clipboard.writeText(JSON.stringify(abi, null, 2))
      await plugin.call('notification', 'toast', 'ABI copied to clipboard')
    }
  }

  const handleCopyBytecode = async (contract: DeployedContract) => {
    setShowKebabMenu(false)
    const bytecode = contract.contractData?.bytecode || contract.contractData?.object
    if (bytecode) {
      navigator.clipboard.writeText(bytecode)
      await plugin.call('notification', 'toast', 'Bytecode copied to clipboard')
    }
  }

  const handleOpenInExplorer = async (contract: DeployedContract) => {
    setShowKebabMenu(false)
    const network = await plugin.call('udappEnv', 'getNetwork')
    let explorerUrl = ''

    // Determine explorer URL based on network
    if (network?.name) {
      switch (network.name.toLowerCase()) {
      case 'mainnet':
      case 'ethereum':
        explorerUrl = `https://etherscan.io/address/${contract.address}`
        break
      case 'sepolia':
        explorerUrl = `https://sepolia.etherscan.io/address/${contract.address}`
        break
      case 'goerli':
        explorerUrl = `https://goerli.etherscan.io/address/${contract.address}`
        break
      default:
        await plugin.call('notification', 'toast', 'Block explorer not available for this network')
        return
      }
      window.open(explorerUrl, '_blank')
    }
  }

  const handleClear = async (contract: DeployedContract) => {
    setShowKebabMenu(false)
    handleRemove({ stopPropagation: () => {} } as React.MouseEvent)
  }

  const label = (key: string | number, value: string) => {
    return (
      <div className="d-flex mt-2 flex-row label_item align-items-baseline">
        <label className="small fw-bold mb-0 pe-1 label_key">{key}:</label>
        <label className="m-0 label_value">{value}</label>
      </div>
    )
  }

  const renderData = (item, parent, key: string | number, keyPath: string) => {
    const data = extractDataDefault(item, parent)
    const children = (data.children || []).map((child, index) => {
      return renderData(child.value, data, child.key, keyPath + '/' + child.key)
    })

    if (children && children.length > 0) {
      return (
        <TreeViewItem id={`treeViewItem${key}`} key={keyPath} label={label(key, data.self)} onClick={() => handleExpand(keyPath)} expand={expandPath.includes(keyPath)}>
          <TreeView id={`treeView${key}`} key={keyPath}>
            {children}
          </TreeView>
        </TreeViewItem>
      )
    } else {
      return <TreeViewItem id={key.toString()} key={keyPath} label={label(key, data.self)} onClick={() => handleExpand(keyPath)} expand={expandPath.includes(keyPath)} />
    }
  }

  return (
    <div className="mb-3">
      <div
        className="d-flex align-items-center rounded"
        style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', cursor: 'pointer' }}
      >
        <div id={`instance${contract.address}`} data-id={contract?.isPinned ? `pinnedInstance${contract?.address}` : `unpinnedInstance${contract?.address}`} className="me-auto w-100" data-shared="universalDappUiInstance">
          <div className="d-flex align-items-center justify-content-between w-100 p-3 text-nowrap text-truncate overflow-hidden" onClick={handleContractClick} data-id={`deployedContractItem-${index}`}>
            <div className='d-flex'>
              <CustomTooltip
                placement="top"
                tooltipClasses="text-nowrap"
                tooltipId="udapp_deployedContractPinTooltip"
                tooltipText={contract.isPinned ? `Pinned at: ${new Date(contract.pinnedAt).toLocaleString()}` : 'Pin contract'}
              >
                <i
                  data-id="pinDeployedContract"
                  className={`${contract.isPinned ? 'fa-solid' : 'fa-regular'} fa-thumbtack align-self-center pe-2`}
                  style={{ cursor: 'pointer' }}
                  onClick={handlePinContract}
                ></i>
              </CustomTooltip>
              <div className='d-flex flex-column align-items-start'>
                <div className="text-truncate text-secondary d-flex align-items-center">
                  <span>{contract.name}</span>
                </div>
                <div className="font-sm" style={{ color: 'var(--bs-tertiary-color)', position: 'relative' }}>
                  <span className="text-dark">{shortenAddress(contract.address)}</span>
                  <CopyToClipboard tip="Copy address" icon="fa-copy" direction="top" getContent={() => contract?.address}>
                    <i className="fa-solid fa-copy small ms-1" style={{ cursor: 'pointer' }}></i>
                  </CopyToClipboard>
                </div>
              </div>
            </div>
            <div className='d-flex' style={{ color: 'var(--bs-tertiary-color)' }}>
              <div className='d-flex flex-column align-items-end'>
                <span className='badge text-info' style={{ backgroundColor: '#64C4FF14' }}>{networkName}</span>
                <span className='small'>{getTimeAgo(contract.timestamp, { truncateTimeAgo: true })} ago</span>
              </div>
              <i
                ref={kebabIconRef as any}
                className="fas fa-ellipsis-v align-self-center p-2 mx-1"
                style={{ cursor: 'pointer' }}
                onClick={handleKebabClick}
                data-id={`contractKebabIcon-${index}`}
              ></i>
            </div>
          </div>
          <ContractKebabMenu
            show={showKebabMenu}
            target={kebabIconRef.current}
            onHide={() => setShowKebabMenu(false)}
            contract={contract}
            onCreateDapp={handleCreateDapp}
            onCopyABI={handleCopyABI}
            onCopyBytecode={handleCopyBytecode}
            onOpenInExplorer={handleOpenInExplorer}
            onClear={handleClear}
          />
          {/* Expanded Contract Interface */}
          {isExpanded && (
            <div className="border-top p-3 pt-0" onClick={(e) => e.stopPropagation()}>
              {contractABI && contractABI.length > 0 ? (
                <>
                  <div className="py-3 pb-2">
                    <p className='mb-1'>High level interaction</p>
                    {contractABI
                      .filter((item: any) => item.type === 'function')
                      .map((funcABI: FuncABI, funcIndex: number) => {
                        if (funcABI.type !== 'function') return null
                        const isConstant = funcABI.constant !== undefined ? funcABI.constant : false
                        const lookupOnly = funcABI.stateMutability === 'view' || funcABI.stateMutability === 'pure' || isConstant
                        const inputNames = funcABI.inputs.map(input => input.name).join(', ')
                        const inputTypes = funcABI.inputs.map(input => input.type).join(', ')

                        return (
                          <div key={funcIndex} className="mb-1 px-0 py-2 rounded" data-id={`contractItem-${funcIndex}`}>
                            <div className="d-flex align-items-center mb-2" key={funcIndex}>
                              {
                                funcABI.stateMutability === 'view' || funcABI.stateMutability === 'pure' ?
                                  <span className='badge text-info me-1' style={{ backgroundColor: '#64C4FF14' }}>call</span>
                                  : funcABI.stateMutability === 'payable' ? <span className='badge text-danger me-1' style={{ backgroundColor: '#FF777714' }}>payable</span>
                                    : <span className='badge text-warning me-1' style={{ backgroundColor: '#FFB96414' }}>transact</span>
                              }
                              <label className="mb-0 me-1 text-secondary">
                                { funcABI.name }
                              </label>
                              <span className="text-nowrap" style={{ fontWeight: 'lighter' }}>
                                { inputNames }
                              </span>
                            </div>
                            <div className="position-relative flex-fill">
                              <input
                                type="text"
                                placeholder={inputTypes}
                                className="form-control"
                                value={funcInputs[funcIndex] || ''}
                                onChange={(e) => handleInputChange(funcIndex, e.target.value)}
                                style={{
                                  backgroundColor: 'var(--bs-body-bg)',
                                  color: themeQuality === 'dark' ? 'white' : 'black', flex: 1, padding: '0.75rem', paddingRight: '4.5rem', fontSize: '0.75rem',
                                  cursor: !inputNames ? 'not-allowed' : 'text'
                                }}
                                disabled={!inputNames && !inputTypes}
                                data-id={`deployedContractItem-${index}-input-${funcIndex}`}
                              />
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => handleExecuteTransaction(funcABI, funcIndex, lookupOnly)}
                                style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', zIndex: 2, fontSize: '0.65rem', fontWeight: 'bold' }}
                                data-id={`deployedContractItem-${index}-button-${funcIndex}`}
                              >
                              Execute
                              </button>
                            </div>
                            {lookupOnly && (
                              <div className="udapp_value" data-id="udapp_tree_value">
                                <TreeView id="treeView">
                                  {Object.keys(contract.decodedResponse || {}).map((key) => {
                                    const response = contract.decodedResponse[key]

                                    return parseInt(key) === funcIndex
                                      ? Object.keys(response || {}).map((innerkey, index) => {
                                        return renderData(contract.decodedResponse[key][innerkey], response, innerkey, innerkey)
                                      })
                                      : null
                                  })}
                                </TreeView>
                              </div>
                            )}
                          </div>
                        )})}
                    {/* Value and Gas Limit */}
                    <div className='pt-3'>
                      {/* Value */}
                      <div className="d-flex align-items-center gap-3 mb-3">
                        <label className="mb-2" style={{ fontSize: '0.9rem', minWidth: '75px', color: themeQuality === 'dark' ? 'white' : 'black' }}>
                          <FormattedMessage id="udapp.value" defaultMessage="Value" />
                        </label>
                        <div className="position-relative flex-fill">
                          <input
                            data-id={`contractItem-sendValue-${index}`}
                            type="number"
                            min="0"
                            className="form-control form-control-sm border-0"
                            placeholder="0"
                            value={value || ''}
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10)
                              setValue(isNaN(val) ? 0 : Math.max(0, val))
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
                              {valueUnit}
                            </Dropdown.Toggle>
                            <Dropdown.Menu style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', '--theme-text-color': themeQuality === 'dark' ? 'white' : 'black' } as React.CSSProperties}>
                              <Dropdown.Item className="unit-dropdown-item-hover" onClick={() => setValueUnit('wei')} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>wei</Dropdown.Item>
                              <Dropdown.Item className="unit-dropdown-item-hover" onClick={() => setValueUnit('gwei')} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>gwei</Dropdown.Item>
                              <Dropdown.Item className="unit-dropdown-item-hover" onClick={() => setValueUnit('finney')} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>finney</Dropdown.Item>
                              <Dropdown.Item className="unit-dropdown-item-hover" onClick={() => setValueUnit('ether')} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>ether</Dropdown.Item>
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
                              if (gasLimit === 0) {
                                // Switch from auto to custom - set a default value
                                setGasLimit(3000000)
                              } else {
                                // Switch from custom to auto - set to 0
                                setGasLimit(0)
                              }
                            }}
                          >
                            {gasLimit === 0 ? 'auto' : 'custom'}
                          </span>
                          <input
                            type="number"
                            className="form-control form-control-sm border-0"
                            placeholder="0000000"
                            value={gasLimit}
                            onChange={(e) => setGasLimit(parseInt(e.target.value))}
                            disabled={gasLimit === 0}
                            style={{
                              backgroundColor: 'var(--bs-body-bg)',
                              color: themeQuality === 'dark' ? 'white' : 'black',
                              flex: 1,
                              paddingLeft: '4rem',
                              opacity: gasLimit === 0 ? 0.6 : 1,
                              cursor: gasLimit === 0 ? 'not-allowed' : 'text'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className='pt-3 border-top'>
                    <p className='mb-1'>Low level interaction</p>
                    <div className="mb-1 px-0 py-2 rounded">
                      <div className="d-flex align-items-center mb-2">
                        <label className="mb-0 me-1 text-secondary">
                          Call data
                        </label>
                        <span style={{ fontWeight: 'lighter' }}>
                          call data
                        </span>
                      </div>
                      <div className="position-relative flex-fill">
                        <input
                          data-id={`fallbackInput-${index}`}
                          type="text"
                          placeholder="0x..."
                          className="form-control"
                          value={calldataValue}
                          onChange={(e) => setCalldataValue(e.target.value)}
                          style={{
                            backgroundColor: 'var(--bs-body-bg)',
                            color: themeQuality === 'dark' ? 'white' : 'black', flex: 1, padding: '0.75rem', paddingRight: '4.5rem', fontSize: '0.75rem',
                          }}
                        />
                        <button
                          data-id={`fallbackExecute-${index}`}
                          className="btn btn-sm btn-secondary"
                          onClick={sendData}
                          style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', zIndex: 2, fontSize: '0.65rem', fontWeight: 'bold' }}
                        >
                              Execute
                        </button>
                      </div>
                      {llIError && (
                        <div data-id="deployAndRunLLTxError" className="alert alert-danger mt-2 p-2" role="alert" style={{ fontSize: '0.75rem', wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                          {llIError}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className='d-flex justify-content-between pt-3 border-top' data-id="deployedContractBal">
                    <div>Balance</div>
                    <div>{contract.balance || 0} ETH</div>
                  </div>
                </>
              ) : (
                <div className="text-muted pt-3 text-center">No ABI available for this contract</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
