import React, { Dispatch } from 'react'
import { AiAssistantType, AiContextType, groupListType } from '../types/componentTypes'

export interface GroupListMenuProps {
  setChoice: Dispatch<React.SetStateAction<AiContextType | AiAssistantType | any>>
  choice: AiContextType | AiAssistantType | any
  setShowOptions: Dispatch<React.SetStateAction<boolean>>
  groupList: groupListType[]
  onLockedItemClick?: (item: groupListType) => void
}

export default function GroupListMenu(props: GroupListMenuProps) {

  return (
    <div className="btn-group-vertical w-full">
      {props.groupList.map((item, index) => (
        <button
          key={`${item.label}-${index}`}
          className={`btn btn-light border border-0 ${item.isLocked ? 'opacity-75' : ''}`}
          data-id={item.dataId}
          onClick={() => {
            props.setShowOptions(false)
            if (item.isLocked) {
              props.onLockedItemClick?.(item)
            } else {
              props.setChoice(item.stateValue)
            }
          }}
        >
          <div className="flex flex-col small text-left">
            <div className="flex items-center mb-1">
              <span className="form-check-label font-bold">{item.label}</span>
              {item.isLocked && (
                <span
                  className="badge bg-info ml-2 text-white"
                  style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                >
                  <i className="fas fa-flask mr-1" style={{ fontSize: '0.6rem' }}></i>
                  Beta
                </span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="form-check-label mr-2 whitespace-normal">{item.bodyText}</span>
              {props.choice === item.stateValue && !item.isLocked && <span className={item.icon}></span>}
            </div>
          </div>
        </button>
      ))}
    </div>
  )
}
