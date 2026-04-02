import React, { SyntheticEvent, useContext, useEffect, useRef, useState } from 'react'
import { DragStructure, FileType, FlatTreeDropProps } from '../types'
import { getEventTarget } from '../utils/getEventTarget'
import { extractParentFromKey } from '@remix-ui/helper'
import { FileSystemContext } from '../contexts'

export const FlatTreeDrop = (props: FlatTreeDropProps) => {

  const { getFlatTreeItem, dragSource, handleClickFolder, expandPath } = props
  // delay timer
  const [timer, setTimer] = useState<NodeJS.Timeout>()
  // folder to open
  const [folderToOpen, setFolderToOpen] = useState<string>()

  const onDragOver = async (e: SyntheticEvent) => {
    e.preventDefault()

    const target = await getEventTarget(e)

    if (!target || !target.path) {
      clearTimeout(timer)
      setFolderToOpen(null)
      return
    }

    const dragDestination = getFlatTreeItem(target.path)
    if (dragDestination && !dragDestination.isDirectory) {
      clearTimeout(timer)
      setFolderToOpen(null)
    }
    if (dragDestination && dragDestination.isDirectory && !expandPath.includes(dragDestination.path) && folderToOpen !== dragDestination.path && props.handleClickFolder) {

      setFolderToOpen(dragDestination.path)
      timer && clearTimeout(timer)
      setTimer(
        setTimeout(() => {
          handleClickFolder(dragDestination.path, dragDestination.type)
          setFolderToOpen(null)
        }, 600)
      )
    }
  }

  const onDrop = async (event: SyntheticEvent) => {
    event.preventDefault()

    const target = await getEventTarget(event)
    const filePaths = []

    let dragDestination: any
    if (!target || !target.path) {
      dragDestination = {
        path: '/',
        isDirectory: true
      }
    } else {
      dragDestination = getFlatTreeItem(target.path)
    }

    props.selectedItems.forEach((item) => filePaths.push(item.path))
    props.setFilesSelected(filePaths)

    if (dragDestination.isDirectory) {
      await props.warnMovingItems(filePaths, dragDestination.path)
      await moveItemsSilently(props.selectedItems, dragDestination.path)
    } else {
      const path = extractParentFromKey(dragDestination.path) || '/'
      await props.warnMovingItems(filePaths, path)
      await moveItemsSilently(props.selectedItems, path)
    }
  }

  /**
   * Moves items silently without showing a confirmation dialog.
   * @param items MultiSelected items built into a DragStructure profile
   * @param dragSource source FileExplorer item being dragged.
   * @returns Promise<void>
   */
  const moveItemsSilently = async (items: DragStructure[], targetPath: string) => {
    const promises = items.filter(item => item.path !== targetPath)
      .map(async (item) => {
        if (item.type === 'file') {
          await props.moveFileSilently(targetPath, item.path)
        } else if (item.type === 'folder') {
          await props.moveFolderSilently(targetPath, item.path)
        }
      })
    await Promise.all(promises)
    props.resetMultiselect()
  }

  return (<div
    onDrop={onDrop} onDragOver={onDragOver}
    className="flex h-full"
  >{props.children}</div>)
}
