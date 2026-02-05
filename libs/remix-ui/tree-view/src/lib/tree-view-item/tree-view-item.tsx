import React, {useState, useEffect} from 'react' // eslint-disable-line
import { TreeViewItemProps } from '../../types'

import './tree-view-item.css'

export const TreeViewItem = (props: TreeViewItemProps) => {
  const { id, children, label, labelClass, expand, iconX = 'fas fa-caret-right', iconY = 'fas fa-caret-down', icon, controlBehaviour = false, innerRef, showIcon = true, onClick, onIconClick, ...otherProps } = props
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    setIsExpanded(expand)
  }, [expand])

  const handleIconClick = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent event from bubbling up to parent div
    if (onIconClick) {
      onIconClick(e)
    } else if (!controlBehaviour) {
      setIsExpanded(!isExpanded)
    }
  }

  const handleLabelClick = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent event from bubbling up to parent div
    if (onClick) {
      onClick(e)
    } else if (!controlBehaviour && !onIconClick) {
      // Only handle expand/collapse here if there's no separate icon click handler
      setIsExpanded(!isExpanded)
    }
  }

  return (
    <li
      ref={innerRef}
      key={`treeViewLi${id}`}
      data-id={`treeViewLi${id}`}
      className="li_tv remixui_mouseover"
      {...otherProps}
    >
      <div
        key={`treeViewDiv${id}`}
        data-id={`treeViewDiv${id}`}
        className={`d-flex flex-row align-items-center ${labelClass}`}
        onClick={handleLabelClick}
      >
        {children && showIcon ? (
          <div
            data-id={`treeViewDivIcon${id}`}
            className={isExpanded ? `ps-2 ${iconY}` : `ps-2 ${iconX} caret caret_tv`}
            style={{ visibility: children ? 'visible' : 'hidden' }}
            onClick={handleIconClick}
          ></div>
        ) : icon ? (
          <div className={`pe-2 ps-2 ${icon} caret caret_tv`}></div>
        ) : null}
        <span className="w-100 ms-1 ps-2" data-id={`treeViewLabelDiv${id}`}>{label}</span>
      </div>
      {isExpanded ? <div className="ps-3">
        {children}
      </div> : null}
    </li>
  )
}

export default TreeViewItem
