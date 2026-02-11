/* eslint-disable no-undef */
import React, {forwardRef, useEffect, useRef, useState} from 'react' // eslint-disable-line
import { PluginRecord } from '../types'
import './panel.css'
interface panelPLuginProps {
  pluginRecord: PluginRecord,
  sourcePlugin?: any
  initialState?: any,
  highlightStamp?: number,
  children?: any
}

const RemixUIPanelPlugin = (props: panelPLuginProps, panelRef: any) => {
  const localRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<JSX.Element | HTMLDivElement>()
  const [showHighlight, setShowHighlight] = useState<boolean>(false)

  useEffect(() => {
    const ref: any = panelRef || localRef
    if (ref.current) {
      if (props.pluginRecord.view) {
        if (React.isValidElement(props.pluginRecord.view)) {
          let view = props.pluginRecord.view

          if (props.initialState) {
            let hasInitialProps = false

            view = React.Children.map((props.pluginRecord.view.props as any).children, child => {
              if (React.isValidElement(child) && typeof child.type === 'function' && !hasInitialProps) {
                hasInitialProps = true
                // Safe to clone and pass `initialState`
                return React.cloneElement(child, { ...props, initialState: props.initialState } as any)
              }
              return child
            })
          }

          setView(view)
        } else {
          ref.current.appendChild(props.pluginRecord.view)
        }
      }
    }
  }, [])

  useEffect(() => {
    if (props.highlightStamp) setShowHighlight(true)
  }, [props.highlightStamp])

  useEffect(() => {
    if (showHighlight) {
      setTimeout(() => {
        setShowHighlight(false)
      }, 500)
    }
  }, [showHighlight])

  return (
    <div className={`${props.pluginRecord.active ? `${props.pluginRecord.class}` : 'd-none'} ${showHighlight ? 'highlight' : ''}`} ref={panelRef || localRef}>
      <>{view}</>
    </div>
  )
}

export default forwardRef(RemixUIPanelPlugin)
