import React, { useEffect, useContext } from 'react'
import { AppContext } from '../AppContext'
import { FormattedMessage } from 'react-intl'
import { Select, SelectOption } from '@remix-ui/helper'

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

  const hasContracts = compilationOutput && Object.keys(compilationOutput).length > 0

  const options: SelectOption[] = []
  if (hasContracts) {
    for (const triggerFilePath of Object.keys(compilationOutput)) {
      const contracts = compilationOutput[triggerFilePath].data.contracts
      for (const filePath of Object.keys(contracts)) {
        for (const contractName of Object.keys(contracts[filePath])) {
          options.push({
            value: JSON.stringify({ triggerFilePath, filePath, contractName }),
            label: contractName,
            sub: filePath,
            searchText: `${contractName} ${filePath}`,
            group: `Compilation trigger: ${triggerFilePath}`
          })
        }
      }
    }
  }

  const renderValue = (option: SelectOption | undefined) => {
    if (!option) return <span className="text-warning"><FormattedMessage id="contract-verification.contractDropDownDefaultText" defaultMessage={'Compiled contract required'} /></span>
    return <>{option.label}<span className="p">{option.sub}</span></>
  }

  return (
    <div className="mb-3">
      <label htmlFor={id}><FormattedMessage id="contract-verification.contractDropdownLabel" defaultMessage={label} values={{ label }} /></label>
      <Select
        id={id}
        className="mt-1"
        value={selectedContract ? JSON.stringify(selectedContract) : ''}
        options={options}
        onChange={(value) => setSelectedContract(JSON.parse(value))}
        placeholder={hasContracts ? undefined : ''}
        renderValue={renderValue}
        disabled={!hasContracts}
      />
    </div>
  )
}
