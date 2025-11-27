import { Dropdown, DropdownButton } from 'react-bootstrap'
import { TemplateExplorerContext } from '../../context/template-explorer-context'
import React, { useContext, useEffect } from 'react'

export function ContractTagSelector (props: any) {
  const { state } = useContext(TemplateExplorerContext)

  useEffect(() => {
    props.switching(state.contractTag.toLowerCase() as 'erc20' | 'erc721' | 'erc1155')
  }, [state.contractTag, state.contractType])

  return (
    <div className="d-flex align-items-center gap-2">
      <DropdownButton id="contract-wizard-language-dropdown" data-id="contract-wizard-language-dropdown" variant="secondary" title="Solidity">
        <Dropdown.Item>Solidity</Dropdown.Item>
      </DropdownButton>
      <DropdownButton
        id="contract-wizard-contract-type-dropdown"
        data-id="contract-wizard-contract-type-dropdown"
        title={`${state.contractTag}`}
        variant="secondary"
      >
        <Dropdown.Item data-id="contract-wizard-contract-type-dropdown-item-erc20" onClick={() => props.switching('erc20')}>ERC20</Dropdown.Item>
        <Dropdown.Item data-id="contract-wizard-contract-type-dropdown-item-erc721" onClick={() => props.switching('erc721')}>ERC721</Dropdown.Item>
        <Dropdown.Item data-id="contract-wizard-contract-type-dropdown-item-erc1155" onClick={() => props.switching('erc1155')}>ERC1155</Dropdown.Item>
      </DropdownButton>
    </div>
  )
}
