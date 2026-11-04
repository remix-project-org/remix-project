import React from 'react'
import { Dropdown } from 'react-bootstrap'
import { PickerToggle } from './picker'

type CompiledContract = { name: string, file: string, path?: string }

// contract name + muted file name; the list shows the full path. Items stay mounted so tests can wait for a contract
export const ContractPicker = ({ contracts, value, onChange }: { contracts: CompiledContract[], value: string, onChange: (name: string) => void }) => {
  const current = contracts.find((c) => c.name === value) || contracts[0]

  return (
    <Dropdown className="w-100">
      <Dropdown.Toggle as={PickerToggle} id="compiledContracts" data-id="compiledContracts">
        <span className="n">{current?.name}</span>
        <span className="p">{current?.file.split('/').pop()}</span>
      </Dropdown.Toggle>
      <Dropdown.Menu className="sc-menu sc-menu-full" data-id="compiledContractsItems" renderOnMount>
        {contracts.map((c) => (
          <Dropdown.Item as="button" key={c.name} data-id={`compiledContract-${c.name}`} active={c.name === current?.name} onClick={() => onChange(c.name)}>
            <span>
              <span className="n">{c.name}</span>
              <small>{c.path || c.file}</small>
            </span>
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  )
}
