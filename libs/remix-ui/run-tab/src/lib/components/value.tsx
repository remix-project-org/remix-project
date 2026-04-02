// eslint-disable-next-line no-use-before-define
import React, { useEffect, useRef, useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { BN } from 'bn.js'
import { CustomTooltip, isNumeric } from '@remix-ui/helper'
import { ValueProps } from '../types'

export function ValueUI(props: ValueProps) {
  const inputValue = useRef<HTMLInputElement>({} as HTMLInputElement)

  useEffect(() => {
    if (props.sendValue !== inputValue.current.value) {
      inputValue.current.value = props.sendValue
    }
  },[props.sendValue])

  const validateValue = (e) => {
    const value = e.target.value

    if (!value) {
      // assign 0 if given value is
      // - empty
      inputValue.current.value = '0'
      props.setSendValue('0')
      return
    }

    let v
    try {
      v = new BN(value, 10)
      props.setSendValue(v.toString(10))
    } catch (e) {
      // assign 0 if given value is
      // - not valid (for ex 4345-54)
      // - contains only '0's (for ex 0000) copy paste or edit
      inputValue.current.value = '0'
      props.setSendValue('0')
    }

    // if given value is negative(possible with copy-pasting) set to 0
    if (v.lt(0)) {
      inputValue.current.value = '0'
      props.setSendValue('0')
    }
  }

  return (
    <div className="udapp_crow">
      <label className="udapp_settingsLabel" data-id="remixDRValueLabel">
        <FormattedMessage id="udapp.value" />
      </label>
      <div className="flex udapp_gasValueContainer">
        <CustomTooltip placement={'top-start'} tooltipClasses="whitespace-nowrap" tooltipId="remixValueTooltip" tooltipText={<FormattedMessage id="udapp.tooltipText5" />}>
          <input
            ref={inputValue}
            type="number"
            min="0"
            pattern="^[0-9]"
            step="1"
            className="col py-2 border border-theme rounded-l-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            id="value"
            data-id="dandrValue"
            onChange={validateValue}
            value={props.sendValue}
          />
        </CustomTooltip>
        <div>
          <select
            name="unit"
            value={props.sendUnit}
            className="px-3 py-2 border border-l-0 border-theme rounded-r-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            id="unit"
            onChange={(e) => {
              props.setUnit(e.target.value as 'ether' | 'finney' | 'gwei' | 'wei')
            }}
          >
            <option data-unit="wei" value="wei">
              Wei
            </option>
            <option data-unit="gwei" value="gwei">
              Gwei
            </option>
            <option data-unit="finney" value="finney">
              Finney
            </option>
            <option data-unit="ether" value="ether">
              Ether
            </option>
          </select>
        </div>
      </div>
    </div>
  )
}
