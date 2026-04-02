// eslint-disable-next-line no-use-before-define
import { CustomTooltip } from '@remix-ui/helper'
import React, { useEffect, useRef, useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { GasPriceProps } from '../types'

const defaultGasLimit = 3000000
export function GasLimitUI(props: GasPriceProps) {
  const inputComponent = useRef<HTMLInputElement>(null)
  const currentGasLimit = useRef(defaultGasLimit)
  const [gasLimitAuto, setGasLimitAuto] = useState(true)

  useEffect(() => {
    handleGasLimitAuto()
  }, [])

  useEffect(() => {
    handleGasLimitAuto()
  }, [gasLimitAuto])

  const handleGasLimit = (e) => {
    props.setGasFee(e.target.value)
  }

  const handleGasLimitAuto = () => {
    if (gasLimitAuto) {
      currentGasLimit.current = parseInt(inputComponent.current.value)
      props.setGasFee(0)
    } else {
      props.setGasFee(currentGasLimit.current)
    }
  }

  return (
    <div className="udapp_crow">
      <label className="udapp_settingsLabel">
        <FormattedMessage id="udapp.gasLimit" />
      </label>
      <div className='pl-0 udapp_col2 udapp_gasNval'>
        <div className="flex pb-1">
          <input
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            type="radio"
            name="gasLimitRadio"
            value="auto"
            onChange={() => setGasLimitAuto(!gasLimitAuto)}
            checked={gasLimitAuto}
            id="glAutoConfig"
          />
          <label className="ml-2 text-sm font-medium text-gray-900 dark:text-gray-300" htmlFor="glAutoConfig" data-id="glAutoConfiguration">
            <FormattedMessage id="udapp.gasLimitAuto" />
          </label>
        </div>
        <div className="flex items-baseline">
          <input
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
            type="radio"
            name="gasLimitRadio"
            value="manual"
            onChange={() => setGasLimitAuto(!gasLimitAuto)}
            checked={!gasLimitAuto}
            id="glManualConfig"
          />
          <label className="mb-1 w-1/2 ml-2 text-sm font-medium text-gray-900 dark:text-gray-300" htmlFor="glManualConfig" data-id="glManualConfiguration">
            <FormattedMessage id="udapp.gasLimitManual" />
          </label>
          <CustomTooltip placement={'auto-end'} tooltipClasses="whitespace-nowrap" tooltipId="remixGasPriceTooltip" tooltipText={<FormattedMessage id="udapp.tooltipText4" />}>
            <input
              type="number"
              ref={inputComponent}
              disabled={gasLimitAuto}
              className="w-full px-3 py-2 border border-theme rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-100 dark:disabled:bg-gray-600 disabled:text-gray-500"
              id="gasLimit"
              value={props.gasLimit === 0 ? currentGasLimit.current : props.gasLimit}
              onChange={handleGasLimit}
            />
          </CustomTooltip>
        </div>
      </div>
    </div>
  )
}
