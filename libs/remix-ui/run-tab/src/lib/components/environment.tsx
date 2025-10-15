// eslint-disable-next-line no-use-before-define
import React, { useRef, useState, useEffect, useContext } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { EnvironmentProps } from '../types'
import { Dropdown } from 'react-bootstrap'
import { CustomMenu, CustomToggle, CustomTooltip } from '@remix-ui/helper'
import { DropdownLabel } from './dropdownLabel'
import SubmenuPortal from './subMenuPortal'
import { TrackingContext } from '@remix-ide/tracking'
import { MatomoEvent, UdappEvent } from '@remix-api'

export function EnvironmentUI(props: EnvironmentProps) {
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = UdappEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const vmStateName = useRef('')
  const providers = props.providers.providerList
  const [isSwitching, setIsSwitching] = useState(false)

  const switchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (switchTimeoutRef.current) {
      clearTimeout(switchTimeoutRef.current)
    }
    setIsSwitching(false)
  }, [props.selectedEnv])

  useEffect(() => {
    return () => {
      if (switchTimeoutRef.current) {
        clearTimeout(switchTimeoutRef.current)
      }
    }
  }, [])

  const remixVMs = providers.filter(p => p.config.isVM)
  const injectedProviders = providers.filter(p => p.config.isInjected)
  const isDevByLabel = (p: any) => {
    const label = (p?.displayName || '').trim()
    return /^dev\s*[-–—]\s*/i.test(label)
  }
  const devProviders = providers.filter(isDevByLabel)
  const walletConnect = providers.find(p => p.name === 'walletconnect' || p.name === 'walletConnect')
  const httpProvider = providers.find(p => p.name === 'basic-http-provider' || p.name === 'web3Provider' || p.name === 'basicHttpProvider')

  const handleChangeExEnv = (env: string) => {
    if (props.selectedEnv === env || isSwitching) return

    if (switchTimeoutRef.current) {
      clearTimeout(switchTimeoutRef.current)
    }

    setIsSwitching(true)

    switchTimeoutRef.current = setTimeout(() => {
      setIsSwitching(false)
    }, 8000)

    const provider = props.providers.providerList.find((exEnv) => exEnv.name === env)
    const context = provider.name
    props.setExecutionContext({ context })
  }

  const currentProvider = props.providers.providerList.find((exEnv) => exEnv.name === props.selectedEnv)
  const bridges = {
    'L2 - Optimism': 'https://app.optimism.io/bridge/deposit',
    'L2 - Arbitrum': 'https://bridge.arbitrum.io/'
  }

  const isL2 = (providerDisplayName: string) => providerDisplayName && (providerDisplayName.startsWith('L2 - Optimism') || providerDisplayName.startsWith('L2 - Arbitrum'))

  const intl = useIntl()
  const isSaveEvmStateChecked = props.config.get('settings/save-evm-state')

  const forkStatePrompt = (defaultName: string) => {
    return (
      <div data-id="forkVmStateModal">
        <ul className='ms-3'>
          <li><FormattedMessage id="udapp.forkVmStateDesc1"/></li>
          <li><FormattedMessage id="udapp.forkVmStateDesc2"/></li>
        </ul>
        <label id="stateName" className="form-check-label" style={{ fontWeight: 'bolder' }}>
          <FormattedMessage id="udapp.forkStateLabel" />
        </label>
        <input
          type="text"
          data-id="modalDialogForkState"
          defaultValue={defaultName}
          className="form-control"
          onChange={(e) => vmStateName.current = e.target.value}
        />
      </div>
    )
  }

  const deleteVmStatePrompt = () => {
    return (
      <div data-id="deleteVmStateModal">
        <ul className='ms-3'>
          <li><FormattedMessage id="udapp.resetVmStateDesc1"/></li>
          <li><FormattedMessage id="udapp.resetVmStateDesc2"/></li>
        </ul>
        <FormattedMessage id="udapp.resetVmStateDesc3"/>
      </div>
    )
  }

  const forkState = async () => {
    trackMatomoEvent({ category: 'udapp', action: 'forkState', name: 'forkState clicked', isClick: true })
    let context = currentProvider.name
    context = context.replace('vm-fs-', '')

    let currentStateDb
    try {
      currentStateDb = JSON.parse(await props.runTabPlugin.blockchain.executionContext.getStateDetails())
    } catch (e) {
      props.runTabPlugin.call('notification', 'toast', `State not available to fork. ${e.message}`)
      return
    }

    if (Object.keys(currentStateDb.db).length === 0) {
      props.runTabPlugin.call('notification', 'toast', `State not available to fork, as no transactions have been made for selected environment & selected workspace.`)
      return
    }

    vmStateName.current = `${context}_${Date.now()}`
    props.modal(
      intl.formatMessage({ id: 'udapp.forkStateTitle' }),
      forkStatePrompt(vmStateName.current),
      intl.formatMessage({ id: 'udapp.fork' }),
      async () => {
        currentStateDb.stateName = vmStateName.current
        currentStateDb.forkName = currentProvider.config.fork
        currentStateDb.nodeUrl = currentProvider.config.nodeUrl
        currentStateDb.savingTimestamp = Date.now()
        await props.runTabPlugin.call('fileManager', 'writeFile', `.states/forked_states/${vmStateName.current}.json`, JSON.stringify(currentStateDb, null, 2))
        props.runTabPlugin.emit('vmStateForked', vmStateName.current)

        // we also need to copy the pinned contracts:
        if (await props.runTabPlugin.call('fileManager', 'exists', `.deploys/pinned-contracts/${currentProvider.name}`)) {
          const files = await props.runTabPlugin.call('fileManager', 'readdir', `.deploys/pinned-contracts/${currentProvider.name}`)
          if (files && Object.keys(files).length) {
            await props.runTabPlugin.call('fileManager', 'copyDir', `.deploys/pinned-contracts/${currentProvider.name}`, `.deploys/pinned-contracts`, 'vm-fs-' + vmStateName.current)
          }
        }
        trackMatomoEvent({ category: 'udapp', action: 'forkState', name: `forked from ${context}`, isClick: false })
      },
      intl.formatMessage({ id: 'udapp.cancel' }),
      () => {}
    )
  }

  const resetVmState = async() => {
    trackMatomoEvent({ category: 'udapp', action: 'deleteState', name: 'deleteState clicked', isClick: true })
    const context = currentProvider.name
    const contextExists = await props.runTabPlugin.call('fileManager', 'exists', `.states/${context}/state.json`)
    if (contextExists) {
      props.modal(
        intl.formatMessage({ id: 'udapp.resetVmStateTitle' }),
        deleteVmStatePrompt(),
        intl.formatMessage({ id: 'udapp.reset' }),
        async () => {
          const currentProvider = await props.runTabPlugin.call('blockchain', 'getCurrentProvider')
          // Reset environment blocks and account data
          await currentProvider.resetEnvironment()
          // Remove deployed and pinned contracts from UI
          await props.runTabPlugin.call('udapp', 'clearAllInstances')
          // Delete environment state file
          await props.runTabPlugin.call('fileManager', 'remove', `.states/${context}/state.json`)
          // If there are pinned contracts, delete pinned contracts folder
          const isPinnedContracts = await props.runTabPlugin.call('fileManager', 'exists', `.deploys/pinned-contracts/${context}`)
          if (isPinnedContracts) await props.runTabPlugin.call('fileManager', 'remove', `.deploys/pinned-contracts/${context}`)
          props.runTabPlugin.call('notification', 'toast', `VM state reset successfully.`)
          trackMatomoEvent({ category: 'udapp', action: 'deleteState', name: 'VM state reset', isClick: false })
        },
        intl.formatMessage({ id: 'udapp.cancel' }),
        null
      )
    } else props.runTabPlugin.call('notification', 'toast', `State not available to reset, as no transactions have been made for selected environment & selected workspace.`)
  }

  return (
    <div className="udapp_crow">
      <label id="selectExEnv" className="udapp_settingsLabel w-100">
        <FormattedMessage id="udapp.environment" />
        <CustomTooltip placement={'auto-end'} tooltipClasses="text-nowrap" tooltipId="info-recorder" tooltipText={<FormattedMessage id="udapp.tooltipText2" />}>
          <a href="https://chainlist.org/" target="_blank">
            <i className='udapp_infoDeployAction ms-2 fas fa-plug' aria-hidden="true"></i>
          </a>
        </CustomTooltip>
        { currentProvider && currentProvider.config.isVM && isSaveEvmStateChecked && <CustomTooltip placement={'auto-end'} tooltipClasses="text-wrap" tooltipId="forkStatetooltip" tooltipText={<FormattedMessage id="udapp.forkStateTitle" />}>
          <i className="udapp_infoDeployAction ms-2 fas fa-code-branch" style={{ cursor: 'pointer' }} onClick={forkState} data-id="fork-state-icon"></i>
        </CustomTooltip> }
        { currentProvider && currentProvider.config.isVM && isSaveEvmStateChecked && !currentProvider.config.isVMStateForked && !currentProvider.config.isRpcForkedState && <CustomTooltip placement={'auto-end'} tooltipClasses="text-wrap" tooltipId="deleteVMStatetooltip" tooltipText={<FormattedMessage id="udapp.resetVmStateTitle" />}>
          <span onClick={resetVmState} style={{ cursor: 'pointer', float: 'right', textTransform: 'none' }}>
            <i className="udapp_infoDeployAction ms-2 fas fa-rotate-right" data-id="delete-state-icon"></i>
            <span className="ms-1" style = {{ textTransform: 'none', fontSize: '13px' }}>Reset State</span>
          </span>
        </CustomTooltip> }
        {isSwitching && <i className="fa fa-spinner fa-pulse ms-2" aria-hidden="true"></i>}

      </label>
      <div className="" data-id={`selected-provider-${currentProvider && currentProvider.name}`}>
        <Dropdown
          id="selectExEnvOptions"
          data-id="settingsSelectEnvOptions"
          className="udapp_selectExEnvOptions"
        >
          <Dropdown.Toggle as={CustomToggle} id="dropdown-custom-components" className="btn btn-light btn-block w-100 d-inline-block border form-select" icon={null}>
            {/* {isL2(currentProvider && currentProvider.displayName)} */}
            <DropdownLabel label={currentProvider && currentProvider.displayName} bridges={bridges} currentProvider={currentProvider} envLabel={props.envLabel} runTabState={props.udappState} setExecutionEnv={props.setExecutionContext} isL2={isL2} plugin={props.runTabPlugin} />
          </Dropdown.Toggle>
          <Dropdown.Menu as={CustomMenu} className="w-100 form-select udapp_exenv_menu" data-id="custom-dropdown-items">
            {providers.length === 0 && <Dropdown.Item>No provider pinned</Dropdown.Item>}

            {remixVMs.length > 0 && (
              <SubmenuPortal label="Remix VM">
                {remixVMs.map(({ name, displayName }) => (
                  <Dropdown.Item
                    key={name}
                    onClick={() => handleChangeExEnv(name)}
                    data-id={`dropdown-item-${name}`}
                  >
                    {displayName}
                  </Dropdown.Item>
                ))}
              </SubmenuPortal>
            )}

            <Dropdown.Divider className="border-secondary" />

            {injectedProviders.length > 0 && (
              <SubmenuPortal label="Browser extension">
                {injectedProviders.map(({ name, displayName }) => (
                  <Dropdown.Item
                    key={name}
                    onClick={() => handleChangeExEnv(name)}
                    data-id={`dropdown-item-${name}`}
                  >
                    {displayName}
                  </Dropdown.Item>
                ))}
              </SubmenuPortal>
            )}

            {walletConnect && (
              <Dropdown.Item
                key={walletConnect.name}
                onClick={() => handleChangeExEnv(walletConnect.name)}
                data-id={`dropdown-item-${walletConnect.name}`}
              >
                {walletConnect.displayName}
              </Dropdown.Item>
            )}

            <Dropdown.Divider className="border-secondary" />

            {httpProvider && (
              <Dropdown.Item
                key={httpProvider.name}
                onClick={() => handleChangeExEnv(httpProvider.name)}
                data-id={`dropdown-item-${httpProvider.name}`}
              >
                {httpProvider.displayName}
              </Dropdown.Item>
            )}

            <Dropdown.Divider className="border-secondary" />

            {devProviders.length > 0 && (
              <SubmenuPortal label="Dev">
                {devProviders.map(({ name, displayName }) => (
                  <Dropdown.Item
                    key={name}
                    onClick={() => handleChangeExEnv(name)}
                    data-id={`dropdown-item-${name}`}
                  >
                    {displayName}
                  </Dropdown.Item>
                ))}
              </SubmenuPortal>
            )}
          </Dropdown.Menu>
        </Dropdown>
      </div>
    </div>
  )
}
