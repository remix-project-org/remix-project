import React, { SyntheticEvent, useEffect, useRef, useState, RefObject, useMemo, useContext, Dispatch } from 'react'
import { Popover } from 'react-bootstrap'
import { DragStructure, FileType, WorkspaceElement } from '../types'
import { getPathIcon } from '@remix-ui/helper';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { FlatTreeItemInput } from './flat-tree-item-input';
import { FlatTreeDrop } from './flat-tree-drop';
import { getEventTarget } from '../utils/getEventTarget';
import { fileDecoration, FileDecorationIcons } from '@remix-ui/file-decorators';
import { FileHoverIcons } from './file-explorer-hovericons';
import { deletePath } from '../actions';
import { FileSystemContext } from '../contexts';

export default function useOnScreen(ref: RefObject<HTMLElement>) {

  const [isIntersecting, setIntersecting] = useState(false)
  const observer = useMemo(() => new IntersectionObserver(
    ([entry]) => setIntersecting(entry.isIntersecting)
  ), [ref])

  useEffect(() => {
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return isIntersecting
}
interface FlatTreeProps {
  fileTarget: any
  setTargetFiles: React.Dispatch<any>
  files: { [x: string]: Record<string, FileType> },
  flatTree: FileType[],
  expandPath: string[],
  focusEdit: { element: string; type: string; isNew: boolean; lastEdit: string }
  editModeOff: (content: string) => void
  focusElement: { key: string; type: WorkspaceElement }[]
  focusContext: { element: string; x: number; y: number; type: string }
  handleContextMenu: (pageX: number, pageY: number, path: string, content: string, type: string) => void
  handleTreeClick: (e: SyntheticEvent) => void
  handleClickFolder: (path: string, type: string) => void
  moveFolderSilently: (dest: string, src: string) => Promise<void>
  moveFileSilently: (dest: string, src: string) => Promise<void>
  resetMultiselect: () => void
  setFilesSelected: Dispatch<React.SetStateAction<string[]>>
  fileState: fileDecoration[]
  createNewFile?: any
  createNewFolder?: any
  deletePath?: (path: string | string[]) => void | Promise<void>
  editPath?: (path: string, type: string, isNew?: boolean) => void
  warnMovingItems: (srcs: string[], dests: string) => Promise<void>
}

let mouseTimer: any = {
  path: null,
  timer: null
}

export const FlatTree = (props: FlatTreeProps) => {
  const { files, flatTree, expandPath, focusEdit, editModeOff, handleTreeClick, warnMovingItems, fileState, focusElement, handleClickFolder, deletePath, moveFileSilently, moveFolderSilently, setFilesSelected } = props
  const [hover, setHover] = useState<string>('')
  const [mouseOverTarget, setMouseOverTarget] = useState<{
    path: string,
    type: string,
    content: string,
    position: {
      top: number,
      left: number
    }
  }>(null)
  const [showMouseOverTarget, setShowMouseOverTarget] = useState<boolean>(false)
  const [dragSource, setDragSource] = useState<FileType>()
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const ref = useRef(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const virtuoso = useRef<VirtuosoHandle>(null)
  const [selectedItems, setSelectedItems] = useState<DragStructure[]>([])

  /**
   *  When multiple files are selected in FileExplorer,
   *  and these files are dragged to a target folder,
   *  this function will build the profile of each selected item
   *  so they can be moved when dropped on target folder
   * @param target - Initial target item in FileExplorer
   * @returns - {DragStructure} Array of selected items
   */
  const buildMultiSelectedItemProfiles = (target: {
    path: string
    type: string
    content: string
    position: {
        top: number
        left: number
    }
    }) => {
    const selectItems = []
    selectItems.push(target)
    containerRef.current?.querySelectorAll('li.remixui_selected').forEach(item => {
      const dragTarget = {
        position: { top: target?.position.top || 0, left: target?.position.left || 0 },
        path: item.getAttribute('data-path') || item.getAttribute('data-label-path') || '',
        type: item.getAttribute('data-type') || item.getAttribute('data-label-type') || '',
        content: item.textContent || ''
      }
      if (dragTarget.path !== target.path) selectItems.push(dragTarget)
    })
    setSelectedItems(selectItems)
  }

  const labelClass = (file: FileType) =>
    props.focusEdit.element === file.path
      ? 'bg-light'
      : props.focusElement.findIndex((item) => item.key === file.path) !== -1
        ? 'bg-secondary remixui_selected'
        : hover == file.path
          ? 'bg-light border-no-shift'
          : props.focusContext.element === file.path && props.focusEdit.element !== file.path
            ? 'bg-light border-no-shift'
            : ''

  useEffect(() => {
    if (props.focusElement && props.focusElement.length > 0) {
      props.setTargetFiles(props.focusElement)
    }
  }, [props.focusElement, props.focusElement.length])

  const getIndentLevelDiv = (path: string) => {
    // remove double slash
    path = path.replace(/\/\//g, '/')
    // remove leading slash
    path = path.replace(/^\//g, '')
    const pathArray = path.split('/')
    const level = pathArray.length - 1
    const indent = level * 12
    return (<div style={{ paddingLeft: `${indent}px` }}></div>)
  }

  const handleContextMenu = async (e: any) => {
    const target = await getEventTarget(e)
    if (target) {
      e.preventDefault()
      e.stopPropagation()
      props.handleContextMenu(e.pageX, e.pageY, target.path, target.content, target.type)
    }
  }

  const onDragStart = async (event: SyntheticEvent) => {
    const target = await getEventTarget(event)
    setDragSource(flatTree.find((item) => item.path === target.path))
    setIsDragging(true)
    buildMultiSelectedItemProfiles(target)
    setFilesSelected(selectedItems.map((item) => item.path))
  }

  useEffect(() => {
    if (isDragging) {
      mouseTimer = {
        path: null,
        timer: null
      }
    }
  }, [isDragging])

  const onDragEnd = (event: SyntheticEvent) => {
    setIsDragging(false)
    document.querySelectorAll('li.remixui_selected').forEach(item => {
      item.classList.remove('remixui_selected')
      item.classList.remove('bg-secondary')
    })
    props.setFilesSelected([])
    setSelectedItems([])
  }

  const getFlatTreeItem = (path: string) => {
    return flatTree.find((item) => item.path === path)
  }

  const getFileStateClasses = (file: FileType) => {
    const state = fileState.find((state: fileDecoration) => {
      if (state.path === file.path) return true
      if (state.bubble && file.isDirectory && state.path.startsWith(file.path)) return true
    })
    if (state && state.fileStateLabelClass) {
      return state.fileStateLabelClass
    }
  }

  const getFileStateIcons = (file: FileType) => {
    const state = fileState.find((state: fileDecoration) => {
      if (state.path === file.path) return true
      if (state.bubble && file.isDirectory && state.path.startsWith(file.path)) return true
    })
    if (state) {
      return <FileDecorationIcons file={file} fileDecorations={fileState} />
    }
  }

  const onMouseMove = async (e: any) => {
    const target = await getEventTarget(e, true)
    if (target && target.path) {
      if (mouseTimer.path !== target.path) {
        setShowMouseOverTarget(false)
        mouseTimer = {
          path: target.path,
          timer: setTimeout(() => {
            if (mouseTimer.path === target.path) {
              setShowMouseOverTarget(true)
              setMouseOverTarget(target)
            }
          }, 1000)
        }
      }
    } else {
      mouseTimer = {
        path: null,
        timer: null
      }
      setShowMouseOverTarget(false)
    }
  }

  const onMouseLeave = async (e: any) => {
    mouseTimer = {
      path: null,
      timer: null
    }
    setShowMouseOverTarget(false)
  }

  useEffect(() => {
    if (focusEdit && focusEdit.element) {
      const index = flatTree.findIndex((item) => item.path === focusEdit.element)
      index && virtuoso.current.scrollIntoView({
        index,
        align: 'center'
      })
    }
  }, [focusEdit])

  const showIcons = (file: FileType) =>
    file.path === hover && !isDragging ? (
      <div>
        <FileHoverIcons
          file={file}
          renamePathOp={props.editPath}
          deletePathOp={deletePath}
          handleNewFileOp={props.createNewFile}
          handleNewFolderOp={props.createNewFolder}
        />
      </div>
    ) : null

  const Row = (index: number) => {
    const node = Object.keys(flatTree)[index]
    const file = flatTree[node]
    return (
      <li
        className={`${labelClass(file)} li_tv`}
        onMouseOver={(e) => {
          setHover(file.path)
        }}
        onMouseOut={() => {
          setHover('')
        }}
        data-type={file.isDirectory ? 'folder' : 'file'}
        data-path={`${file.path}`}
        data-id={`treeViewLitreeViewItem${file.path}`}
      >
        <div data-id={`treeViewDivtreeViewItem${file.path}`} className={`d-flex flex-row align-items-center`}>
          {getIndentLevelDiv(file.path)}

          <div className={`ps-2 ${file.isDirectory ? expandPath && expandPath.includes(file.path) ? 'fa fa-folder-open' : 'fa fa-folder' : `${getPathIcon(file.path)} pe-2 caret caret_tv`} `}></div>
          {focusEdit && file.path && focusEdit.element === file.path ?
            <FlatTreeItemInput
              editModeOff={editModeOff}
              file={file} /> :
            <><div
              data-id={`treeViewDivDraggableItem${file.path}`}
              draggable={true}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              className={`ms-1 ps-2 text-nowrap remixui_leaf ${getFileStateClasses(file)}`}
              data-label-type={file.isDirectory ? 'folder' : 'file'}
              data-label-path={`${file.path}`}
              key={index}>
              {file.name}
            </div>
            <div className="d-flex flex-row align-items-center">
              {showIcons(file)}
              {getFileStateIcons(file)}
            </div>
            </>
          }
        </div>
      </li>)
  }

  return (<>
    <div ref={containerRef} className='h-100 ps-1 mt-1'>
      <FlatTreeDrop
        dragSource={dragSource}
        getFlatTreeItem={getFlatTreeItem}
        warnMovingItems={warnMovingItems}
        moveFolderSilently={moveFolderSilently}
        moveFileSilently={moveFileSilently}
        resetMultiselect={props.resetMultiselect}
        setFilesSelected={setFilesSelected}
        handleClickFolder={handleClickFolder}
        expandPath={expandPath}
        selectedItems={selectedItems}
        setSelectedItems={setSelectedItems}
      >
        <div data-id="treeViewUltreeViewMenu"
          className='d-flex h-100 w-100 pb-2'
          onClick={handleTreeClick}
          onMouseLeave={onMouseLeave}
          onMouseMove={onMouseMove}
          onContextMenu={handleContextMenu}
        >
          <Virtuoso
            ref={virtuoso}
            style={{ height: `100%`, width: '100%' }}
            totalCount={Object.keys(flatTree).length}
            itemContent={index => Row(index)}
          />
        </div>
      </FlatTreeDrop>
    </div>
  </>)
}
