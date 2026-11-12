import { TemplateExplorerContext } from '../../context/template-explorer-context'
import React, { useContext, useEffect } from 'react'
import { Select } from '@remix-ui/helper'

const contractTypeOptions = ['ERC20', 'ERC721', 'ERC1155'].map((type) => ({ value: type, label: type }))

export function ContractTagSelector (props: any) {
  const { state } = useContext(TemplateExplorerContext)

  useEffect(() => {
    props.switching(state.contractTag.toLowerCase() as 'erc20' | 'erc721' | 'erc1155')
  }, [state.contractTag, state.contractType])

  return (
    <div className="d-flex align-items-center gap-2">
      <div className="tem-wizard-select-wrapper">
        <Select
          id="contract-wizard-language-dropdown"
          value="Solidity"
          options={[{ value: 'Solidity', label: 'Solidity' }]}
          onChange={() => {}}
          disabled
        />
      </div>
      <div className="tem-wizard-select-wrapper">
        <Select
          id="contract-wizard-contract-type-dropdown"
          value={state.contractTag}
          options={contractTypeOptions}
          onChange={(value) => props.switching(value.toLowerCase() as 'erc20' | 'erc721' | 'erc1155')}
          itemDataId={(o) => `contract-wizard-contract-type-dropdown-item-${o.value.toLowerCase()}`}
        />
      </div>
    </div>
  )
}
