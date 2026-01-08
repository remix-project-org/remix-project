// eslint-disable-next-line no-use-before-define
import React, { useEffect, useState } from 'react'
import Draggable from 'react-draggable'
import './dragbar.css'

interface IRemixDragBarUi {
  refObject: React.MutableRefObject<any>
  setHideStatus: (hide: boolean) => void
  hidden: boolean
  minHeight?: number
  onResize: (height: number) => void
}

const DragBar = (props: IRemixDragBarUi) => {
  const [dragState, setDragState] = useState<boolean>(false)
  const [dragBarPosY, setDragBarPosY] = useState<number>(0)
  const nodeRef = React.useRef(null) // fix for strictmode

  function stopDrag(e: MouseEvent, data: any) {
    const h = window.innerHeight - data.y
    props.refObject.current.setAttribute('style', `height: ${h}px;`)
    setDragBarPosY(props.refObject.current.offsetTop)
    props.onResize(h)
    setDragState(false)
    props.setHideStatus(false)
  }
  const handleResize = () => {
    if (!props.refObject.current) return
    setDragBarPosY(props.refObject.current.offsetTop)
  }

  useEffect(() => {
    handleResize()
  }, [props.hidden])

  useEffect(() => {
    window.addEventListener('resize', handleResize)

    // Initial position calculation after a delay to ensure DOM is ready
    const initialTimer = setTimeout(() => {
      handleResize()
    }, 100)

    // Watch for terminal element changes (class/style changes when d-none is added/removed)
    const terminalElement = props.refObject.current
    let observer: MutationObserver | null = null

    if (terminalElement) {
      observer = new MutationObserver(() => {
        // Wait for layout to settle after d-none is removed
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            handleResize()
          })
        })
      })

      observer.observe(terminalElement, {
        attributes: true,
        attributeFilter: ['class', 'style']
      })
    }

    return () => {
      clearTimeout(initialTimer)
      window.removeEventListener('resize', handleResize)
      observer?.disconnect()
    }
  }, [])

  function startDrag() {
    setDragState(true)
  }

  return (
    <>
      <div className={`overlay ${dragState ? '' : 'd-none'}`}></div>
      <Draggable nodeRef={nodeRef} position={{ x: 0, y: dragBarPosY }} onStart={startDrag} onStop={stopDrag} axis="y">
        <div ref={nodeRef} className={`dragbar_terminal ${dragState ? 'ondrag' : ''}`}></div>
      </Draggable>
    </>
  )
}

export default DragBar
