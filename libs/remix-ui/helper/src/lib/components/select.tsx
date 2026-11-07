import React, { Ref, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Dropdown } from 'react-bootstrap'
import '../css/select.css'

export type SelectOption = {
  value: string
  label: React.ReactNode
  // second muted line in the list (e.g. a file path)
  sub?: React.ReactNode
  // trailing content of the list row (e.g. an icon)
  end?: React.ReactNode
  // options with the same group are listed under a header
  group?: string
  // what the search matches when the label isn't a string
  searchText?: string
  disabled?: boolean
  // extra attributes for the list item (e2e hooks)
  itemProps?: Record<string, string>
}

export interface SelectProps {
  // toggle id and data-id; the list is `<id>Items`, items are `<id>-<value>`
  id: string
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  dataId?: string
  menuDataId?: string
  itemDataId?: (option: SelectOption) => string
  // shown when no option matches the value; without it the first option is shown
  placeholder?: React.ReactNode
  // toggle content, defaults to the label of the current option
  renderValue?: (option: SelectOption | undefined) => React.ReactNode
  title?: string
  // accessible name when no <label> points at the id
  ariaLabel?: string
  disabled?: boolean
  // adds a search field at the top of the list
  searchable?: boolean
  searchPlaceholder?: string
  noResultsText?: React.ReactNode
  // small text toggle without a box, for pickers that sit inside another control (units, sort)
  compact?: boolean
  align?: 'start' | 'end'
  // render the list before the first open, for tests that wait on an item
  keepMounted?: boolean
  // render the list at the end of the page, for selects inside a modal or panel that clips it
  portal?: boolean
  className?: string
  menuClassName?: string
  onToggle?: (show: boolean) => void
}

// the select look: a form-select button with a sort icon. Dropdown needs the forwardRef to position the list
export const SelectToggle = React.forwardRef(
  ({ children, onClick, className = '', compact, ...rest }: { children: React.ReactNode, onClick: (e: React.MouseEvent) => void, className?: string, compact?: boolean }, ref: Ref<HTMLButtonElement>) => (
    <button
      ref={ref}
      type="button"
      {...rest}
      className={`${compact ? 'rx-select-compact' : 'form-select rx-select'} ${className.replace('dropdown-toggle', '')}`}
      onClick={(e) => {
        e.preventDefault()
        onClick(e)
      }}
    >
      {children}
      <i className={`${compact ? 'fas fa-caret-down' : 'fad fa-sort-circle'} rx-select-icon`} aria-hidden="true"></i>
    </button>
  )
)

// lists size themselves from --rx-select-ref-width (the toggle width), which also works when portalled
const popperConfig = {
  modifiers: [{
    name: 'referenceWidth',
    enabled: true,
    phase: 'beforeWrite' as const,
    requires: ['computeStyles'],
    fn: ({ state }) => {
      state.styles.popper['--rx-select-ref-width'] = `${state.rects.reference.width}px`
    },
    // set it before the first measure too, or a full-width list gets pushed to the page edge
    effect: ({ state }) => {
      state.elements.popper.style.setProperty('--rx-select-ref-width', `${state.elements.reference.getBoundingClientRect().width}px`)
    }
  }]
}

const optionText = (option: SelectOption) => option.searchText ?? (typeof option.label === 'string' ? option.label : option.value)

export const Select = (props: SelectProps) => {
  const { id, value, options, onChange, compact, searchable } = props
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const current = options.find((o) => o.value === value) || (props.placeholder === undefined ? options[0] : undefined)

  const q = query.trim().toLowerCase()
  const shown = q ? options.filter((o) => optionText(o).toLowerCase().includes(q)) : options

  const onToggle = (show: boolean) => {
    if (show && searchable) setTimeout(() => searchRef.current?.focus())
    if (!show) setQuery('')
    props.onToggle?.(show)
  }

  const wrapMenu = (menu: JSX.Element) => props.portal ? createPortal(menu, document.body) : menu

  let lastGroup: string | undefined
  return (
    <Dropdown className={`rx-select-wrap ${compact ? 'd-inline-block' : 'w-100'} ${props.className || ''}`} onToggle={onToggle} align={props.align}>
      <Dropdown.Toggle
        as={SelectToggle}
        compact={compact}
        id={id}
        data-id={props.dataId || id}
        data-value={current?.value ?? ''}
        title={props.title}
        aria-label={props.ariaLabel}
        disabled={props.disabled}
      >
        <span className={`rx-select-value ${current ? '' : 'rx-select-placeholder'}`}>
          {props.renderValue ? props.renderValue(current) : current ? current.label : props.placeholder}
        </span>
      </Dropdown.Toggle>
      {wrapMenu(<Dropdown.Menu className={`rx-select-menu ${compact ? '' : 'rx-select-menu-full'} ${props.portal ? 'rx-select-menu-portal' : ''} ${props.menuClassName || ''}`} data-id={props.menuDataId || `${id}Items`} renderOnMount={props.keepMounted} popperConfig={popperConfig}>
        {searchable && (
          <div className="rx-select-search">
            <i className="fas fa-search" aria-hidden="true"></i>
            <input
              ref={searchRef}
              type="text"
              className="form-control form-control-sm"
              data-id={`${id}Search`}
              placeholder={props.searchPlaceholder || 'Search'}
              aria-label={props.searchPlaceholder || 'Search'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // keep typing in the field; arrows and Escape still reach the dropdown
                if (e.key.length === 1) e.stopPropagation()
                // Enter would submit a surrounding form
                if (e.key === 'Enter') e.preventDefault()
              }}
            />
          </div>
        )}
        {shown.map((o) => {
          const header = o.group && o.group !== lastGroup ? <Dropdown.Header key={`group-${o.group}`}>{o.group}</Dropdown.Header> : null
          lastGroup = o.group
          return (
            <React.Fragment key={o.value}>
              {header}
              <Dropdown.Item
                as="button"
                // inside a <form> a plain button would submit it
                type="button"
                data-id={props.itemDataId ? props.itemDataId(o) : `${id}-${o.value}`}
                active={o.value === current?.value}
                disabled={o.disabled}
                onClick={() => onChange(o.value)}
                {...o.itemProps}
              >
                <span className="rx-select-label">
                  <span className="n">{o.label}</span>
                  {o.sub && <small>{o.sub}</small>}
                </span>
                {o.end}
              </Dropdown.Item>
            </React.Fragment>
          )
        })}
        {searchable && q && !shown.length && <div className="rx-select-empty">{props.noResultsText || 'No results'}</div>}
      </Dropdown.Menu>)}
    </Dropdown>
  )
}
