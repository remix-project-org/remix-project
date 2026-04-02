import { CustomTooltip } from '@remix-ui/helper'
import { FormattedMessage } from 'react-intl'
import React, { useRef } from 'react'
import { MultiDeployInputProps } from '../types'
import { DeployButton } from './deployButton'

export function MultiDeployInput(props: MultiDeployInputProps) {
  const multiFields = useRef<Array<HTMLInputElement | null>>([])

  return (
    <div className="udapp_contractActionsContainerMulti" style={{ display: 'flex' }}>
      <div className="udapp_contractActionsContainerMultiInner text-dark">
        <div className="pt-2 udapp_multiHeader">
          <div className="udapp_multiTitle run-instance-multi-title">
            <FormattedMessage id="udapp.deploy" />
          </div>
        </div>
        <div>
          {props.inputs.map((inp, index) => {
            return (
              <div className="udapp_multiArg" key={index}>
                <label htmlFor={inp.name}> {inp.name}: </label>
                <CustomTooltip placement="left-end" tooltipId="udappMultiArgTooltip" tooltipClasses="whitespace-nowrap" tooltipText={inp.name}>
                  <input
                    ref={(el) => {
                      multiFields.current[index] = el
                    }}
                    className="form-control border"
                    placeholder={inp.type}
                    data-id={`multiParamManagerInput${inp.name}`}
                  />
                </CustomTooltip>
              </div>
            )
          })}
        </div>
        <div className="udapp_group udapp_multiArg">
          {/* <CopyToClipboard tip='Encode values of input fields & copy to clipboard' icon='fa-clipboard' direction={'left'} getContent={getContentOnCTC} /> */}
          <DeployButton
            buttonOptions={props.buttonOptions}
            selectedIndex={props.selectedIndex}
            setSelectedIndex={props.setSelectedIndex}
            handleActionClick={() => {
              props.handleMultiValsSubmit(multiFields.current)
            }}
            deployOptions={props.deployOptions}
          />
        </div>
      </div>
    </div>
  )
}
