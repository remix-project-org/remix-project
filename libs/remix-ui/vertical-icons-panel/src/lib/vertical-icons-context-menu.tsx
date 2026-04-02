import { Plugin } from '@remixproject/engine'
import React, { Fragment, useEffect, useState, useRef } from 'react'
import { FormattedMessage } from 'react-intl'

export interface VerticalIconsContextMenuProps extends React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
  pageX: number
  pageY: number
  profileName: string
  links: {Documentation: string; CanDeactivate: boolean}
  canBeDeactivated: boolean
  verticalIconPlugin: any
  hideContextMenu: () => void
  contextMenuAction: (evt: any, profileName: string, documentation: string) => void
}

interface MenuLinksProps {
  listItems: {Documentation: string; CanDeactivate: boolean}
  hide: () => void
  profileName: string
  canBeDeactivated: boolean
  verticalIconPlugin: any
  ref?: React.MutableRefObject<any>
  toggle: (name: string) => void
  contextMenuAction: (evt: any, profileName: string, documentation: string) => void
}

const VerticalIconsContextMenu = (props: VerticalIconsContextMenuProps) => {
  const menuRef = useRef(null)
  const [hasContextMenu, setHasContextMenu] = useState(false)

  ClickOutside(menuRef, props.hideContextMenu)
  useEffect(() => {
    // @ts-ignore
    menuRef.current.focus()
  }, [])
  useEffect (() => {
    setHasContextMenu(props.links.Documentation !=="" || props.links.CanDeactivate)
  }, [props.links, props.contextMenuAction])

  return (
    <div
      id="menuItemsContainer"
      className="p-2 text-left remixui_verticalIconContextcontainer bg-light shadow border"
      style={{
        left: props.pageX,
        top: props.pageY,
        display: hasContextMenu ? 'block' : 'none',
      }}
      ref={menuRef}
      tabIndex={1}
    >
      <ul id="menuitems">
        <MenuForLinks
          hide={props.hideContextMenu}
          listItems={props.links}
          profileName={props.profileName}
          canBeDeactivated={props.canBeDeactivated}
          verticalIconPlugin={props.verticalIconPlugin}
          toggle={props.verticalIconPlugin.toggle}
          contextMenuAction={props.contextMenuAction}
        />
      </ul>
    </div>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MenuForLinks = ({ listItems, hide, profileName, contextMenuAction }: MenuLinksProps) => {
  return (
    <Fragment>
      {listItems.CanDeactivate ? (
        <li
          id="menuitemdeactivate"
          onClick={(evt) => {
            contextMenuAction(evt, profileName, listItems.Documentation)
            hide()
          }}
          className="remixui_liitem"
          key="menuitemdeactivate"
        >
          <FormattedMessage id="pluginManager.deactivate" />
        </li>
      ) : null}
      {listItems.Documentation && listItems.Documentation.length > 0 && (
        <li id="menuitemdocumentation" className="remixui_liitem" key="menuitemdocumentation">
          <a onClick={hide} href={listItems.Documentation} target="_blank">
            <FormattedMessage id="home.documentation" />
          </a>
        </li>
      )}
    </Fragment>
  )
}

function ClickOutside(ref: React.MutableRefObject<HTMLElement>, hideFn: () => void) {
  useEffect(() => {
    function handleClickOutside(event: any) {
      if (ref.current && !ref.current.contains(event.target)) {
        hideFn()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [ref])
}

export default VerticalIconsContextMenu
