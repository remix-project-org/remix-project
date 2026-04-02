import React, {useEffect, useState, useContext} from 'react' // eslint-disable-line
import { FormattedMessage, useIntl } from 'react-intl'
import { PluginRecord } from '../types'
import './panel.css'
import { CustomTooltip, RenderIf, RenderIfNot } from '@remix-ui/helper'
import { TrackingContext } from '@remix-ide/tracking'
import { PluginPanelEvent } from '@remix-api'
import { appActionTypes, AppContext } from '@remix-ui/app'

export interface RemixPanelProps {
  plugins: Record<string, PluginRecord>,
  sourcePlugin?: any
  pinView?: (profile: PluginRecord['profile'], view: PluginRecord['view']) => void,
  unPinView?: (profile: PluginRecord['profile']) => void,
  togglePanel?: () => void,
  maximizePanel?: () => void,
  isMaximized?: boolean
}
const RemixUIPanelHeader = (props: RemixPanelProps) => {
  const [plugin, setPlugin] = useState<PluginRecord>()
  const [toggleExpander, setToggleExpander] = useState<boolean>(false)
  const [trackMaximize, setTrackMaximize] = useState<boolean>(false);
  const { trackMatomoEvent } = useContext(TrackingContext)
  const appContext = useContext(AppContext)
  const intl = useIntl()

  useEffect(() => {
    setToggleExpander(false)
    if (props.plugins) {
      const p = Object.values(props.plugins).find((pluginRecord) => {
        return pluginRecord.active === true
      })
      setPlugin(p)
    }
  }, [props])

  const toggleClass = () => {
    setToggleExpander(!toggleExpander)
  }

  const pinPlugin = () => {
    props.pinView && props.pinView(plugin.profile, plugin.view)
    trackMatomoEvent?.({ category: 'pluginPanel', action: 'pinToRight', name: plugin.profile.name })
  }

  const unPinPlugin = () => {
    props.unPinView && props.unPinView(plugin.profile)
    trackMatomoEvent?.({ category: 'pluginPanel', action: 'pinToLeft', name: plugin.profile.name })
  }

  const togglePanelHandler = () => {
    props.togglePanel && props.togglePanel()
  }

  const maximizePanelHandler = () => {
    props.maximizePanel && props.maximizePanel()
  }

  const tooltipChild = <i className={`px-1 ml-2 pt-1 pb-2 ${!toggleExpander ? 'fas fa-angle-right' : 'fas fa-angle-down bg-light'}`} aria-hidden="true"></i>

  const FilePanelHeading = () => {

    return (
      <section className="px-1 pt-2 pb-0 flex flex-row items-center">
        <div className="bg-light rounded-xl p-3">
          <i className="far fa-copy fs-3"></i>
        </div>
        <div className="flex flex-col ml-4">
          <h6><FormattedMessage id="panel.fileExplorerTitle" /></h6>
          <div className=""><FormattedMessage id="panel.fileExplorerDescription" /></div>
        </div>
      </section>
    )
  }

  const RemixAiPanelHeading = () => {

    return (
      <section className="px-1 pt-2 pb-0 flex flex-row items-center">
        <div className="bg-light rounded-xl p-3">
          <i className="fa-kit fa-remixai fs-3"></i>
        </div>
        <div className="flex flex-col ml-4">
          <h6><FormattedMessage id="panel.remixAiTitle" /></h6>
          <div className=""><FormattedMessage id="panel.remixAiDescription" /></div>
        </div>
      </section>
    )
  }

  useEffect(() => {
    function handleMaximize() {
      if (plugin?.profile.name.toLowerCase() === 'remixaiassistant') {
        setTrackMaximize(props.isMaximized);
        dispatchEvent(new CustomEvent('rightSidePanelMaximized', { detail: { isMaximized: props.isMaximized } }));
      }
    }

    (props.sourcePlugin as any)?.on('rightSidePanel', 'rightSidePanelMaximized', handleMaximize);

    return () => {
      (props.sourcePlugin as any)?.off('rightSidePanel', 'rightSidePanelMaximized', handleMaximize);
    }
  }, [props.sourcePlugin, props.isMaximized, plugin?.profile.name, appContext])

  return (
    <header className="flex flex-col">
      <div className="swapitHeader pl-3 pr-2 pt-2 pb-0 flex flex-row">
        <h6 className="pt-0 mb-1" data-id="sidePanelSwapitTitle">
          {plugin?.profile?.name && <FormattedMessage id={`${plugin.profile.name}.displayName`} defaultMessage={plugin?.profile?.displayName || plugin?.profile?.name} />}
        </h6>
        <div className="flex flex-row">
          <div className="flex flex-row">
            { plugin?.profile?.maintainedBy?.toLowerCase() === 'remix' ? (
              <CustomTooltip placement="auto" tooltipId="maintainedByTooltipRemix" tooltipText={<FormattedMessage id="home.maintainedByRemix" />}>
                <i className="text-success mt-1 px-1 fa-solid fa-shield-halved"></i>
              </CustomTooltip>) :
              plugin?.profile?.maintainedBy ?
                (<CustomTooltip placement="auto" tooltipId={"maintainedByTooltip" + plugin?.profile?.maintainedBy} tooltipText={intl.formatMessage({ id: 'panel.maintainedByLabel' }) + ' ' + plugin?.profile?.maintainedBy}>
                  <i aria-hidden="true" className="mt-1 px-1 text-secondary fa-solid fa-shield-halved"></i>
                </CustomTooltip>)
                : (<CustomTooltip placement="auto" tooltipId="maintainedByTooltipRemixUnknown" tooltipText={<FormattedMessage id="panel.maintainedExternally" />}>
                  <i aria-hidden="true" className="mt-1 px-1 text-secondary fa-solid fa-shield-halved"></i>
                </CustomTooltip>)
            }
          </div>
          <div className="swapitHeaderInfoSection flex justify-between" data-id="swapitHeaderInfoSectionId" onClick={toggleClass}>
            <CustomTooltip placement="auto-end" tooltipText={<FormattedMessage id="panel.pluginInfo" />} tooltipId="pluginInfoTooltip" tooltipClasses="whitespace-nowrap">
              {tooltipChild}
            </CustomTooltip>
          </div>
          {
            plugin && plugin.profile.name !== 'filePanel' && (
              <RenderIfNot condition={plugin.profile.name === 'filePanel'}>
                <>
                  <RenderIf condition={plugin.pinned}>
                    <>
                      <div className='flex' data-id="movePluginToLeft" data-pinnedplugin={`movePluginToLeft-${plugin.profile.name}`} onClick={unPinPlugin}>
                        <CustomTooltip placement="auto-end" tooltipId="unPinnedMsg" tooltipClasses="whitespace-nowrap" tooltipText={<FormattedMessage id="panel.unPinnedMsg" />}>
                          <div className="codicon codicon-layout-sidebar-left-dock ml-2 fs-6 font-bold lh-1" style={{ marginTop: '2px' }}></div>
                        </CustomTooltip>
                      </div>
                      <CustomTooltip placement="bottom-end" tooltipText={props.isMaximized
                        ? intl.formatMessage({ id: 'panel.minimizePanel' })
                        : intl.formatMessage({ id: 'panel.maximizePanel' })}>
                        <div
                          className="codicon-screen-icon ml-2"
                          onClick={maximizePanelHandler}
                          data-id="maximizeRightSidePanel"
                        >
                          {props.isMaximized ? '\ueb4d' : '\ueb4c' /* Actual icons were not being rendered, so used unicode for codicon-screen-full & codicon-screen-normal icons*/ }
                        </div>
                      </CustomTooltip>
                      <CustomTooltip placement="bottom-end" tooltipText={intl.formatMessage({ id: 'panel.hidePanel' })}>
                        <div
                          className="codicon codicon-close ml-2 fs-5 font-bold"
                          onClick={togglePanelHandler}
                          data-id="hideRightSidePanel"
                        ></div>
                      </CustomTooltip>
                    </>
                  </RenderIf>
                  <RenderIfNot condition={plugin.pinned || plugin.profile.name === 'debugger'}>
                    <div className='flex' data-id="movePluginToRight" data-pinnedplugin={`movePluginToRight-${plugin.profile.name}`} onClick={pinPlugin}>
                      <CustomTooltip placement="auto-end" tooltipId="pinnedMsg" tooltipClasses="whitespace-nowrap" tooltipText={<FormattedMessage id="panel.pinnedMsg" />}>
                        <div className="codicon codicon-layout-sidebar-right-dock ml-2 fs-6 font-bold lh-1" style={{ marginTop: '2px' }}></div>
                      </CustomTooltip>
                    </div>
                  </RenderIfNot>
                </>
              </RenderIfNot>
            )
          }
        </div>
      </div>
      <div className={`mx-3 mb-2 flex-col ${toggleExpander ? 'flex' : 'hidden'}`}>
        <div className="bg-light p-3 rounded">
          <div className="border-b pb-2 mb-2 font-weight-bold card-title">
            <FormattedMessage id="panel.pluginDetails" defaultMessage="Plugin details" />
          </div>

          {plugin?.profile?.maintainedBy && (
            <div className="flex items-center mb-3">
              <span className={`font-weight-bold ${plugin.profile.maintainedBy.toLowerCase() === 'remix' ? 'text-success' : ''}`}>
                <FormattedMessage id="panel.maintainedByLabel" /> {plugin.profile.maintainedBy}
              </span>
              <i className={`fa-solid fa-shield-halved ml-2 ${plugin.profile.maintainedBy.toLowerCase() === 'remix' ? 'text-success' : 'text-body-secondary'}`}></i>
            </div>
          )}

          {plugin?.profile?.description && (
            <div className="mb-3">
              <label className="text-body-secondary block mb-1">
                <FormattedMessage id="panel.description" />
              </label>
              <span className="small">{plugin.profile.description}</span>
            </div>
          )}

          {plugin?.profile?.repo && (
            <span className="flex flex-row items-center block mb-1">
              <a href={plugin?.profile?.repo} target="_blank" rel="noreferrer">
                <FormattedMessage id="panel.makeAnissue" />
              </a>
            </span>
          )}
        </div>
      </div>

    </header>
  )
}

export default RemixUIPanelHeader
