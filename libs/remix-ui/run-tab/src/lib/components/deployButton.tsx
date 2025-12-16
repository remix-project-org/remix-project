import React, { useState } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { DeployButtonProps } from '../types'
import { ButtonGroup, Dropdown } from 'react-bootstrap'
import { CustomTooltip } from '@remix-ui/helper'

export function DeployButton(props: DeployButtonProps) {
  const intl = useIntl()
  const [showOptions, setShowOptions] = useState<boolean>(false)

  const toggleOptions = () => {
    setShowOptions(!showOptions)
  }

  return (
    <>
      {props.deployOptions && (props.deployOptions || []).length > 0 ? (
        <Dropdown as={ButtonGroup}>
          <button
            onClick={props.handleActionClick}
            className={`udapp_instanceButton ${props.buttonOptions.widthClass} btn btn-sm ${props.buttonOptions.classList}`}
            data-id={props.buttonOptions.dataId}
          >
            {props.deployOptions[props.selectedIndex] ? props.deployOptions[props.selectedIndex].title : intl.formatMessage({ id: 'udapp.deploy' })}
          </button>
          <Dropdown.Toggle
            split
            id="dropdown-split-basic"
            className={`btn btn-sm dropdown-toggle dropdown-toggle-split ${props.buttonOptions.classList}`}
            style={{ maxWidth: 25, minWidth: 0, height: 32 }}
          />
          <Dropdown.Menu className="deploy-items border-0">
            {props.deployOptions.map(({ title, active }, index) => (
              <Dropdown.Item
                onClick={() => {
                  props.setSelectedIndex(index)
                  toggleOptions()
                }}
                key={index}
              >
                {' '}
                {props.selectedIndex === index ? <span>&#10003; {title} </span> : <span className="ps-3">{title}</span>}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
      ) : (
        <CustomTooltip placement="top" tooltipId="deployButtonTooltip" tooltipClasses="text-nowrap" tooltipText={props.buttonOptions.title}>
          <button
            onClick={props.handleActionClick}
            className={`udapp_instanceButton ${props.buttonOptions.widthClass} btn btn-sm ${props.buttonOptions.classList}`}
            data-id={props.buttonOptions.dataId}
          >
            <FormattedMessage id="udapp.deploy" />
          </button>
        </CustomTooltip>
      )}
    </>
  )
}
