import React, { useEffect, useState } from 'react'
import { CustomTooltip } from '@remix-ui/helper'
import { FormattedMessage, useIntl } from 'react-intl'

interface ConfigInputProps {
  label: string
  id: string
  secret: boolean
  initialValue: string
  saveResult: (result: string) => void
}

// Chooses one contract from the compilation output.
export const ConfigInput: React.FC<ConfigInputProps> = ({ label, id, secret, initialValue, saveResult }) => {
  const [value, setValue] = useState(initialValue)
  const [enabled, setEnabled] = useState(false)
  const intl = useIntl()

  // Reset state when initialValue changes
  useEffect(() => {
    setValue(initialValue)
    setEnabled(false)
  }, [initialValue])

  const handleChange = () => {
    setEnabled(true)
  }

  const handleSave = () => {
    setEnabled(false)
    saveResult(value)
  }

  const handleCancel = () => {
    setEnabled(false)
    setValue(initialValue)
  }

  return (
    <div className="small mb-0">
      <label className='mt-3' htmlFor={id}>{label}</label>
      <div className="flex flex-row justify-start">
        <input
          type={secret ? 'password' : 'text'}
          className={`form-control small w-full ${!enabled ? 'bg-transparent pl-0 border-0' : ''}`}
          id={id}
          placeholder={intl.formatMessage({ id: "contract-verification.configInputPlaceholderText" }, { label })}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!enabled}
        />

        { enabled ? (
          <>
            <button type="button" className="btn btn-primary btn-sm ml-2" onClick={handleSave}>
              <FormattedMessage id="contract-verification.configInputSaveButton" />
            </button>
            <button type="button" className="inline-flex items-center px-4 py-2 bg-secondary text-white rounded-md hover:bg-secondary/90 transition-colors btn-sm ml-2" onClick={handleCancel}>
              <FormattedMessage id="contract-verification.configInputCancelButton" />
            </button>
          </>
        ) : (
          <CustomTooltip tooltipText={`Edit ${label}`}>
            <button type="button" className="inline-flex items-center px-3 py-1.5 text-sm rounded-md transition-colors fas fa-pen my-1" style={{ height: '100%' }} disabled={enabled} onClick={handleChange}>
            </button>
          </CustomTooltip>
        )}
      </div>
    </div>
  )
}
