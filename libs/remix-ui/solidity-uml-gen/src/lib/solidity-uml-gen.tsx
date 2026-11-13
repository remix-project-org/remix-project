import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FormattedMessage } from 'react-intl'
import { ReactZoomPanPinchRef, TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import { ThemeSummary } from '../types'
import { CustomTooltip } from '@remix-ui/helper'
import UmlDownload from './components/UmlDownload'
import './css/solidity-uml-gen.css'
import { UmlDownloadContext, UmlFileType } from './utilities/UmlDownloadStrategy'
export interface RemixUiSolidityUmlGenProps {
  updatedSvg?: string
  loading?: boolean
  /** The last diagram could not be drawn */
  renderError?: boolean
  themeSelected?: string
  themeName: string
  themeDark: string
  fileName: string
  themeCollection: ThemeSummary[]
}

const PX_PER_PT = 96 / 72
/** Space left around the diagram when it is fitted to the panel, in px */
const FIT_MARGIN = 24
/** Wheel deltas reported in lines are converted to px with this line height */
const LINE_HEIGHT = 16
/** A clicked box opens at this share of its natural size */
const BOX_ZOOM = 0.75
/** ...and takes up at most this share of the panel's width and height */
const BOX_ZOOM_MAX_PANEL = 0.7
/** Space kept between an opened box and the panel edges, in px */
const BOX_ZOOM_MARGIN = 16
const BOX_ZOOM_ANIMATION = 160
/** Padding around a box's geometry so its border is not cut off, in pt */
const BOX_ZOOM_PADDING = 2
/** A press that moves further than this, in px, is a drag rather than a click */
const CLICK_TOLERANCE = 4

/** A box drawn enlarged above the diagram. Positions are in px, relative to the panel. */
interface BoxZoom {
  node: SVGGElement
  viewBox: string
  left: number
  top: number
  width: number
  height: number
  from: { left: number; top: number; width: number }
}

/** Natural size of a Graphviz SVG in CSS px, read from its width and height in points */
function getSvgSize(svg: string): { width: number; height: number } | null {
  const match = svg.match(/<svg[^>]*?\swidth="([\d.]+)pt"[^>]*?\sheight="([\d.]+)pt"/)
  if (!match) return null
  return { width: parseFloat(match[1]) * PX_PER_PT, height: parseFloat(match[2]) * PX_PER_PT }
}

/** Keeps the diagram inside the panel on one axis, centring it when it is smaller than the panel */
function clampAxis(position: number, viewSize: number, contentSize: number): number {
  if (contentSize <= viewSize) return (viewSize - contentSize) / 2
  return Math.min(0, Math.max(viewSize - contentSize, position))
}

let umlCopy = ''
export function RemixUiSolidityUmlGen({ updatedSvg, loading, renderError, fileName }: RemixUiSolidityUmlGenProps) {
  const [showViewer, setShowViewer] = useState(false)
  const [validSvg, setValidSvg] = useState(false)
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const viewportRef = useRef<HTMLDivElement>(null)
  const transformRef = useRef<ReactZoomPanPinchRef>(null)
  const fittedDiagram = useRef('')
  const [boxZoom, setBoxZoom] = useState<BoxZoom | null>(null)
  const [canZoomBoxes, setCanZoomBoxes] = useState(true)
  const pressPosition = useRef<{ x: number; y: number } | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const overlaySvgRef = useRef<SVGSVGElement>(null)
  const umlDownloader = new UmlDownloadContext()

  useEffect(() => {
    if (updatedSvg.startsWith('<?xml') && updatedSvg.includes('<svg')) {
      umlCopy = updatedSvg
    }
    setValidSvg(updatedSvg.startsWith('<?xml') && updatedSvg.includes('<svg'))
    setShowViewer(updatedSvg.startsWith('<?xml') && updatedSvg.includes('<svg'))
  }, [updatedSvg])

  // Drawn inline rather than as an image so each box can be clicked. The <title>s are removed
  // so the browser does not show node ids as tooltips.
  const inlineSvg = useMemo(() => {
    const start = updatedSvg.indexOf('<svg')
    return { __html: start < 0 ? '' : updatedSvg.slice(start).replace(/<title>[^<]*<\/title>/g, '') }
  }, [updatedSvg])

  const svgSize = useMemo(() => getSvgSize(updatedSvg), [updatedSvg])
  const fitScale = svgSize && viewport.width > 0 && viewport.height > 0
    ? Math.min(1, (viewport.width - 2 * FIT_MARGIN) / svgSize.width, (viewport.height - 2 * FIT_MARGIN) / svgSize.height)
    : 1
  const minScale = fitScale / 2

  // Track the panel size. It is 0 x 0 while the UML tab is hidden.
  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const clampPosition = useCallback(
    (x: number, y: number, scale: number): [number, number] => [clampAxis(x, viewport.width, svgSize.width * scale), clampAxis(y, viewport.height, svgSize.height * scale)],
    [viewport, svgSize]
  )

  const fitToPanel = useCallback(
    (animationTime = 200) => {
      const transform = transformRef.current
      if (!transform || !svgSize || viewport.width <= 0 || viewport.height <= 0) return
      const [x, y] = clampPosition(0, 0, fitScale)
      transform.setTransform(x, y, fitScale, animationTime)
    },
    [svgSize, viewport, fitScale, clampPosition]
  )

  // Fit each new diagram once the panel is visible. Redraws of the same diagram, such as a theme change, keep the current view.
  // This must be an effect, not a layout effect: the zoom library sets itself up in its own effects and would reset the fit.
  useEffect(() => {
    // The viewer is removed while a diagram is generated, so a regenerated diagram is fitted again
    if (!showViewer) fittedDiagram.current = ''
    if (!showViewer || !svgSize || viewport.width <= 0 || viewport.height <= 0) return
    const diagram = `${fileName}:${svgSize.width}x${svgSize.height}`
    if (fittedDiagram.current === diagram) return
    fittedDiagram.current = diagram
    fitToPanel(0)
  }, [showViewer, svgSize, viewport, fileName, fitToPanel])

  const closeBoxZoom = useCallback(() => setBoxZoom(null), [])

  // Opens a copy of a box at a readable size, as large as fits and kept inside the panel
  const openBoxZoom = useCallback(
    (node: SVGGElement) => {
      const transform = transformRef.current
      const panel = viewportRef.current
      if (!transform || !panel) return
      const box = node.getBBox()
      const naturalWidth = (box.width + 2 * BOX_ZOOM_PADDING) * PX_PER_PT
      const naturalHeight = (box.height + 2 * BOX_ZOOM_PADDING) * PX_PER_PT
      const zoom = Math.min(BOX_ZOOM, (viewport.width * BOX_ZOOM_MAX_PANEL) / naturalWidth, (viewport.height * BOX_ZOOM_MAX_PANEL) / naturalHeight)
      // Already shown at least this large: nothing to enlarge
      if (zoom <= transform.instance.transformState.scale * 1.15) return
      const width = naturalWidth * zoom
      const height = naturalHeight * zoom
      const panelRect = panel.getBoundingClientRect()
      const nodeRect = node.getBoundingClientRect()
      const keepInside = (center: number, size: number, panelSize: number) =>
        Math.max(BOX_ZOOM_MARGIN, Math.min(panelSize - BOX_ZOOM_MARGIN - size, center - size / 2))
      setBoxZoom({
        node,
        viewBox: `${box.x - BOX_ZOOM_PADDING} ${box.y - BOX_ZOOM_PADDING} ${box.width + 2 * BOX_ZOOM_PADDING} ${box.height + 2 * BOX_ZOOM_PADDING}`,
        left: keepInside(nodeRect.left - panelRect.left + nodeRect.width / 2, width, viewport.width),
        top: keepInside(nodeRect.top - panelRect.top + nodeRect.height / 2, height, viewport.height),
        width,
        height,
        from: { left: nodeRect.left - panelRect.left, top: nodeRect.top - panelRect.top, width: nodeRect.width }
      })
    },
    [viewport]
  )

  const onPointerDown = useCallback((event: React.PointerEvent) => {
    pressPosition.current = { x: event.clientX, y: event.clientY }
  }, [])

  // Clicking a box opens it; clicking anywhere else closes the open box. Drags only pan.
  const onClick = useCallback(
    (event: React.MouseEvent) => {
      const press = pressPosition.current
      pressPosition.current = null
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > CLICK_TOLERANCE) return
      const node = (event.target as Element).closest?.('#umlSvg g.node') as SVGGElement | null
      if (node && node !== boxZoom?.node) openBoxZoom(node)
      else closeBoxZoom()
    },
    [boxZoom, openBoxZoom, closeBoxZoom]
  )

  // Boxes only open while the diagram is drawn smaller than they would open at
  const onTransformed = useCallback((_ref: ReactZoomPanPinchRef, state: { scale: number }) => {
    setCanZoomBoxes(state.scale * 1.15 < BOX_ZOOM)
  }, [])

  // A new drawing, such as after a theme change, replaces the boxes
  useEffect(() => closeBoxZoom(), [updatedSvg, closeBoxZoom])

  useEffect(() => {
    if (!boxZoom) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeBoxZoom()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [boxZoom, closeBoxZoom])

  // Draw a copy of the clicked box in the overlay, growing out of the original
  useLayoutEffect(() => {
    const svg = overlaySvgRef.current
    const overlay = overlayRef.current
    if (!boxZoom || !svg || !overlay) return
    const copy = boxZoom.node.cloneNode(true) as SVGGElement
    copy.removeAttribute('id')
    copy.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'))
    svg.replaceChildren(copy)
    const { from } = boxZoom
    overlay.animate(
      [{ transform: `translate(${from.left - boxZoom.left}px, ${from.top - boxZoom.top}px) scale(${from.width / boxZoom.width})` }, { transform: 'none' }],
      { duration: BOX_ZOOM_ANIMATION, easing: 'ease-out' }
    )
  }, [boxZoom])

  // The wheel pans the diagram. Ctrl + wheel and trackpad pinch are left to the zoom library.
  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      const transform = transformRef.current
      if (event.ctrlKey || !transform || !svgSize) return
      event.preventDefault()
      closeBoxZoom()
      const unit = event.deltaMode === 1 ? LINE_HEIGHT : event.deltaMode === 2 ? viewport.height : 1
      let deltaX = event.deltaX * unit
      let deltaY = event.deltaY * unit
      if (event.shiftKey && deltaX === 0) {
        deltaX = deltaY
        deltaY = 0
      }
      const { positionX, positionY, scale } = transform.instance.transformState
      const [x, y] = clampPosition(positionX - deltaX, positionY - deltaY, scale)
      transform.setTransform(x, y, scale, 0)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [svgSize, viewport, clampPosition, closeBoxZoom])

  const download = useCallback(
    (fileType: UmlFileType) => {
      if (umlCopy.length === 0) {
        return
      }
      umlDownloader.download(umlCopy, fileName, fileType)
    },
    [updatedSvg, fileName]
  )

  const actionButtons = (zoomIn: () => void, zoomOut: () => void) => (
    <div className="position-absolute bg-transparent mt-2" id="buttons" style={{ zIndex: 4, top: 0, right: '2em' }}>
      <div className="py-2 px-2 d-flex justify-content-center align-items-center">
        <UmlDownload download={download} />
        <CustomTooltip
          tooltipText="Zoom in"
          tooltipId="genUMLzoomin"
          placement="top"
        >
          <button data-id="umlZoominbtn" aria-label="Zoom in" className="badge text-bg-secondary remixui_no-shadow p-2 rounded-circle me-2" onClick={() => zoomIn()}>
            <i className="far fa-plus uml-btn-icon fs-6"></i>
          </button>
        </CustomTooltip>
        <CustomTooltip
          tooltipText="Zoom out"
          tooltipId="genUMLzoomout"
          placement="top"
        >
          <button data-id="umlZoomoutbtn" aria-label="Zoom out" className="badge text-bg-secondary remixui_no-shadow p-2 rounded-circle me-2" onClick={() => zoomOut()}>
            <i className="far fa-minus uml-btn-icon fs-6"></i>
          </button>
        </CustomTooltip>
        <CustomTooltip
          tooltipText="Fit to panel"
          tooltipId="genUMLfit"
          placement="top"
        >
          <button data-id="umlResetbtn" aria-label="Fit to panel" className="badge text-bg-secondary remixui_no-shadow p-2 rounded-circle me-2" onClick={() => fitToPanel()}>
            <i className="far fa-expand uml-btn-icon fs-6"></i>
          </button>
        </CustomTooltip>
      </div>
    </div>
  )

  const defaultInfo = (
    <div className="d-flex flex-column justify-content-center align-items-center mt-5 ms-5">
      <h3 className="h3 align-self-start text-dark">
        <p>
          <FormattedMessage id="solUmlGen.text1" />
        </p>
      </h3>
      <ul className="ms-3 justify-content-start align-self-start">
        <li>
          <h5 className="h5 align-self-start text-dark">
            <p>
              <FormattedMessage id="solUmlGen.text2" />
            </p>
          </h5>
        </li>
        <li>
          <h5 className="h5 align-self-start text-dark">
            <p>
              <FormattedMessage id="solUmlGen.clickOn" />{' '}
              <b>
                <FormattedMessage id="solUmlGen.generateUML" />
              </b>
            </p>
          </h5>
        </li>
      </ul>
    </div>
  )

  // Rendered inline rather than as nested components, so re-renders do not remount the viewer and lose the zoom
  return (
    <div
      id="umlImageHolder"
      ref={viewportRef}
      className={`w-100 h-100 position-relative overflow-hidden${canZoomBoxes ? ' uml-can-zoom' : ''}`}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      {validSvg && showViewer && svgSize ? (
        <TransformWrapper
          ref={transformRef}
          initialScale={1}
          minScale={minScale}
          maxScale={4}
          centerZoomedOut
          wheel={{ wheelDisabled: true }}
          onZoomStart={closeBoxZoom}
          onPanning={closeBoxZoom}
          onTransformed={onTransformed}
        >
          {({ zoomIn, zoomOut }) => (
            <>
              {actionButtons(zoomIn, zoomOut)}
              <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ zIndex: 2 }}>
                <div id="umlSvg" className="uml-svg" style={{ width: svgSize.width, height: svgSize.height }} dangerouslySetInnerHTML={inlineSvg} />
              </TransformComponent>
              {boxZoom && (
                <div
                  ref={overlayRef}
                  className="uml-box-zoom"
                  data-id="umlBoxZoom"
                  title="Click to close"
                  style={{ left: boxZoom.left, top: boxZoom.top, width: boxZoom.width, height: boxZoom.height }}
                >
                  <svg ref={overlaySvgRef} viewBox={boxZoom.viewBox} width="100%" height="100%" />
                </div>
              )}
            </>
          )}
        </TransformWrapper>
      ) : loading ? (
        <div className="h-100 justify-content-center align-items-center d-flex">
          <i className="fas fa-spinner fa-spin fa-4x"></i>
        </div>
      ) : renderError ? (
        <div className="m-5 alert alert-warning" data-id="umlRenderError">
          <FormattedMessage id="solUmlGen.renderError" values={{ fileName }} />
        </div>
      ) : (
        defaultInfo
      )}
    </div>
  )
}

export default RemixUiSolidityUmlGen
