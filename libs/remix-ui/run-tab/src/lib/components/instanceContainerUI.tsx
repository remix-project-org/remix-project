// eslint-disable-next-line no-use-before-define
import { CustomTooltip } from '@remix-ui/helper'
import React, { useEffect, useRef } from 'react'
import { FormattedMessage } from 'react-intl'
import { InstanceContainerProps } from '../types'
import { UniversalDappUI } from './universalDappUI'

export function InstanceContainerUI(props: InstanceContainerProps) {
  const { instanceList } = props.instances

  const clearInstance = async() => {
    const isPinnedAvailable = await props.plugin.call('fileManager', 'exists', `.deploys/pinned-contracts/${props.plugin.REACT_API.chainId}`)
    if (isPinnedAvailable) await props.plugin.call('fileManager', 'remove', `.deploys/pinned-contracts/${props.plugin.REACT_API.chainId}`)
    props.clearInstances()
  }

  return (
    <div className="udapp_instanceContainer mt-2 border-0 list-group-item bg-dark">
      <div className="flex justify-between items-center p-2">
        <CustomTooltip placement="top-start" tooltipClasses="whitespace-nowrap" tooltipId="deployAndRunClearInstancesTooltip" tooltipText={<FormattedMessage id="udapp.tooltipText6" />}>
          <label className="udapp_deployedContracts whitespace-nowrap" data-id="deployedContracts">
            <FormattedMessage id="udapp.deployedContracts" />
          </label>
        </CustomTooltip>
        <CustomTooltip placement="top-start" tooltipClasses="whitespace-nowrap" tooltipId="numOfDeployedInstancesTooltip" tooltipText={<FormattedMessage id="udapp.numberOfDeployedContractsTooltip" />}>
          <div className="badge rounded-full text-bg-primary text-center ml-2" data-id="deployedContractsBadge">{instanceList.length}</div>
        </CustomTooltip>
        <div className="w-full"></div>
        {instanceList.length > 0 ? (
          <CustomTooltip
            placement={'auto-end'}
            tooltipClasses="whitespace-nowrap"
            tooltipId="deployAndRunClearInstancesTooltip"
            tooltipText={<FormattedMessage id="udapp.deployAndRunClearInstances" />}
          >
            <i className="far fa-trash-alt udapp_icon mr-1 mb-2" data-id="deployAndRunClearInstances" onClick={clearInstance} aria-hidden="true"></i>
          </CustomTooltip>
        ) : null}
      </div>

      {instanceList.length > 0 ? (
        <div>
          {' '}
          {props.instances.instanceList.map((instance, index) => {
            return (
              <UniversalDappUI
                key={index}
                instance={instance}
                context={props.getContext()}
                pinInstance={props.pinInstance}
                unpinInstance={props.unpinInstance}
                removeInstance={props.removeInstance}
                index={index}
                runTransactions={props.runTransactions}
                getFuncABIInputs={props.getFuncABIInputs}
                plugin={props.plugin}
                editInstance={props.editInstance}
                solcVersion={props.solcVersion}
                getVersion={props.getVersion}
                getCompilerDetails={props.getCompilerDetails}
                runTabState={props.runTabState}
                evmCheckComplete={props.evmCheckComplete}
              />
            )
          })}
        </div>
      ) : ''}
    </div>
  )
}
