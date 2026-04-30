import React, { useContext, useEffect, useState, useRef, useMemo } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { CustomToggle, CustomTooltip, getTimeAgo, shortenAddress, isNumeric, is0XPrefixed, isHexadecimal, logBuilder, extractDataDefault, getMultiValsString } from '@remix-ui/helper'
import { CopyToClipboard } from '@remix-ui/clipboard'
import * as remixLib from '@remix-project/remix-lib'
import { Dropdown } from 'react-bootstrap'
import { parseUnits } from 'ethers'
import { FuncABI } from '@remix-project/core-plugin'
import { DeployedContractsAppContext } from '../contexts'
import { DeployedContract } from '../types'
import { runTransactions } from '../actions'
import { ContractKebabMenu } from './ContractKebabMenu'

import { TreeView, TreeViewItem } from '@remix-ui/tree-view'
import BN from 'bn.js'
import { TrackingContext } from '@remix-ide/tracking'

const txHelper = remixLib.execution.txHelper
const txFormat = remixLib.execution.txFormat
const highlightedContracts = new Set<string>()

interface DeployedContractItemProps {
  contract: DeployedContract
  index: number
  registerRef?: (ref: HTMLDivElement | null) => void
  isKebabMenuOpen?: boolean
  onKebabMenuToggle?: (isOpen: boolean) => void
}

