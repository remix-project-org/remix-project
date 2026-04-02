import React, { useEffect, useState, useContext, Fragment } from 'react'
import './ContractDropdown.css'
import { AppContext } from '../AppContext'
import { FormattedMessage } from 'react-intl'

export interface ContractDropdownSelection {
  triggerFilePath: string
  filePath: string
  contractName: string
}

interface ContractDropdownProps {
  label: string
  id: string
  selectedContract: ContractDropdownSelection
  setSelectedContract: (selection: ContractDropdownSelection) => void
}

// Chooses one contract from the compilation output.
export const ContractDropdown: React.FC<ContractDropdownProps> = ({ label, id, selectedContract, setSelectedContract }) => {
  const { compilationOutput } = useContext(AppContext)

  useEffect(() => {
    if (!compilationOutput || !!selectedContract) return
    // Otherwise select the first by default
    const triggerFilePath = Object.keys(compilationOutput)[0]
    const contracts = compilationOutput[triggerFilePath]?.data?.contracts
    if (contracts && Object.keys(contracts).length) {
      const firstFilePath = Object.keys(contracts)[0]
      const contractsInFile = contracts[firstFilePath]
      if (contractsInFile && Object.keys(contractsInFile).length) {
        const firstContractName = Object.keys(contractsInFile)[0]
        setSelectedContract({ triggerFilePath, filePath: firstFilePath, contractName: firstContractName })
      }
    }
  }, [compilationOutput])

  const handleSelectContract = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedContract(JSON.parse(event.target.value))
  }

  const hasContracts = compilationOutput && Object.keys(compilationOutput).length > 0

  return (
    <div className="mb-3">
      <label htmlFor={id}><FormattedMessage id="contract-verification.contractDropdownLabel" defaultMessage={label} values={{ label }} /></label>
      <select value={selectedContract ? JSON.stringify(selectedContract) : ''}
        className={`form-select pr-4 mt-1 ${!hasContracts ? 'disabled-cursor text-warning' : ''}`}
        id={id}
        disabled={!hasContracts}
        onChange={handleSelectContract}
      >
        {hasContracts ? (
          Object.keys(compilationOutput).map((compilationTriggerFileName) => (
            <optgroup key={compilationTriggerFileName} label={`Compilation trigger: ${compilationTriggerFileName}`}>
              {Object.keys(compilationOutput[compilationTriggerFileName].data.contracts).map((fileName) => {
                return Object.keys(compilationOutput[compilationTriggerFileName].data.contracts[fileName]).map((contractName) => {
                  const value = JSON.stringify({ triggerFilePath: compilationTriggerFileName, filePath: fileName, contractName: contractName })
                  return (
                    <option key={`${compilationTriggerFileName}:${fileName}:${contractName}`} value={value}>
                      {contractName} - {fileName}
                    </option>
                  )
                })
              })}
            </optgroup>
          ))
        ) : (
          <option value={''}><FormattedMessage id="contract-verification.contractDropDownDefaultText" defaultMessage={'Compiled contract required'} /></option>
        )}
      </select>
    </div>
  )
}
