import React, { useEffect, useLayoutEffect, useState, useRef } from 'react'
import Draggable from 'react-draggable'
import './dragbar.css'

interface IRemixDragBarUi {
  refObject: React.MutableRefObject<any>
  setHideStatus: (hide: boolean) => void
  hidden: boolean
  minWidth: number
  maximiseTrigger: number
  enhanceTrigger: number
  resetTrigger: number
  layoutPosition: 'left' | 'right',
  coeff?: number
}

const DragBar = (props: IRemixDragBarUi) => {
  const handleSize = 6
  const halfHandleSize = handleSize / 2
  const [dragState, setDragState] = useState<boolean>(false)
  const [dragBarPosX, setDragBarPosX] = useState<number>(0)
  const restoreWidthRef = useRef<number>(props.minWidth)
  const initialMeasurementRef = useRef<boolean>(false)
  const panelStartEdgeRef = useRef<number>(0)
  const panelEndEdgeRef = useRef<number>(0)
  const transitionSyncTimerRef = useRef<number | null>(null)
  const nodeRef = React.useRef(null) // fix for strictmode

  const getContainerElement = () => nodeRef.current ? (nodeRef.current as HTMLDivElement).offsetParent as HTMLElement | null : null

  const getHiddenLeftAnchor = () => {
    const panelElement = props.refObject.current as HTMLElement | null
    return panelElement?.previousElementSibling as HTMLElement | null
  }

  const readPanelMetrics = () => {
    const panelElement = props.refObject.current as HTMLElement | null
    const containerElement = getContainerElement()
    if (!containerElement || !panelElement) return null

    const containerRect = containerElement.getBoundingClientRect()
    const panelIsVisible = panelElement.offsetParent !== null

    if (props.layoutPosition === 'left' && props.hidden && !panelIsVisible) {
      const hiddenAnchor = getHiddenLeftAnchor()
      if (!hiddenAnchor || hiddenAnchor.offsetParent === null) return null

      const anchorRect = hiddenAnchor.getBoundingClientRect()
      const edgeX = anchorRect.right - containerRect.left

      return {
        startX: edgeX,
        endX: edgeX,
        width: 0
      }
    }

    if (!panelIsVisible) return null

    const panelRect = panelElement.getBoundingClientRect()

    return {
      startX: panelRect.left - containerRect.left,
      endX: panelRect.right - containerRect.left,
      width: panelRect.width
    }
  }

  const syncDragbarPosition = () => {
    const metrics = readPanelMetrics()
    if (!metrics) return

    panelStartEdgeRef.current = metrics.startX
    panelEndEdgeRef.current = metrics.endX

    if (!initialMeasurementRef.current && metrics.width > 0) {
      restoreWidthRef.current = metrics.width
      initialMeasurementRef.current = true
    }

    const edge = props.layoutPosition === 'left' ? metrics.endX : metrics.startX
    setDragBarPosX(edge - halfHandleSize)
  }

  const scheduleSync = () => {
    requestAnimationFrame(() => {
      syncDragbarPosition()
    })
  }

  const scheduleTransitionSync = () => {
    if (transitionSyncTimerRef.current) {
      window.clearTimeout(transitionSyncTimerRef.current)
    }

    transitionSyncTimerRef.current = window.setTimeout(() => {
      syncDragbarPosition()
      transitionSyncTimerRef.current = null
    }, 300)
  }

  const applyPanelWidth = (width: number) => {
    const panelElement = props.refObject.current as HTMLElement | null
    if (!panelElement) return

    panelElement.style.width = `${Math.max(width, props.minWidth)}px`
    scheduleSync()
    scheduleTransitionSync()
  }

  const getContainerWidth = () => {
    const containerElement = getContainerElement()
    return containerElement?.getBoundingClientRect().width || window.innerWidth
  }

  const getRightBoundary = () => {
    const metrics = readPanelMetrics()
    if (metrics) return metrics.endX
    return panelEndEdgeRef.current || getContainerWidth()
  }

  const triggerWidth = (trigger: number, coeff: number) => {
    if (trigger <= 0) return

    const containerWidth = getContainerWidth()
    if (props.layoutPosition === 'left') {
      applyPanelWidth(containerWidth * coeff)
      return
    }

    applyPanelWidth(getRightBoundary() * coeff)
  }

  useEffect(() => {
    triggerWidth(props.maximiseTrigger, props.coeff || 0.4)
  }, [props.maximiseTrigger])

  useEffect(() => {
    triggerWidth(props.enhanceTrigger, props.coeff || 0.25)
  }, [props.enhanceTrigger])

  useEffect(() => {
    if (props.resetTrigger > 0) {
      applyPanelWidth(restoreWidthRef.current)
    }
  }, [props.resetTrigger])

  useLayoutEffect(() => {
    syncDragbarPosition()
  }, [props.hidden, props.layoutPosition])

  useEffect(() => {
    const panelElement = props.refObject.current as HTMLElement | null
    const containerElement = getContainerElement()
    const hiddenAnchor = props.layoutPosition === 'left' ? getHiddenLeftAnchor() : null
    if (!panelElement || !containerElement) return

    scheduleSync()
    window.addEventListener('resize', scheduleSync)

    const resizeObserver = new ResizeObserver(() => scheduleSync())
    resizeObserver.observe(panelElement)
    resizeObserver.observe(containerElement)
    if (hiddenAnchor) resizeObserver.observe(hiddenAnchor)

    const handleTransition = (event: TransitionEvent) => {
      if (event.propertyName === 'width') {
        scheduleSync()
        scheduleTransitionSync()
      }
    }

    panelElement.addEventListener('transitionrun', handleTransition)
    panelElement.addEventListener('transitionend', handleTransition)
    panelElement.addEventListener('transitioncancel', handleTransition)

    const mutationObserver = new MutationObserver(() => scheduleSync())
    mutationObserver.observe(panelElement, {
      attributes: true,
      attributeFilter: ['class', 'style']
    })
    mutationObserver.observe(containerElement, {
      attributes: true,
      attributeFilter: ['class', 'style']
    })

    return () => {
      window.removeEventListener('resize', scheduleSync)
      panelElement.removeEventListener('transitionrun', handleTransition)
      panelElement.removeEventListener('transitionend', handleTransition)
      panelElement.removeEventListener('transitioncancel', handleTransition)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      if (transitionSyncTimerRef.current) {
        window.clearTimeout(transitionSyncTimerRef.current)
      }
    }
  }, [props.layoutPosition])

  function stopDrag(_e: MouseEvent, data: { x: number }) {
    const panelElement = props.refObject.current as HTMLElement | null
    if (!panelElement) {
      setDragState(false)
      return
    }

    setDragState(false)

    const edgeX = data.x + halfHandleSize
    if (props.layoutPosition === 'left') {
      const startEdge = panelStartEdgeRef.current
      const nextWidth = edgeX - startEdge

      if (nextWidth < props.minWidth) {
        props.setHideStatus(true)
      } else {
        restoreWidthRef.current = nextWidth
        panelElement.style.width = `${nextWidth}px`
        props.setHideStatus(false)
      }
      scheduleSync()
      scheduleTransitionSync()
      return
    }

    const endEdge = panelEndEdgeRef.current || getRightBoundary()
    const nextWidth = endEdge - edgeX
    if (nextWidth >= props.minWidth) {
      restoreWidthRef.current = nextWidth
      panelElement.style.width = `${nextWidth}px`
      props.setHideStatus(false)
      scheduleSync()
      scheduleTransitionSync()
    } else {
      props.setHideStatus(false)
      scheduleSync()
    }
  }

  function startDrag() {
    syncDragbarPosition()
    const metrics = readPanelMetrics()
    if (metrics) {
      panelStartEdgeRef.current = metrics.startX
      panelEndEdgeRef.current = metrics.endX
      if (!props.hidden && metrics.width > 0) {
        restoreWidthRef.current = metrics.width
      }
    }
    setDragState(true)
  }

  return (
    <>
      <div className={`overlay ${dragState ? '' : 'd-none'}`} data-id="sidepanel-dragbar-overlay" id="sidepanel-dragbar-overlay"></div>
      <Draggable nodeRef={nodeRef} position={{ x: dragBarPosX, y: 0 }} onStart={startDrag} onStop={stopDrag} axis="x">
        <div ref={nodeRef} className={`dragbar ${dragState ? 'ondrag' : ''}`} data-id="sidepanel-dragbar-draggable" id="sidepanel-dragbar-draggable" data-right-sidepanel={props.layoutPosition === 'right' ? 'rightSidepanel-dragbar-draggable' : null}></div>
      </Draggable>
    </>
  )
}

export default DragBar
