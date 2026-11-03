import React, { Ref } from 'react'
import { Dropdown } from 'react-bootstrap'

type CompiledContract = { name: string, file: string, path?: string }

const PickerToggle = React.forwardRef(
  ({ children, onClick, className, ...rest }: { children: React.ReactNode, onClick: (e: React.MouseEvent) => void, className?: string }, ref: Ref<HTMLButtonElement>) => (
    <button
      ref={ref}
      type="button"
      {...rest}
      className="form-select sc-picker"
      onClick={(e) => {
        e.preventDefault()
        onClick(e)
      }}
    >
      {children}
    </button>
  )
)

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