export function DeployedContractItem({ contract, index, registerRef, isKebabMenuOpen = false, onKebabMenuToggle }: DeployedContractItemProps) {
  const { dispatch, plugin, themeQuality } = useContext(DeployedContractsAppContext)
  const { trackMatomoEvent } = useContext(TrackingContext)
  const intl = useIntl()
  const [networkName, setNetworkName] = useState<string>('')
  const [isExpanded, setIsExpanded] = useState<boolean>(false)
  const [contractABI, setContractABI] = useState(null)
  const [value, setValue] = useState<string>('0')
  const [valueUnit, setValueUnit] = useState<string>('wei')
  const [gasLimit, setGasLimit] = useState<number>(0) // 0 means auto
  const [calldataValue, setCalldataValue] = useState<string>('')
  const [llIError, setLlIError] = useState<string>('')
  const [shouldHighlight, setShouldHighlight] = useState<boolean>(false)
  const kebabIconRef = useRef<HTMLElement>(null)
  const contractItemRef = useRef<HTMLDivElement>(null)
  const isGenerating = useRef<boolean>(false)
  const [showHighLevel, setShowHighLevel] = useState<boolean>(true)
  const [showLowLevel, setShowLowLevel] = useState<boolean>(false)
  const [selectedFunctionIndex, setSelectedFunctionIndex] = useState<number | null>(null)
  const [funcInputs, setFuncInputs] = useState<{[funcIndex: number]: {[paramIndex: number]: string}}>({})
  const [expandPath, setExpandPath] = useState<string[]>([])
  const [functionSearchTerm, setFunctionSearchTerm] = useState<string>('')

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

  // Intersection Observer to detect when contract becomes visible
  useEffect(() => {
    const contractAddress = contract.address
    if (highlightedContracts.has(contractAddress)) {
      return
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && !highlightedContracts.has(contractAddress)) {
          highlightedContracts.add(contractAddress)
          setShouldHighlight(true)
          setTimeout(() => {
            setShouldHighlight(false)
          }, 2000)

          observer.disconnect()
        }
      })
    }, {
      threshold: 0.1, // Trigger when at least 10% of the element is visible
      rootMargin: '0px'
    })

    if (contractItemRef.current) {
      observer.observe(contractItemRef.current)
    }

    return () => {
      observer.disconnect()
    }
  }, [contract.address])

  const functionABIs = useMemo(() => {
    return contractABI?.filter((item: FuncABI) => item.type === 'function') || []
  }, [contractABI])

  const filteredFunctionABIs = useMemo(() => {
    if (!functionSearchTerm.trim()) return functionABIs
    return functionABIs.filter((funcABI: FuncABI) =>
      funcABI.name.toLowerCase().includes(functionSearchTerm.toLowerCase()) ||
      funcABI.inputs.some((input: any) => input.type.toLowerCase().includes(functionSearchTerm.toLowerCase()))
    )
  }, [functionABIs, functionSearchTerm])

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (contract.isPinned) {
      const network = await plugin.call('udappEnv', 'getNetwork')
      const chainId = network?.chainId
      const providerName = network?.name === 'VM' ? await plugin.call('udappEnv', 'getSelectedProvider') : chainId
      let contractPath = `.deploys/pinned-contracts/${providerName}/${contract.address}.json`
      const contractExists = await plugin.call('fileManager', 'exists', contractPath)
      if (!contractExists) contractPath = `.deploys/pinned-contracts/${providerName}/${contract.address.toLowerCase()}.json` // To keep backward compatible
      await plugin.call('fileManager', 'remove', contractPath)
    }

    dispatch({ type: 'REMOVE_CONTRACT', payload: contract.address })
  }

  const handlePinContract = async (e: React.MouseEvent) => {
    e.stopPropagation()
    trackMatomoEvent?.({ category: 'udapp', action: 'pinContractToggle', name: contract.isPinned ? 'unpinned' : 'pinned', isClick: true })
    const network = await plugin.call('udappEnv', 'getNetwork')
    const chainId = network?.chainId
    const providerName = network?.name === 'VM' ? await plugin.call('udappEnv', 'getSelectedProvider') : chainId

    if (contract.isPinned) {
      let contractPath = `.deploys/pinned-contracts/${providerName}/${contract.address}.json`
      const contractExists = await plugin.call('fileManager', 'exists', contractPath)
      if (!contractExists) contractPath = `.deploys/pinned-contracts/${providerName}/${contract.address.toLowerCase()}.json` // To keep backward compatible
      await plugin.call('fileManager', 'remove', contractPath)
      dispatch({ type: 'UNPIN_CONTRACT', payload: index })
      return
    }
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
    trackMatomoEvent?.({ category: 'udapp', action: 'deployedContractToggle', name: !isExpanded ? 'expanded' : 'collapsed', isClick: true })
    setIsExpanded(!isExpanded)
  }

  const toggleHighLevel = () => {
    trackMatomoEvent?.({ category: 'udapp', action: 'highLevelInteractionToggle', name: !showHighLevel ? 'expanded' : 'collapsed', isClick: true })
    if (!showHighLevel) {
      setShowHighLevel(true)
      setShowLowLevel(false)
    } else {
      setShowHighLevel(false)
      setSelectedFunctionIndex(null)
    }
  }

  const toggleLowLevel = () => {
    trackMatomoEvent?.({ category: 'udapp', action: 'lowLevelInteractionToggle', name: !showLowLevel ? 'expanded' : 'collapsed', isClick: true })
    if (!showLowLevel) {
      setShowLowLevel(true)
      setShowHighLevel(false)
      setSelectedFunctionIndex(null)
    } else {
      setShowLowLevel(false)
    }
  }

  const handleFunctionClick = (funcIndex: number) => {
    if (selectedFunctionIndex !== funcIndex) {
      trackMatomoEvent?.({ category: 'udapp', action: 'deployedContractFunctionSelect', name: functionABIs[funcIndex]?.name || `func${funcIndex}`, isClick: true })
      setSelectedFunctionIndex(funcIndex)
    }
  }

  const handleFunctionInputChange = (funcIndex: number, paramIndex: number, value: string) => {
    trackMatomoEvent?.({ category: 'udapp', action: 'deployedContractFunctionInput', name: `func${funcIndex}_param${paramIndex}` })
    setFuncInputs(prev => ({
      ...prev,
      [funcIndex]: {
        ...(prev[funcIndex] || {}),
        [paramIndex]: value
      }
    }))
  }

  const getEncodedCall = (funcIndex: number) => {
    const funcABI = functionABIs[funcIndex]
    if (!funcABI || !funcABI.inputs || funcABI.inputs.length === 0) {
      return intl.formatMessage({ id: 'udapp.getEncodedCallError' })
    }
    const funcParams = funcInputs[funcIndex] || {}
    const inputValues = funcABI.inputs.map((_: any, idx: number) => funcParams[idx] || '')
    const multiString = getMultiValsString(inputValues)
    if (!multiString) {
      return intl.formatMessage({ id: 'udapp.getEncodedCallError' })
    }
    try {
      const multiJSON = JSON.parse('[' + multiString + ']')
      const encodeObj = txFormat.encodeData(funcABI, multiJSON, null)
      if (encodeObj.error) {
        console.error(encodeObj.error)
        return encodeObj.error
      } else {
        return encodeObj.data
      }
    } catch (e) {
      console.error(e)
      return intl.formatMessage({ id: 'udapp.getEncodedCallError' })
    }
  }

  const getEncodedParams = (funcIndex: number) => {
    const funcABI = functionABIs[funcIndex]
    if (!funcABI || !funcABI.inputs || funcABI.inputs.length === 0) {
      return intl.formatMessage({ id: 'udapp.getEncodedCallError' })
    }
    const funcParams = funcInputs[funcIndex] || {}
    const inputValues = funcABI.inputs.map((_: any, idx: number) => funcParams[idx] || '')
    const multiString = getMultiValsString(inputValues)
    if (!multiString) {
      return intl.formatMessage({ id: 'udapp.getEncodedCallError' })
    }
    try {
      const multiJSON = JSON.parse('[' + multiString + ']')
      return txHelper.encodeParams(funcABI, multiJSON)
    } catch (e) {
      console.error(e)
      return intl.formatMessage({ id: 'udapp.getEncodedCallError' })
    }
  }

  const handleExecuteTransaction = async (funcIndex: number) => {
    const funcABI = functionABIs[funcIndex]
    const funcParams = funcInputs[funcIndex] || {}
    const inputsValues = funcABI.inputs.map((_: any, idx: number) => funcParams[idx] || '').join(',')
    const sendValue = parseUnits(value.toString() || '0', valueUnit || 'wei')
    const gasLimitValue = '0x' + new BN(gasLimit, 10).toString(16)
    const isConstant = funcABI.constant !== undefined ? funcABI.constant : false
    const lookupOnly = funcABI.stateMutability === 'view' || funcABI.stateMutability === 'pure' || isConstant

    try {
      const code = await plugin.call('blockchain', 'getCode', contract.address)
      if (code === '' || code === '0x') {
        await plugin.call('terminal', 'log', { type: 'error', value: `Cannot continue the execution, no code found at address ${contract.address}` })
        return
      }
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
      const functionName =
      funcABI.type === 'function' ? funcABI.name : `(${funcABI.type})`
      const logMsg = `${lookupOnly ? "call" : "transact"} to ${contract.name}.${functionName} errored: ${error.message}`

      await plugin.call('terminal', 'logHtml', logBuilder(logMsg))
    }
  }

  const sendData = async () => {
    setLlIError('')
    const fallback = txHelper.getFallbackInterface(contractABI)
    const receive = txHelper.getReceiveInterface(contractABI)
    const amount = parseUnits(value.toString() || '0', valueUnit || 'wei').toString()

    if (amount !== '0') {
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
          calldata = calldata.substring(2)
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
      const functionName =
      funcABI.type === 'function' ? funcABI.name : `(${funcABI.type})`
      const logMsg = `transact to ${contract.name}.${functionName} errored: ${error.message}`

      await plugin.call('terminal', 'logHtml', logBuilder(logMsg))
    }
  }

  const handleKebabClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    trackMatomoEvent?.({ category: 'udapp', action: 'deployedContractKebabMenuOpen', name: shortenAddress(contract.address), isClick: true })
    if (onKebabMenuToggle) {
      onKebabMenuToggle(!isKebabMenuOpen)
    }
  }

  const handleCreateDapp = async (contract: DeployedContract) => {
    if (onKebabMenuToggle) {
      onKebabMenuToggle(false)
    }

    try {
      console.log('[QuickDapp] handleCreateDapp START', { name: contract.name, address: contract.address, timestamp: Date.now() });

      // Send contract details to AI Assistant for DApp generation
      const abi = contract.abi || contract.contractData?.abi || []
      const abiJson = JSON.stringify(abi)

      let chainId: string
      try {
        const providerObject = await plugin.call('blockchain', 'getProviderObject')
        const providerName = providerObject?.name || 'vm-unknown'
        if (providerName.startsWith('vm')) {
          chainId = providerName
        } else {
          const network = await plugin.call('network', 'detectNetwork')
          chainId = network?.id?.toString() || providerName
        }
      } catch (e) {
        chainId = 'unknown'
      }
      console.log('[QuickDapp] chainId resolved:', chainId);

      const prompt = `I want to create a DApp frontend for my deployed contract. Here are the contract details you'll need when calling generate_dapp:

contractName: ${contract.name}
contractAddress: ${contract.address}
chainId: ${chainId}
contractAbi: ${abiJson}

Before generating, please ask me about my design preferences first.`

      console.log('[QuickDapp] prompt assembled, length:', prompt.length);

      // Activate and focus AI Assistant
      try {
        await plugin.call('manager', 'activatePlugin', 'remix-ai-assistant')
      } catch (e) { /* may already be active */ }

      // Open the right side panel (AI Assistant)
      try {
        await plugin.call('rightSidePanel', 'focusPanel')
      } catch (e) { /* best-effort */ }

      // Send prompt to AI Assistant
      console.log('[QuickDapp] calling chatPipe...');
      await plugin.call('remixaiassistant' as any, 'chatPipe', prompt)
      console.log('[QuickDapp] chatPipe returned');

      trackMatomoEvent?.({ category: 'ai', action: 'remixAI', name: 'create_dapp_via_ai', isClick: true })
    } catch (error) {
      if (error.message !== 'Canceled' && error.message !== 'Hide') {
        console.error('[QuickDapp] Error creating dapp:', error)
        await plugin.call('terminal', 'log', { type: 'error', value: error.message })
      }
    } finally {
      isGenerating.current = false
    }
  }

  const handleCopyABI = async (contract: DeployedContract) => {
    if (onKebabMenuToggle) {
      onKebabMenuToggle(false)
    }
    const abi = contract.abi || contract.contractData?.abi
    if (abi) {
      navigator.clipboard.writeText(JSON.stringify(abi, null, 2))
      await plugin.call('notification', 'toast', 'ABI copied to clipboard')
    }
  }

  const handleCopyBytecode = async (contract: DeployedContract) => {
    if (onKebabMenuToggle) {
      onKebabMenuToggle(false)
    }
    const bytecode = contract.contractData?.bytecode || contract.contractData?.object
    if (bytecode) {
      navigator.clipboard.writeText(bytecode)
      await plugin.call('notification', 'toast', 'Bytecode copied to clipboard')
    }
  }

  const handleOpenInExplorer = async (contract: DeployedContract) => {
    if (onKebabMenuToggle) {
      onKebabMenuToggle(false)
    }
    const network = await plugin.call('udappEnv', 'getNetwork')
    let explorerUrl = ''

    if (network?.chainId) {
      switch (network.chainId) {
      case '1':
        explorerUrl = `https://etherscan.io/address/${contract.address}`
        break
      case '11155111':
        explorerUrl = `https://sepolia.etherscan.io/address/${contract.address}`
        break
      case '5':
        explorerUrl = `https://goerli.etherscan.io/address/${contract.address}`
        break
      case '10':
        explorerUrl = `https://optimistic.etherscan.io/address/${contract.address}`
        break
      default:
        await plugin.call('notification', 'toast', 'Block explorer not available for this network')
        return
      }
      window.open(explorerUrl, '_blank')
    }
  }

  const handleClear = async () => {
    if (onKebabMenuToggle) {
      onKebabMenuToggle(false)
    }
    handleRemove({ stopPropagation: () => {} } as React.MouseEvent)
  }

  const getStateMutabilityBadge = (funcABI: FuncABI) => {
    if (funcABI.stateMutability === 'view' || funcABI.stateMutability === 'pure') {
      return (
        <span
          className='d-inline-block rounded-circle'
          title='call'
          style={{
            width: '8px',
            height: '8px',
            backgroundColor: '#64c4ff',
            flexShrink: 0
          }}
        />
      )
    } else if (funcABI.stateMutability === 'payable') {
      return (
        <span
          className='d-inline-block rounded-circle'
          title='payable'
          style={{
            width: '8px',
            height: '8px',
            backgroundColor: '#ff7777',
            flexShrink: 0
          }}
        />
      )
    } else {
      return (
        <span
          className='d-inline-block rounded-circle'
          title='non-payable'
          style={{
            width: '8px',
            height: '8px',
            backgroundColor: '#ffb964',
            flexShrink: 0
          }}
        />
      )
    }
  }

  const handleExpand = (path: string) => {
    trackMatomoEvent?.({ category: 'udapp', action: 'deployedContractTreeExpand', name: path })
    if (expandPath.includes(path)) {
      const filteredPath = expandPath.filter((value) => value !== path)
      setExpandPath(filteredPath)
    } else {
      setExpandPath([...expandPath, path])
    }
  }

  const label = (key: string | number, value: string) => {
    return (
      <div className="d-flex mt-2 flex-row label_item align-items-baseline">
        <label className="small font-weight-bold m-0">{key}:</label>
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
    <div
      className="mb-3"
      ref={(el) => {
        contractItemRef.current = el
        if (registerRef) registerRef(el)
      }}
    >
      <div
        className={`rounded ${shouldHighlight ? 'contract-highlight-animation' : ''}`}
        style={{ backgroundColor: 'var(--custom-onsurface-layer-2)' }}
      >
        <div id={`instance${contract.address}`} data-id={contract?.isPinned ? `pinnedInstance${contract?.address}` : `unpinnedInstance${contract?.address}`} className="w-100" data-shared="universalDappUiInstance">
          <div className="d-flex align-items-center justify-content-between w-100 text-nowrap text-truncate overflow-hidden p-3" onClick={handleContractClick} data-id={`deployedContractItem-${index}`} style={{ cursor: 'pointer' }}>
            <div className='d-flex align-items-center gap-2'>
              <CustomTooltip
                placement="top"
                tooltipClasses="text-nowrap"
                tooltipId="udapp_deployedContractPinTooltip"
                tooltipText={contract.isPinned ? `Pinned at: ${new Date(contract.pinnedAt).toLocaleString()}` : intl.formatMessage({ id: 'udapp.pinContractTooltip' })}
              >
                <i
                  data-id={`pinDeployedContract-${index}`}
                  className={`${contract.isPinned ? 'fa-solid' : 'fa-regular'} fa-thumbtack`}
                  style={{ cursor: 'pointer' }}
                  onClick={handlePinContract}
                ></i>
              </CustomTooltip>
              <div className='d-flex flex-column align-items-start'>
                <div className="text-truncate text-secondary d-flex align-items-center">
                  <span>{contract.name}</span>
                </div>
                <div className="d-flex align-items-center gap-1 font-sm" style={{ color: 'var(--bs-tertiary-color)' }}>
                  <span>{shortenAddress(contract.address)}</span>
                  <CopyToClipboard tip={intl.formatMessage({ id: 'udapp.copyAddressTooltip' })} icon="fa-copy" direction="top" getContent={() => contract?.address} callback={() => trackMatomoEvent?.({ category: 'udapp', action: 'copyDeployedContractAddress', name: shortenAddress(contract.address), isClick: true })}>
                    <i className="fa-solid fa-copy small ms-1" style={{ cursor: 'pointer' }}></i>
                  </CopyToClipboard>
                </div>
              </div>
            </div>
            <div className='d-flex align-items-center gap-2'>
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
            show={isKebabMenuOpen}
            target={kebabIconRef.current}
            onHide={() => {
              if (onKebabMenuToggle) {
                onKebabMenuToggle(false)
              }
            }}
            contract={contract}
            onCreateDapp={handleCreateDapp}
            onCopyABI={handleCopyABI}
            onCopyBytecode={handleCopyBytecode}
            onOpenInExplorer={handleOpenInExplorer}
            onClear={handleClear}
          />
          {isExpanded && (
            <div className="p-3 pt-0" onClick={(e) => e.stopPropagation()}>
              {/* Divider */}
              <div className="border-top mb-3"></div>

              {/* High level interaction section */}
              <div className="mb-3">
                <div className="d-flex align-items-center justify-content-between mb-2" style={{ cursor: 'pointer' }} onClick={toggleHighLevel}>
                  <p className='mb-0' style={{ color: 'var(--text-quaternary, #959bad)' }}><FormattedMessage id="udapp.highLevelInteraction" /></p>
                  <div
                    className="d-flex align-items-center justify-center rounded"
                    style={{
                      backgroundColor: 'var(--custom-onsurface-layer-3)',
                      padding: '4px'
                    }}
                  >
                    <i className={`text-theme-contrast fas fa-${showHighLevel ? 'minus' : 'plus'}`} style={{ fontSize: '10px' }}></i>
                  </div>
                </div>

                {showHighLevel && (
                  <>
                    {functionABIs && functionABIs.length > 0 ? (
                      <div className="mb-3" data-id={`functionDropdown-${index}`}>
                        <Dropdown>
                          <Dropdown.Toggle
                            as={CustomToggle}
                            className="btn btn-outline-secondary w-100 d-flex align-items-center justify-content-between"
                            style={{
                              backgroundColor: 'var(--custom-onsurface-layer-3)',
                              border: '1px solid var(--custom-onsurface-layer-4)',
                              color: 'var(--dark/text-secondary, #d5d7e3)',
                              padding: '8px 12px'
                            }}
                            icon="fas fa-caret-down"
                            useDefaultIcon={false}
                          >
                            <div className="d-flex align-items-center gap-1 flex-fill text-start">
                              <span style={{ color: 'var(--text-tertiary, #a2a3bd)' }}>Select a function to interact with...</span>
                            </div>
                          </Dropdown.Toggle>
                          <Dropdown.Menu
                            style={{
                              backgroundColor: 'var(--custom-onsurface-layer-2)',
                              border: '1px solid var(--custom-onsurface-layer-4)',
                              maxHeight: '240px',
                              overflowY: 'auto',
                              width: '100%',
                              padding: 0
                            }}
                          >
                            <div style={{
                              padding: '8px',
                              borderBottom: '1px solid var(--custom-onsurface-layer-4)',
                              backgroundColor: 'var(--custom-onsurface-layer-2)'
                            }}>
                              <input
                                type="text"
                                placeholder="Search functions..."
                                className="form-control form-control-sm"
                                value={functionSearchTerm}
                                onChange={(e) => {
                                  e.stopPropagation()
                                  setFunctionSearchTerm(e.target.value)
                                }}
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  backgroundColor: 'var(--custom-onsurface-layer-3)',
                                  border: '1px solid var(--custom-onsurface-layer-4)',
                                  color: 'var(--dark/text-secondary, #d5d7e3)',
                                  fontSize: '11px'
                                }}
                              />
                            </div>
                            <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                              {filteredFunctionABIs.map((funcABI: FuncABI, filteredIndex: number) => {
                                // Find the actual index in the original functionABIs array
                                const actualIndex = functionABIs.findIndex(f => f === funcABI)
                                const inputTypes = funcABI.inputs.map(input => input.type).join(', ')
                                const isSelected = selectedFunctionIndex === actualIndex

                                return (
                                  <Dropdown.Item
                                    key={actualIndex}
                                    data-id={`deployedContractItem-${index}-function-${actualIndex}`}
                                    className="d-flex align-items-center gap-1"
                                    style={{
                                      backgroundColor: isSelected ? 'var(--custom-onsurface-layer-3)' : 'transparent',
                                      color: 'var(--dark/text-secondary, #d5d7e3)',
                                      padding: '8px 12px',
                                      border: 'none'
                                    }}
                                    onClick={() => handleFunctionClick(actualIndex)}
                                  >
                                    {getStateMutabilityBadge(funcABI)}
                                    <div className="d-flex align-items-baseline gap-1" style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                                      <span
                                        style={{
                                          fontSize: '12px',
                                          fontWeight: 700,
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                          flexShrink: 0,
                                          maxWidth: '100%'
                                        }}
                                        title={funcABI.name}
                                      >
                                        {funcABI.name}
                                      </span>
                                      {funcABI.inputs.length > 0 && (
                                        <span
                                          style={{
                                            fontSize: '10px',
                                            color: 'var(--text-tertiary, #a2a3bd)',
                                            fontFamily: 'Monaco, monospace',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            flexShrink: 1,
                                            minWidth: 0
                                          }}
                                          title={inputTypes}
                                        >
                                          {inputTypes}
                                        </span>
                                      )}
                                    </div>
                                  </Dropdown.Item>
                                )
                              })}
                              {filteredFunctionABIs.length === 0 && functionSearchTerm.trim() && (
                                <div className="text-muted text-center py-2" style={{ fontSize: '11px' }}>
                                No functions found matching "{functionSearchTerm}"
                                </div>
                              )}
                            </div>
                          </Dropdown.Menu>
                        </Dropdown>
                      </div>
                    ) : (
                      <div className="text-muted pt-3 text-center"><FormattedMessage id="udapp.noABIAvailableForContract" /></div>
                    )}
                  </>
                )}
              </div>

              {/* Divider */}
              <div className="border-top mb-3"></div>

              {/* Low level interaction section */}
              <div className="mb-3">
                <div
                  className="d-flex align-items-center justify-content-between mb-2"
                  style={{ cursor: 'pointer' }}
                  onClick={toggleLowLevel}
                >
                  <p className='mb-0' style={{ color: 'var(--text-quaternary, #959bad)' }}><FormattedMessage id="udapp.lowLevelInteraction" /></p>
                  <div
                    data-id={`btnLowLevel-${index}`}
                    className="d-flex align-items-center justify-center rounded"
                    style={{
                      backgroundColor: 'var(--custom-onsurface-layer-3)',
                      padding: '4px'
                    }}
                  >
                    <i className={`text-theme-contrast fas fa-${showLowLevel ? 'minus' : 'plus'}`} style={{ fontSize: '10px' }}></i>
                  </div>
                </div>

                {showLowLevel && (
                  <div className="mt-3">
                    <input
                      data-id={`fallbackInput-${index}`}
                      type="text"
                      placeholder="calldata"
                      className="form-control form-control-sm"
                      value={calldataValue}
                      onChange={(e) => {
                        trackMatomoEvent?.({ category: 'udapp', action: 'deployedContractCalldataInput', name: e.target.value })
                        setCalldataValue(e.target.value)
                      }}
                      style={{
                        color: themeQuality === 'dark' ? 'white' : 'black',
                        border: 'none',
                        padding: '8px 12px',
                        fontSize: '10px'
                      }}
                    />
                    {llIError && (
                      <div data-id="deployAndRunLLTxError" className="alert alert-danger mt-2 p-2" role="alert" style={{ fontSize: '10px' }}>
                        {llIError}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {selectedFunctionIndex !== null && functionABIs[selectedFunctionIndex] && (
                // Divider
                <div className="border-top mb-3"></div>
              )}

              {selectedFunctionIndex !== null && functionABIs[selectedFunctionIndex] && (
                <div className="mb-3">
                  <div className="d-flex align-items-center gap-1 mb-2">
                    {getStateMutabilityBadge(functionABIs[selectedFunctionIndex])}
                    <div className="d-flex align-items-baseline gap-1" style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: themeQuality === 'dark' ? 'white' : 'black',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          maxWidth: '100%'
                        }}
                        title={functionABIs[selectedFunctionIndex].name}
                      >
                        {functionABIs[selectedFunctionIndex].name}
                      </span>
                      {functionABIs[selectedFunctionIndex].inputs.length > 0 && (
                        <span
                          style={{
                            fontSize: '10px',
                            color: 'var(--text-tertiary, #a2a3bd)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flexShrink: 1,
                            minWidth: 0
                          }}
                          title={functionABIs[selectedFunctionIndex].inputs.map((input: any) => input.type).join(', ')}
                        >
                          {functionABIs[selectedFunctionIndex].inputs.map((input: any) => input.type).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  {functionABIs[selectedFunctionIndex].inputs.length > 0 && functionABIs[selectedFunctionIndex].inputs.map((input: any, inputIdx: number) => (
                    <div key={inputIdx} className="mb-2">
                      <input
                        data-id={`selectedFunction-${inputIdx}`}
                        type="text"
                        placeholder={`${input.name || `param${inputIdx}`} (${input.type})`}
                        className="form-control form-control-sm"
                        value={(funcInputs[selectedFunctionIndex]?.[inputIdx] || '')}
                        onChange={(e) => {
                          handleFunctionInputChange(selectedFunctionIndex, inputIdx, e.target.value)
                        }}
                        style={{
                          // backgroundColor: 'var(--custom-onsurface-background, #222336)',
                          color: 'var(--dark/text-quaternary, #959bad)',
                          border: 'none',
                          padding: '8px 12px',
                          fontSize: '0.7rem',
                          minHeight: '30px'
                        }}
                      />
                    </div>
                  ))}
                  {functionABIs[selectedFunctionIndex].inputs.length > 0 && (
                    <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
                      <CopyToClipboard
                        tip={intl.formatMessage({ id: 'udapp.copyCalldata' })}
                        icon="fa-clipboard"
                        direction="bottom"
                        getContent={() => getEncodedCall(selectedFunctionIndex)}
                      >
                        <button
                          className="btn btn-sm flex-fill border-0"
                          style={{ minWidth: '100px', backgroundColor: 'var(--custom-onsurface-layer-3)' }}
                          data-id={`copyCalldata-${selectedFunctionIndex}`}
                        >
                          <span className="text-secondary" style={{ fontSize: '0.7rem' }}>
                            <FormattedMessage id="udapp.calldata" defaultMessage="Calldata" />
                          </span>
                          <i className="far fa-copy ms-1 text-secondary" style={{ fontSize: '0.7rem' }}></i>
                        </button>
                      </CopyToClipboard>
                      <CopyToClipboard
                        tip={intl.formatMessage({ id: 'udapp.copyParameters' })}
                        icon="fa-clipboard"
                        direction="bottom"
                        getContent={() => getEncodedParams(selectedFunctionIndex)}
                      >
                        <button
                          className="btn btn-sm flex-fill border-0"
                          style={{ minWidth: '100px', backgroundColor: 'var(--custom-onsurface-layer-3)' }}
                          data-id={`copyParameters-${selectedFunctionIndex}`}
                        >
                          <span className="text-secondary" style={{ fontSize: '0.7rem' }}>
                            <FormattedMessage id="udapp.parameters" />
                          </span>
                          <i className="far fa-copy ms-1 text-secondary" style={{ fontSize: '0.7rem' }}></i>
                        </button>
                      </CopyToClipboard>
                    </div>
                  )}
                  {(functionABIs[selectedFunctionIndex].stateMutability === 'view' || functionABIs[selectedFunctionIndex].stateMutability === 'pure') && (
                    <div className="udapp_value" data-id="udapp_tree_value">
                      <TreeView id="treeView">
                        {Object.keys(contract.decodedResponse || {}).map((key) => {
                          const response = contract.decodedResponse[key]

                          return parseInt(key) === selectedFunctionIndex
                            ? Object.keys(response || {}).map((innerkey) => {
                              return renderData(contract.decodedResponse[key][innerkey], response, innerkey, innerkey)
                            })
                            : null
                        })}
                      </TreeView>
                    </div>
                  )}
                </div>
              )}

              {((selectedFunctionIndex !== null && functionABIs[selectedFunctionIndex] &&
                functionABIs[selectedFunctionIndex].stateMutability !== 'view' &&
                functionABIs[selectedFunctionIndex].stateMutability !== 'pure') || showLowLevel) && (
                <div className="mb-3">
                  <div className="d-flex align-items-center gap-1 mb-3">
                    <label className="mb-0" style={{ fontSize: '12px', fontWeight: 700, minWidth: '75px', color: themeQuality === 'dark' ? 'white' : 'black' }}>
                      <FormattedMessage id="udapp.valueLabel" />
                    </label>
                    <div className="position-relative flex-fill">
                      <input
                        data-id={`contractItem-sendValue-${index}`}
                        type="number"
                        min="0"
                        className="form-control form-control-sm border-0"
                        placeholder="3000000"
                        value={value}
                        onChange={(e) => {
                          const val = e.target.value
                          trackMatomoEvent?.({ category: 'udapp', action: 'deployedContractValueInput', name: val || '0' })
                          // Only allow empty string or valid numeric strings
                          if (val === '' || /^\d+$/.test(val)) {
                            setValue(val)
                          }
                        }}
                        style={{
                          color: 'var(--dark/text-quaternary, #959bad)',
                          flex: 1,
                          paddingRight: '3.5rem',
                          fontSize: '0.7rem',
                          minHeight: '30px'
                        }}
                      />
                      <Dropdown style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', zIndex: 2 }}>
                        <Dropdown.Toggle
                          as={CustomToggle}
                          className="btn-sm border-0 text-secondary rounded font-sm ps-1"
                          style={{
                            backgroundColor: 'var(--custom-onsurface-layer-2)',
                            color: 'var(--text-secondary, #d5d7e3)'
                          }}
                          icon="fas fa-caret-down ms-1"
                          useDefaultIcon={false}
                        >
                          {valueUnit}
                        </Dropdown.Toggle>
                        <Dropdown.Menu style={{ backgroundColor: 'var(--custom-onsurface-layer-2)', '--theme-text-color': themeQuality === 'dark' ? 'white' : 'black', '--bs-dropdown-min-width': '4rem', padding: 0 } as React.CSSProperties}>
                          <Dropdown.Item className="unit-dropdown-item-hover" onClick={() => {
                            trackMatomoEvent?.({ category: 'udapp', action: 'deployedContractValueUnitChange', name: 'wei', isClick: true })
                            setValueUnit('wei')
                          }} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>wei</Dropdown.Item>
                          <Dropdown.Item className="unit-dropdown-item-hover" onClick={() => {
                            trackMatomoEvent?.({ category: 'udapp', action: 'deployedContractValueUnitChange', name: 'gwei', isClick: true })
                            setValueUnit('gwei')
                          }} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>gwei</Dropdown.Item>
                          <Dropdown.Item className="unit-dropdown-item-hover" onClick={() => {
                            trackMatomoEvent?.({ category: 'udapp', action: 'deployedContractValueUnitChange', name: 'finney', isClick: true })
                            setValueUnit('finney')
                          }} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>finney</Dropdown.Item>
                          <Dropdown.Item className="unit-dropdown-item-hover" onClick={() => {
                            trackMatomoEvent?.({ category: 'udapp', action: 'deployedContractValueUnitChange', name: 'ether', isClick: true })
                            setValueUnit('ether')
                          }} style={{ color: themeQuality === 'dark' ? 'white' : 'black' }}>ether</Dropdown.Item>
                        </Dropdown.Menu>
                      </Dropdown>
                    </div>
                  </div>
                  <div className="d-flex align-items-center gap-1 mb-3">
                    <label className="mb-0" style={{ fontSize: '12px', fontWeight: 700, minWidth: '75px', color: themeQuality === 'dark' ? 'white' : 'black' }}>
                      <FormattedMessage id="udapp.gasLimitLabel" />
                    </label>
                    <div className="position-relative flex-fill">
                      <span
                        className="badge font-sm"
                        style={{
                          position: 'absolute',
                          left: '0.35rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          backgroundColor: '#64C4FF14',
                          color: '#64c4ff',
                          cursor: 'pointer',
                          zIndex: 1
                        }}
                        onClick={() => {
                          const newMode = gasLimit === 0 ? 'custom' : 'auto'
                          trackMatomoEvent?.({ category: 'udapp', action: 'deployedContractGasLimitToggle', name: newMode, isClick: true })
                          if (gasLimit === 0) {
                            setGasLimit(3000000)
                          } else {
                            setGasLimit(0)
                          }
                        }}
                      >
                        {gasLimit === 0 ? 'auto' : 'custom'}
                      </span>
                      <input
                        type="number"
                        className="form-control form-control-sm border-0"
                        placeholder="3000000"
                        value={gasLimit}
                        onChange={(e) => {
                          trackMatomoEvent?.({ category: 'udapp', action: 'deployedContractGasLimitInput', name: e.target.value })
                          setGasLimit(parseInt(e.target.value))
                        }}
                        disabled={gasLimit === 0}
                        style={{
                          color: 'var(--dark/text-quaternary, #959bad)',
                          flex: 1,
                          paddingLeft: '4rem',
                          textAlign: 'right',
                          opacity: gasLimit === 0 ? 0.6 : 1,
                          cursor: gasLimit === 0 ? 'not-allowed' : 'text',
                          fontSize: '0.7rem',
                          minHeight: '30px'
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {((selectedFunctionIndex !== null && functionABIs[selectedFunctionIndex]) || showLowLevel) && (
                <button
                  data-id={`btnExecute-${index}`}
                  className="btn btn-primary w-100 mt-3"
                  onClick={() => {
                    const actionType = showLowLevel ? 'lowLevel' : functionABIs[selectedFunctionIndex]?.name || 'function'
                    trackMatomoEvent?.({ category: 'udapp', action: 'deployedContractExecute', name: actionType, isClick: true })
                    if (showLowLevel) {
                      sendData()
                    } else if (selectedFunctionIndex !== null) {
                      handleExecuteTransaction(selectedFunctionIndex)
                    }
                  }}
                  style={{
                    backgroundColor: 'var(--button/primary/default, #64c4ff)',
                    color: 'var(--onsurface/background, #222336)',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    padding: '8px 24px',
                    borderRadius: '4px'
                  }}
                >
                  {showLowLevel
                    ? intl.formatMessage({ id: 'udapp.transactButton' })
                    : (functionABIs[selectedFunctionIndex].stateMutability === 'view' || functionABIs[selectedFunctionIndex].stateMutability === 'pure')
                      ? intl.formatMessage({ id: 'udapp.callButton' })
                      : intl.formatMessage({ id: 'udapp.transactButton' })}
                </button>
              )}

              {/* Divider */}
              <div className="border-top my-3"></div>
              <div className='d-flex align-items-center gap-1' data-id="deployedContractBal">
                <div style={{ fontSize: '12px', fontWeight: 700, flex: 1 }}><FormattedMessage id="udapp.balanceLabel" /></div>
                <div style={{ fontSize: '10px', color: 'var(--text-tertiary, #a2a3bd)', fontFamily: 'Monaco, monospace' }}>
                  {contract.balance || 0} ETH
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
