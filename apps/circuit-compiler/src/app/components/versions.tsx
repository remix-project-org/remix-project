import { AppState } from "../types"
import { Dropdown } from "react-bootstrap"
import React, { Ref } from "react"
import isElectron from 'is-electron'

export function VersionList ({ currentVersion, versionList, downloadList, setVersion }: { versionList: AppState['versionList'], currentVersion: string, setVersion: (version: string) => void , downloadList: string[]}) {
  const versionListKeys = Object.keys(versionList)
  return (
    <Dropdown>
      <Dropdown.Toggle as={CircomVersionMenuToggle} id="circomVersionList" className="inline-flex items-center px-4 py-2 bg-light text-dark rounded-md hover:bg-light/90 transition-colors btn-block w-full inline-block border form-select">
        <div className="font-sm" style={{ flexGrow: 1, overflow: 'hidden', display:'flex', justifyContent:'left' }}>
          { versionList[currentVersion].name }
        </div>
      </Dropdown.Toggle>

      <Dropdown.Menu as={CircomVersionMenu} className="w-full form-select overflow-hidden">
        {
          versionListKeys.reverse().map((version, index) => (
            <Dropdown.Item key={index} onClick={() => {
              setVersion(version)
            }}>
              <div className='flex w-full justify-between'>
                <div>
                  <span className={`fas fa-check text-success mr-2 ${currentVersion === version ? 'visible' : 'invisible'}`}></span>
                  <span>
                    { isElectron() ? versionList[version].name.replace('wasm', '') : versionList[version].name }
                  </span>
                </div>
                { isElectron() ? downloadList.includes(version) ? <div className='far fa-arrow-circle-down'></div> : <div className='fas fa-arrow-circle-down text-success ms-auto'></div> : null }
              </div>
            </Dropdown.Item>
          ))
        }
      </Dropdown.Menu>
    </Dropdown>
  )
}

const CircomVersionMenuToggle = React.forwardRef(
  (
    {
      children,
      onClick,
      className = ''
    }: {
      children: React.ReactNode
      onClick: (e) => void
      className: string
    },
    ref: Ref<HTMLButtonElement>
  ) => (
    <button
      ref={ref}
      onClick={(e) => {
        e.preventDefault()
        onClick(e)
      }}
      className={className.replace('dropdown-toggle', '')}
    >
      <div className="flex">
        {children}
        <div>
          <i className="fad fa-sort-circle"></i>
        </div>
      </div>
    </button>
  )
)

const CircomVersionMenu = React.forwardRef(
  (
    {
      children,
      style,
      'data-id': dataId,
      className,
      'aria-labelledby': labeledBy
    }: {
      'children': React.ReactNode
      'style'?: React.CSSProperties
      'data-id'?: string
      'className': string
      'aria-labelledby'?: string
    },
    ref: Ref<HTMLDivElement>
  ) => {
    const height = window.innerHeight * 0.6
    return (
      <div ref={ref} style={style} className={className} aria-labelledby={labeledBy} data-id={dataId}>
        <ul className="list-unstyled mb-0" style={{ maxHeight: height + 'px',overflowY:'auto' }}>
          {children}
        </ul>
      </div>
    )
  }
)
