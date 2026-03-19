// eslint-disable-next-line no-use-before-define
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Draggable from 'react-draggable'
import './dragbar.css'

interface IRemixDragBarUi {
  refObject: React.MutableRefObject<any>
  setHideStatus: (hide: boolean) => void
  hidden: boolean
  minHeight?: number
  onResize: (height: number) => void
  layoutRevision?: number
}

const DragBar = (props: IRemixDragBarUi) => {
  const handleSize = 6
  const halfHandleSize = handleSize / 2
  const [dragState, setDragState] = useState<boolean>(false)
  const [dragBarPosY, setDragBarPosY] = useState<number>(0)
  const nodeRef = React.useRef(null) // fix for strictmode
  const animationFrameRefs = useRef<number[]>([])
  const timeoutRefs = useRef<number[]>([])

  const getContainerElement = () => nodeRef.current ? (nodeRef.current as HTMLDivElement).offsetParent as HTMLElement | null : null

  const clearPendingSync = () => {
    animationFrameRefs.current.forEach((frameId) => cancelAnimationFrame(frameId))
    timeoutRefs.current.forEach((timeoutId) => window.clearTimeout(timeoutId))
    animationFrameRefs.current = []
    timeoutRefs.current = []
  }

  const isTerminalReady = (terminalElement: HTMLElement, containerElement: HTMLElement) => {
    if (props.hidden || terminalElement.offsetParent === null) return false
    if (terminalElement.classList.contains('d-none') || terminalElement.classList.contains('minimized') || terminalElement.classList.contains('maximized')) return false

    const terminalRect = terminalElement.getBoundingClientRect()
    const containerRect = containerElement.getBoundingClientRect()

    return terminalRect.height > 0 && containerRect.height > 0 && terminalRect.bottom > containerRect.top
  }

  const syncDragbarPosition = () => {
    const terminalElement = props.refObject.current as HTMLElement | null
    const containerElement = getContainerElement()
    if (!terminalElement || !containerElement || !isTerminalReady(terminalElement, containerElement)) return false

    const terminalRect = terminalElement.getBoundingClientRect()
    const containerRect = containerElement.getBoundingClientRect()
    const topEdge = terminalRect.top - containerRect.top
    const maxPosition = Math.max(containerRect.height - handleSize, 0)
    const nextPosition = Math.min(Math.max(topEdge - halfHandleSize, 0), maxPosition)

    setDragBarPosY(nextPosition)
    return true
  }

  const scheduleSync = () => {
    clearPendingSync()

    const queueSync = () => {
      const firstFrame = requestAnimationFrame(() => {
        const secondFrame = requestAnimationFrame(() => {
          syncDragbarPosition()
        })
        animationFrameRefs.current.push(secondFrame)
      })
      animationFrameRefs.current.push(firstFrame)
    }

    queueSync()
    timeoutRefs.current.push(window.setTimeout(queueSync, 50))
    timeoutRefs.current.push(window.setTimeout(() => syncDragbarPosition(), 150))
  }

  function stopDrag(_e: MouseEvent, data: { y: number }) {
    const terminalElement = props.refObject.current as HTMLElement | null
    const containerElement = getContainerElement()
    if (!terminalElement || !containerElement) {
      setDragState(false)
      return
    }

    const edgeY = data.y + halfHandleSize
    const nextHeight = Math.max(containerElement.getBoundingClientRect().height - edgeY, props.minHeight || 70)

    terminalElement.style.height = `${nextHeight}px`
    props.onResize(nextHeight)
    setDragState(false)
    props.setHideStatus(false)
    scheduleSync()
  }

  useLayoutEffect(() => {
    scheduleSync()

    return () => {
      clearPendingSync()
    }
  }, [props.hidden, props.layoutRevision])

  useEffect(() => {
    const terminalElement = props.refObject.current as HTMLElement | null
    const containerElement = getContainerElement()
    if (!terminalElement || !containerElement) return

    scheduleSync()
    window.addEventListener('resize', scheduleSync)

    const resizeObserver = new ResizeObserver(() => scheduleSync())
    resizeObserver.observe(terminalElement)
    resizeObserver.observe(containerElement)
    Array.from(containerElement.children).forEach((child) => {
      if (child !== nodeRef.current) resizeObserver.observe(child as Element)
    })

    const observer = new MutationObserver(() => scheduleSync())
    observer.observe(terminalElement, {
      attributes: true,
      attributeFilter: ['class', 'style']
    })

    const containerObserver = new MutationObserver(() => scheduleSync())
    containerObserver.observe(containerElement, {
      attributes: true,
      childList: true,
      subtree: false
    })

    return () => {
      clearPendingSync()
      window.removeEventListener('resize', scheduleSync)
      resizeObserver.disconnect()
      observer.disconnect()
      containerObserver.disconnect()
    }
  }, [])

  function startDrag() {
    syncDragbarPosition()
    setDragState(true)
  }

  return (
    <>
      <div className={`overlay ${dragState ? '' : 'd-none'}`} data-id="dragbar-overlay" id="dragbar-overlay"></div>
      <Draggable nodeRef={nodeRef} position={{ x: 0, y: dragBarPosY }} onStart={startDrag} onStop={stopDrag} axis="y">
        <div ref={nodeRef} className={`dragbar_terminal ${dragState ? 'ondrag' : ''}`} data-id="dragbar-draggable" id="dragbar-draggable"></div>
      </Draggable>
    </>
  )
}

export default DragBar
