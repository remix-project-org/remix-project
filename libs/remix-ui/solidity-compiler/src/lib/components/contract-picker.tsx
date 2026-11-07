import React from 'react'
import { Select } from '@remix-ui/helper'

type CompiledContract = { name: string, file: string, path?: string }

// contract name + muted file name; the list shows the full path. Items stay mounted so tests can wait for a contract
export const ContractPicker = ({ contracts, value, onChange }: { contracts: CompiledContract[], value: string, onChange: (name: string) => void }) => (
  <Select
    id="compiledContracts"
    keepMounted
    value={value}
    onChange={onChange}
    itemDataId={(o) => `compiledContract-${o.value}`}
    options={contracts.map((c) => ({ value: c.name, label: c.name, sub: c.path || c.file, searchText: `${c.name} ${c.path || c.file}` }))}
    renderValue={(o) => o && (
      <>
        <span className="n">{o.value}</span>
        <span className="p">{contracts.find((c) => c.name === o.value)?.file.split('/').pop()}</span>
      </>
    )}
  />
)
