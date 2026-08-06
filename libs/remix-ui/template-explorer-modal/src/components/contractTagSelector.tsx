import { TemplateExplorerContext } from '../../context/template-explorer-context'
import React, { useContext, useEffect } from 'react'

export function ContractTagSelector (props: any) {
  const { state } = useContext(TemplateExplorerContext)

  useEffect(() => {
    props.switching(state.contractTag.toLowerCase() as 'erc20' | 'erc721' | 'erc1155')
  }, [state.contractTag, state.contractType])

  return (
    <div className="d-flex align-items-center gap-2">
      <div className="tem-wizard-select-wrapper">
        <select
          id="contract-wizard-language-dropdown"
          data-id="contract-wizard-language-dropdown"
          className="tem-wizard-select"
          disabled
        >
          <option>Solidity</option>
        </select>
        <i className="fa-solid fa-chevron-down tem-wizard-select-arrow"></i>
      </div>
      <div className="tem-wizard-select-wrapper">
        <select
          id="contract-wizard-contract-type-dropdown"
          data-id="contract-wizard-contract-type-dropdown"
          className="tem-wizard-select"
          value={state.contractTag}
          onChange={(e) => props.switching(e.target.value.toLowerCase() as 'erc20' | 'erc721' | 'erc1155')}
        >
          <option data-id="contract-wizard-contract-type-dropdown-item-erc20" value="ERC20">ERC20</option>
          <option data-id="contract-wizard-contract-type-dropdown-item-erc721" value="ERC721">ERC721</option>
          <option data-id="contract-wizard-contract-type-dropdown-item-erc1155" value="ERC1155">ERC1155</option>
        </select>
        <i className="fa-solid fa-chevron-down tem-wizard-select-arrow"></i>
      </div>
    </div>
  )
}
