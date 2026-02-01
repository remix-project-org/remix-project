import React, {useState, useEffect} from 'react'
import {TreeView, TreeViewItem} from '@remix-ui/tree-view'
import {CopyToClipboard} from '@remix-ui/clipboard'
import {useIntl} from 'react-intl'
import './styles/dropdown-panel.css'

export interface NestedScope {
  scopeId: string
  firstStep: number
  lastStep?: number
  locals: { [name: string]: any }
  isCreation: boolean
  gasCost: number
  startExecutionLine?: number
  endExecutionLine?: number
  functionDefinition?: any
  reverted?: {
    step: any
    line?: number
  }
  opcodeInfo?: {
    depth: number
    op: string
    gas: string
    gasCost: number
    pc: number
  }
  address?: string
  children: NestedScope[]
}

export interface ScopePanelProps {
  data: NestedScope[]
  className?: string
  stepManager: {
    jumpTo: (step: number) => void
  }
}

export const ScopePanel = ({ data, className, stepManager }: ScopePanelProps) => {
  const intl = useIntl()
  const [scopeData, setScopeData] = useState<NestedScope[]>([])
  const [state, setState] = useState({
    toggleDropdown: true,
    expandPath: [] as string[],
    updating: false
  })

  useEffect(() => {
    setScopeData(data || [])
  }, [data])

  const handleToggle = () => {
    setState((prevState) => ({
      ...prevState,
      toggleDropdown: !prevState.toggleDropdown
    }))
  }

  const handleExpand = (keyPath: string) => {
    setState((prevState) => ({
      ...prevState,
      expandPath: prevState.expandPath.includes(keyPath)
        ? prevState.expandPath.filter((path) => !path.startsWith(keyPath))
        : [...prevState.expandPath, keyPath]
    }))
  }

  const handleJumpIn = (event, scope: NestedScope) => {
    event.stopPropagation();
    stepManager.jumpTo(scope.firstStep + 1)
  }
  
  const handleJumpOver = (event, scope: NestedScope) => {
    event.stopPropagation();
    if (scope.lastStep !== undefined) {
      stepManager.jumpTo(scope.lastStep + 1)
    }
  }

  const handleGoTo = (event, scope: NestedScope) => {
    event.stopPropagation();
    stepManager.jumpTo(scope.firstStep)
  }

  const formatScopeLabel = (scope: NestedScope): JSX.Element => {
    let title = ' - anonymous - '
    if (scope.scopeId === '1') {
      title = scope.isCreation ? 'Contract Creation' : '@' + scope.address?.slice(0, 8) + '...'
    } else
      title = scope.functionDefinition?.name || scope.opcodeInfo?.op
    const kind = scope.functionDefinition?.kind || (scope.isCreation ? 'creation' : 'scope')
    const gasInfo = scope.gasCost ? ` (${scope.gasCost} gas)` : ''
    const stepRange = scope.lastStep !== undefined 
      ? `[${scope.firstStep}-${scope.lastStep}]` 
      : `[${scope.firstStep}+]`
    const revertedInfo = scope.reverted ? ' REVERTED' : ''

    // <span className="fw-bold me-2">{scope.scopeId.slice(-1)}</span>
    return (
      <div className="d-flex flex-column">
        <div className="d-flex align-items-center">
          <span className="me-2">{title}</span>
          <span className="badge bg-secondary me-2">{kind}</span>
          <span className="badge bg-info me-2">{scope.opcodeInfo?.op}</span>
          {revertedInfo && <span className="badge bg-danger me-2">REVERTED</span>}
          {scope.lastStep && <span className="badge bg-info me-2" onClick={(event) => handleJumpIn(event, scope)}>Jump In</span>}
          {scope.lastStep && <span className="badge bg-info me-2" onClick={(event) => handleJumpOver(event, scope)}>Jump Over</span>}
        </div>
        <div className="text-muted small">
          <span className="me-3">{stepRange}</span>
          <span className="me-3">{gasInfo}</span>
          {scope.address && <span className="me-3">@{scope.address.slice(0, 8)}...</span>}
          {Object.keys(scope.locals).length > 0 && (
            <span>{Object.keys(scope.locals).length} local{Object.keys(scope.locals).length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
    )
  }

  const renderScope = (scope: NestedScope, keyPath: string): JSX.Element => {
    const hasChildren = scope.children && scope.children.length > 0
    
    if (hasChildren) {
      return (
        <TreeViewItem
          id={`scopeItem-${scope.scopeId}`}
          key={keyPath}
          label={formatScopeLabel(scope)}
          onClick={() => handleGoTo(event, scope)}
          onIconClick={() => handleExpand(keyPath)}
          expand={state.expandPath.includes(keyPath)}
          labelClass="cursor-pointer jumpToScopeClick"
          icon="fas fa-chevron-down"
        >
          <TreeView id={`scopeTree-${scope.scopeId}`}>
            {scope.children.map((childScope, index) => 
              renderScope(childScope, `${keyPath}/${index}`)
            )}
          </TreeView>
        </TreeViewItem>
      )
    } else {
      return (
        <TreeViewItem
          id={`scopeItem-${scope.scopeId}`}
          key={keyPath}
          label={formatScopeLabel(scope)}
          onClick={(event) => handleGoTo(event, scope)}
          labelClass="cursor-pointer jumpToScopeClick"
        />
      )
    }
  }

  const isEmpty = !scopeData || scopeData.length === 0

  return (
    <div className={`${className} border rounded px-1 mt-1 bg-light`}>
      <div className="py-0 px-1 title">
        <div 
          className={state.toggleDropdown ? 'icon fas fa-caret-down' : 'icon fas fa-caret-right'} 
          onClick={handleToggle}
        ></div>
        <div className="name" data-id="dropdownPanelScopePanel" onClick={handleToggle}>
          Scope Tree
        </div>
        <span className="nameDetail" onClick={handleToggle}>
          {scopeData.length} scope{scopeData.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="dropdownpanel" style={{ display: state.toggleDropdown ? 'block' : 'none' }}>
        <i 
          className="refresh fas fa-sync" 
          style={{ display: state.updating ? 'inline-block' : 'none' }} 
          aria-hidden="true"
        ></i>
        <div className="dropdowncontent pb-2" style={{ display: isEmpty ? 'none' : 'block' }}>
          {!isEmpty && (
            <TreeView id="scopeTreeView">
              {scopeData.map((scope, index) => renderScope(scope, index.toString()))}
            </TreeView>
          )}
        </div>
        <div className="message" style={{ display: isEmpty ? 'block' : 'none' }}>
          {intl.formatMessage({ id: 'debugger.noDataAvailable' })}
        </div>
      </div>
    </div>
  )
}

export default ScopePanel