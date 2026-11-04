import React, { Ref } from 'react'
import { Dropdown } from 'react-bootstrap'

// the select look shared by every picker of the panel: a form-select button that opens an sc-menu list
export const PickerToggle = React.forwardRef(
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
      <i className="fad fa-sort-circle sc-picker-icon" aria-hidden="true"></i>
    </button>
  )
)

export type PickerOption = {
  value: string
  label: React.ReactNode
  // extra attributes for the list item (e2e hooks)
  itemProps?: Record<string, string>
}

// a select with the panel look. The toggle carries `id`, `data-id` and `data-value`; items are `<id>-<value>`
export const Picker = ({ id, value, options, onChange, title }: { id: string, value: string, options: PickerOption[], onChange: (value: string) => void, title?: string }) => {
  const current = options.find((o) => o.value === value) || options[0]

  return (
    <Dropdown className="w-100">
      <Dropdown.Toggle as={PickerToggle} id={id} data-id={id} data-value={current?.value} title={title}>
        <span className="n">{current?.label}</span>
      </Dropdown.Toggle>
      <Dropdown.Menu className="sc-menu sc-menu-full" data-id={`${id}Items`} renderOnMount>
        {options.map((o) => (
          <Dropdown.Item as="button" key={o.value} data-id={`${id}-${o.value}`} active={o.value === current?.value} onClick={() => onChange(o.value)} {...o.itemProps}>
            <span className="n">{o.label}</span>
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  )
}
