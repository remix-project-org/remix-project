import { CustomTooltip } from '@remix-ui/helper'
import React from 'react'
import { DeployInputProps } from '../types'
import { DeployButton } from './deployButton'

export function DeployInput(props: DeployInputProps) {
  return (
    <div className="udapp_contractActionsContainerSingle" style={{ display: 'flex' }}>
      <DeployButton
        buttonOptions={props.buttonOptions}
        selectedIndex={props.selectedIndex}
        setSelectedIndex={props.setSelectedIndex}
        handleActionClick={props.handleActionClick}
        deployOptions={props.deployOptions}
      />
      <CustomTooltip
        placement="right"
        tooltipId="deployInputTooltip"
        tooltipClasses="whitespace-nowrap"
        tooltipText={props.funcABI.type === 'fallback' || props.funcABI.type === 'receive' ? `'(${props.funcABI.type}')` : props.inputs}
      >
        <input
          className="form-control border"
          data-id={props.funcABI.type === 'fallback' || props.funcABI.type === 'receive' ? `'(${props.funcABI.type}')` : 'multiParamManagerBasicInputField'}
          placeholder={props.inputs}
          onChange={props.handleBasicInput}
          ref={props.basicInputRef}
          style={{
            visibility: !props.inputs ? 'hidden' : 'visible',
            height: props.funcABI.type === 'fallback' || props.funcABI.type === 'receive' ? '0' : ''
          }}
        />
      </CustomTooltip>
    </div>
  )
}
