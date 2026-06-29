import { useContext, useEffect, useRef, useState } from 'react'
import { AbiCoder } from 'ethers'

import { AppContext } from '../AppContext'
import { ContractDropdownSelection } from './ContractDropdown'
import { FormattedMessage } from 'react-intl'

interface ConstructorArgumentsProps {
  abiEncodedConstructorArgs: string
  setAbiEncodedConstructorArgs: React.Dispatch<React.SetStateAction<string>>
  abiEncodingError: string
  setAbiEncodingError: React.Dispatch<React.SetStateAction<string>>
  selectedContract: ContractDropdownSelection
}

export const ConstructorArguments: React.FC<ConstructorArgumentsProps> = ({ abiEncodedConstructorArgs, setAbiEncodedConstructorArgs, abiEncodingError, setAbiEncodingError, selectedContract }) => {
  const { compilationOutput } = useContext(AppContext)
  const [toggleRawInput, setToggleRawInput] = useState<boolean>(false)

  const { triggerFilePath, filePath, contractName } = selectedContract
  const selectedCompilerAbstract = triggerFilePath && compilationOutput[triggerFilePath]
  const compiledContract = selectedCompilerAbstract?.data?.contracts?.[filePath]?.[contractName]
  const abi = compiledContract?.abi

  const abiConstructorArgs = abi && abi.find((a) => a.type === 'constructor')?.inputs
  const constructorArgs = abiConstructorArgs || []

  const decodeConstructorArgs = (value: string) => {
    try {
      const decodedObj = AbiCoder.defaultAbiCoder().decode(
        constructorArgs.map((inp) => inp.type),
        value
      )
      const decoded = decodedObj.map((val) => {
        if (typeof val === 'bigint') {
          return val.toString()
        }
        return JSON.stringify(val)
      })
      return { decoded, errorMessage: '' }
    } catch (e) {
      console.error(e)
      const errorMessage = 'Decoding error: ' + e.message
      const decoded = Array(constructorArgs?.length ?? 0).fill('')
      return { decoded, errorMessage }
    }
  }

  const [constructorArgsValues, setConstructorArgsValues] = useState<string[]>(abiEncodedConstructorArgs ? decodeConstructorArgs(abiEncodedConstructorArgs).decoded : Array(constructorArgs?.length ?? 0).fill(''))

  const constructorArgsInInitialState = useRef(true)
  useEffect(() => {
    // Ensures that error is not reset when tabs are switched
    if ((!abiEncodingError && !abiEncodedConstructorArgs) || !constructorArgsInInitialState.current) {
      setAbiEncodingError(constructorArgs.length === 0 ? '' : 'Some constructor arguments are missing')
    }

    if (constructorArgsInInitialState.current) {
      constructorArgsInInitialState.current = false
      return
    }
    setAbiEncodedConstructorArgs('')
    setConstructorArgsValues(Array(constructorArgs.length).fill(''))
  }, [abiConstructorArgs])

  const handleConstructorArgs = (value: string, index: number) => {
    const changedConstructorArgsValues = [...constructorArgsValues.slice(0, index), value, ...constructorArgsValues.slice(index + 1)]
    setConstructorArgsValues(changedConstructorArgsValues)

    // if any constructorArgsValue is falsey (empty etc.), don't encode yet
    if (changedConstructorArgsValues.some((value) => !value)) {
      setAbiEncodedConstructorArgs('')
      setAbiEncodingError('Some constructor arguments are missing')
      return
    }

    const types = constructorArgs.map((inp) => inp.type)
    const parsedArgsValues = []
    for (const arg of changedConstructorArgsValues) {
      try {
        parsedArgsValues.push(JSON.parse(arg))
      } catch (e) {
        parsedArgsValues.push(arg)
      }
    }

    try {
      const newAbiEncoding = AbiCoder.defaultAbiCoder().encode(types, parsedArgsValues)
      setAbiEncodedConstructorArgs(newAbiEncoding)
      setAbiEncodingError('')
    } catch (e) {
      console.error(e)
      setAbiEncodedConstructorArgs('')
      setAbiEncodingError('Encoding error: ' + e.message)
    }
  }

  const handleRawConstructorArgs = (value: string) => {
    setAbiEncodedConstructorArgs(value)
    const { decoded, errorMessage } = decodeConstructorArgs(value)
    setConstructorArgsValues(decoded)
    setAbiEncodingError(errorMessage)
  }

  if (!selectedContract) return null
  if (!compilationOutput && Object.keys(compilationOutput).length === 0) return null
  // No render if no constructor args
  if (constructorArgs.length === 0) return null

  return (
    <div className="mt-4">
      <label><FormattedMessage id="contract-verification.constructorArgumentsLabel" /></label>
      <div className="d-flex py-1 align-items-center form-check">
        <input className="form-check-input" type="checkbox" id="toggleRawInputSwitch" checked={toggleRawInput} onChange={() => setToggleRawInput(!toggleRawInput)} />
        <label className="m-0 form-check-label" style={{ paddingTop: '2px' }} htmlFor="toggleRawInputSwitch">
          <FormattedMessage id="contract-verification.constructorArgumentsToggleRawInput" />
        </label>
      </div>
      {toggleRawInput ? (
        <div>
          {' '}
          <textarea className="form-control" rows={5} placeholder="0x00000000000000000000000000000000d41867734bbee4c6863d9255b2b06ac1..." value={abiEncodedConstructorArgs} onChange={(e) => handleRawConstructorArgs(e.target.value)} />
          {abiEncodedConstructorArgs && abiEncodingError && <div className="text-danger small">{abiEncodingError}</div>}
        </div>
      ) : (
        <div>
          {constructorArgs.map((inp, i) => (
            <div key={`constructor-arg-${inp.name}`} className="d-flex flex-row align-items-center justify-content-between mb-2">
              <div className="me-2 small">{inp.name}</div>
              <input className="form-control" placeholder={inp.type} value={constructorArgsValues[i] ?? ''} onChange={(e) => handleConstructorArgs(e.target.value, i)} />
            </div>
          ))}
          {abiEncodedConstructorArgs && (
            <div>
              <label className="form-check-label" htmlFor="rawAbiEncodingResult">
                <FormattedMessage id="contract-verification.constructorArgumentsRawAbiEncodingResult" defaultMessage="ABI-encoded constructor arguments" /> :
              </label>
              <textarea className="form-control" rows={5} disabled value={abiEncodedConstructorArgs} id="rawAbiEncodingResult" style={{ opacity: 0.5 }} />
            </div>
          )}
          {constructorArgsValues.some((value) => !!value) && abiEncodingError && <div className="text-danger small">{abiEncodingError}</div>}
        </div>
      )}
    </div>
  )
}
