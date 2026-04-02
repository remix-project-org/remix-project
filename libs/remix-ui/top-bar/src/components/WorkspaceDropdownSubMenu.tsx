import React from 'react'
import { Dropdown } from 'react-bootstrap'

export interface WorkspaceDropdownSubMenuProps {
  menuItems: { label: string, onClick: () => void, icon: string }[]
  style: React.CSSProperties
}

export function WorkspaceDropdownSubMenu ({ menuItems, style }: WorkspaceDropdownSubMenuProps) {
  return (
    <div
      className="border bg-light pt-2"
      style={style}
    >
      <ul className="list-unstyled">
        {menuItems.map((item, index) => {
          if (index < menuItems.length - 1) {
            return (
              <Dropdown.Item
                key={item.label}
                onClick={item.onClick}
                className="no-underline"
              >
                <span className="flex justify-evenly items-center">
                  <i className={item.icon}></i>
                  <span className="pl-2">{item.label}</span>
                </span>
              </Dropdown.Item>
            )
          } else {
            return [
              <Dropdown.Divider
                className="border mb-0 mt-0 remixui_menuhr"
                style={{ pointerEvents: 'none' }}
                key="divider"
              />,
              <Dropdown.Item
                key={item.label}
                onClick={item.onClick}
                className="no-underline"
              >
                <span className="flex justify-evenly items-center text-danger">
                  <i className={item.icon}></i>
                  <span className="pl-2">{item.label}</span>
                </span>
              </Dropdown.Item>
            ]
          }
        })}
      </ul>
    </div>
  )
}
