import React, { useRef, useState } from 'react'

interface ResizableWidthOptions {
  storageKey: string
  minWidth: number
  defaultWidth: number
}

const readStoredWidth = ({ storageKey, minWidth, defaultWidth }: ResizableWidthOptions) => {
  try {
    const width = parseInt(localStorage.getItem(storageKey) || '', 10)
    return width >= minWidth ? width : defaultWidth
  } catch {
    return defaultWidth
  }
}

const storeWidth = (storageKey: string, width: number) => {
  try {
    localStorage.setItem(storageKey, String(Math.round(width)))
  } catch { /* storage unavailable: the width is just not remembered */ }
}

/**
 * Width of a panel on the right of the AI mode area, resized by dragging its left edge
 * between the min width and 70% of the area. Double-click resets it; the width is remembered.
 */
export const useResizableWidth = (options: ResizableWidthOptions) => {
  const { storageKey, minWidth, defaultWidth } = options
  const panelRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(() => readStoredWidth(options))

  const startResize = (event: React.PointerEvent) => {
    if (!panelRef.current) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = panelRef.current.offsetWidth
    const containerWidth = panelRef.current.parentElement?.clientWidth || window.innerWidth
    const maxWidth = Math.max(minWidth, containerWidth * 0.7)
    let latest = startWidth
    const onMove = (moveEvent: PointerEvent) => {
      latest = Math.min(maxWidth, Math.max(minWidth, startWidth + startX - moveEvent.clientX))
      setWidth(latest)
    }
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.body.classList.remove('ai-panel-resizing')
      storeWidth(storageKey, latest)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    document.body.classList.add('ai-panel-resizing')
  }

  const resetWidth = () => {
    setWidth(defaultWidth)
    storeWidth(storageKey, defaultWidth)
  }

  return { panelRef, width, startResize, resetWidth }
}
