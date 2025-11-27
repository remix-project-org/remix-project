import React, {useState, useEffect, useReducer} from 'react' // eslint-disable-line
import { useIntl } from 'react-intl'
import {TreeView, TreeViewItem} from '@remix-ui/tree-view' // eslint-disable-line
import {DropdownPanelProps, ExtractData, ExtractFunc} from '../../types' // eslint-disable-line
import {CopyToClipboard} from '@remix-ui/clipboard' // eslint-disable-line
import { initialState, reducer } from '../../reducers/calldata'
import './styles/dropdown-panel.css'

const isBigInt = (value) => {
  return typeof value === 'bigint'
}

export const DropdownPanel = (props: DropdownPanelProps) => {
  const intl = useIntl()
  const [calldataObj, dispatch] = useReducer(reducer, initialState)
  const {
    dropdownName,
    className,
    dropdownMessage,
    calldata,
    header,
    loading,
    extractFunc,
    formatSelfFunc,
    registerEvent,
    handleExpandFunc,
    formatClassNamesFunc,
    triggerEvent,
    loadMoreEvent,
    loadMoreCompletedEvent,
    headStyle,
    bodyStyle,
    hexHighlight
  } = props
  const extractDataDefault: ExtractFunc = (item, parent?) => {
    const ret: ExtractData = {}

    if (item instanceof Array) {
      ret.children = item.map((item, index) => {
        return { key: index, value: item }
      })
      ret.self = 'Array'
      ret.isNode = true
      ret.isLeaf = false
    } else if (item instanceof Object) {
      ret.children = Object.keys(item).map((key) => {
        return { key: key, value: item[key] }
      })
      ret.self = 'Object'
      ret.isNode = true
      ret.isLeaf = false
    } else {
      ret.self = item
      ret.children = null
      ret.isNode = false
      ret.isLeaf = true
    }
    return ret
  }
  const formatSelfDefault = (key: string | number, data: ExtractData) => {
    let value
    if (isBigInt(data.self)) data.self = (data.self as any).toString()
    if (hexHighlight && typeof data.self === 'string') {
      const isHex = data.self.startsWith('0x') || hexHighlight
      if (isHex) {
        const regex = /^(0+)(.*)/g
        const split = regex.exec(data.self.replace('0x', ''))
        if (split && split[1]) {
          value = (
            <span>
              <span className="m-0 label_value">0x</span>
              <span className="m-0 label_value">{split[1]}</span>
              {split[2] && <span className="m-0 label_value fw-bold text-dark">{split[2]}</span>}
            </span>
          )
        } else
          value = (
            <span>
              <span className="m-0 label_value">0x</span>
              <span className="m-0 label_value fw-bold text-dark">{data.self.replace('0x', '')}</span>
            </span>
          )
      } else value = <span className="m-0 label_value">{data.self}</span>
    } else value = <span className="m-0 label_value">{data.self}</span>
    return (
      <div className="d-flex me-1 flex-row label_item">
        <label className="small fw-bold mb-0 pe-1 label_key">{key}:</label>
        <label className="m-0 label_value">{value}</label>
      </div>
    )
  }
  const [state, setState] = useState({
    header: '',
    toggleDropdown: true,
    message: {
      innerText: intl.formatMessage({ id: 'debugger.noDataAvailable' }),
      display: 'block'
    },
    dropdownContent: {
      innerText: '',
      display: 'none'
    },
    title: {
      innerText: '',
      display: 'none'
    },
    copiableContent: '',
    updating: false,
    expandPath: [],
    data: null
  })

  useEffect(() => {
    registerEvent &&
      registerEvent(loadMoreCompletedEvent, (updatedCalldata) => {
        dispatch({ type: 'UPDATE_CALLDATA_SUCCESS', payload: updatedCalldata })
      })
  }, [])

  useEffect(() => {
    dispatch({ type: 'FETCH_CALLDATA_SUCCESS', payload: calldata })
  }, [calldata])

  useEffect(() => {
    update(calldata)
  }, [calldataObj.calldata])

  useEffect(() => {
    message(dropdownMessage)
  }, [dropdownMessage])

  useEffect(() => {
    if (loading && !state.updating) setLoading()
  }, [loading])

  const handleToggle = () => {
    setState((prevState) => {
      return {
        ...prevState,
        toggleDropdown: !prevState.toggleDropdown
      }
    })
  };

  const handleExpand = handleExpandFunc || function (keyPath) {
    if (!state.expandPath.includes(keyPath)) {
      state.expandPath.push(keyPath)
    } else {
      state.expandPath = state.expandPath.filter((path) => !path.startsWith(keyPath))
    }
  }

  const message = (message) => {
    if (message === state.message.innerText) return
    setState((prevState) => {
      return {
        ...prevState,
        message: {
          innerText: message,
          display: message ? 'block' : ''
        },
        updating: false
      }
    })
  }

  const setLoading = () => {
    setState((prevState) => {
      return {
        ...prevState,
        message: {
          innerText: '',
          display: 'none'
        },
        dropdownContent: {
          ...prevState.dropdownContent,
          display: 'none'
        },
        copiableContent: '',
        updating: true
      }
    })
  }

  const update = function (calldata) {
    let isEmpty = !calldata

    if (calldata && Array.isArray(calldata) && calldata.length === 0) isEmpty = true
    else if (calldata && Object.keys(calldata).length === 0 && calldata.constructor === Object) isEmpty = true

    setState((prevState) => {
      const copiableContent = JSON.stringify(calldata, (key, value) => {
        if (isBigInt(value)) value = value.toString()
        return value
      }, '\t').replace(/0xNaN/g, '0x0')
      return {
        ...prevState,
        dropdownContent: {
          ...prevState.dropdownContent,
          display: 'block'
        },
        // replace 0xNaN with 0x0
        copiableContent,
        message: {
          innerText: isEmpty ? intl.formatMessage({ id: 'debugger.noDataAvailable' }) : '',
          display: isEmpty ? 'block' : 'none'
        },
        updating: false,
        toggleDropdown: true,
        data: calldata
      }
    })
  }

  const renderData = (item: ExtractData, parent, key: string | number, keyPath: string) => {
    const data = extractFunc ? extractFunc(item, parent) : extractDataDefault(item, parent)
    const children = (data.children || []).map((child) => {
      return renderData(child.value, data, child.key, keyPath + '/' + child.key)
    })

    if (children && children.length > 0) {
      return (
        <TreeViewItem
          id={`treeViewItem${key}`}
          key={keyPath}
          label={formatSelfFunc ? formatSelfFunc(key, data) : formatSelfDefault(key, data)}
          onClick={() => handleExpand(keyPath)}
          expand={state.expandPath.includes(keyPath)}
          labelClass={formatClassNamesFunc && formatClassNamesFunc(key, data)}
        >
          <TreeView id={`treeView${key}`} key={keyPath}>
            {children}
            {data.hasNext && (
              <TreeViewItem
                id={'treeViewLoadMore'}
                data-id={'treeViewLoadMore'}
                className="cursor_pointer"
                label={intl.formatMessage({ id: 'debugger.loadMore' })}
                onClick={() => {
                  triggerEvent(loadMoreEvent, [data.cursor])
                }}
              />
            )}
          </TreeView>
        </TreeViewItem>
      )
    } else {
      return (
        <TreeViewItem
          id={key.toString()}
          key={keyPath}
          label={formatSelfFunc ? formatSelfFunc(key, data) : formatSelfDefault(key, data)}
          onClick={() => handleExpand(keyPath)}
          expand={state.expandPath.includes(keyPath)}
          labelClass={formatClassNamesFunc && formatClassNamesFunc(key, data)}
        />
      )
    }
  }

  const uniquePanelName = dropdownName.split(' ').join('')

  return (
    <div className={className + ' border rounded px-1 mt-1 bg-light'}>
      <div className="py-0 px-1 title" style={headStyle}>
        <div className={state.toggleDropdown ? 'icon fas fa-caret-down' : 'icon fas fa-caret-right'} onClick={handleToggle}></div>
        <div className="name" data-id={`dropdownPanel${uniquePanelName}`} onClick={handleToggle}>
          {dropdownName}
        </div>
        <span className="nameDetail" onClick={handleToggle}>
          {header}
        </span>
        <CopyToClipboard tip={intl.formatMessage({ id: 'debugger.copy' })} content={state.copiableContent} data-id={`dropdownPanelCopyToClipboard${uniquePanelName}`} />
      </div>
      <div className="dropdownpanel" style={{ display: state.toggleDropdown ? 'block' : 'none' }}>
        <i className="refresh fas fa-sync" style={{ display: state.updating ? 'inline-block' : 'none' }} aria-hidden="true"></i>
        <div className="dropdowncontent pb-2" style={{ display: state.dropdownContent.display, ...bodyStyle }}>
          {state.data && <TreeView id="treeView">{Object.keys(state.data).map((innerkey) => renderData(state.data[innerkey], state.data, innerkey, innerkey))}</TreeView>}
        </div>
        <div className="dropdownrawcontent" hidden={true}>
          {state.copiableContent}
        </div>
        <div className="message" style={{ display: state.message.display }}>
          {state.message.innerText}
        </div>
      </div>
    </div>
  )
}

export default DropdownPanel
