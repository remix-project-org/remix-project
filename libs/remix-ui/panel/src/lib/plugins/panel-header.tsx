import React, {useEffect, useState, useContext} from 'react' // eslint-disable-line
import { FormattedMessage } from 'react-intl'
import { PluginRecord } from '../types'
import './panel.css'
import { CustomTooltip, RenderIf, RenderIfNot } from '@remix-ui/helper'
import { TrackingContext } from '@remix-ide/tracking'
import { PluginPanelEvent } from '@remix-api'

export interface RemixPanelProps {
  plugins: Record<string, PluginRecord>,
  pinView?: (profile: PluginRecord['profile'], view: PluginRecord['view']) => void,
  unPinView?: (profile: PluginRecord['profile']) => void,
  closePlugin?: (profile: PluginRecord['profile']) => void,
  maximizePlugin?: (profile: PluginRecord['profile']) => void
}
const RemixUIPanelHeader = (props: RemixPanelProps) => {
  const [plugin, setPlugin] = useState<PluginRecord>()
  const [toggleExpander, setToggleExpander] = useState<boolean>(false)
  const { trackMatomoEvent } = useContext(TrackingContext)

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

  const closePlugin = async () => {
    props.closePlugin && props.closePlugin(plugin.profile)
  }

  const tooltipChild = <i className={`px-1 ms-2 pt-1 pb-2 ${!toggleExpander ? 'fas fa-angle-right' : 'fas fa-angle-down bg-light'}`} aria-hidden="true"></i>

  return (
    <header className="d-flex flex-column">
      <div className="swapitHeader px-3 pt-2 pb-0 d-flex flex-row">
        <h6 className="pt-0 mb-1" data-id="sidePanelSwapitTitle">
          {plugin?.profile?.name && <FormattedMessage id={`${plugin.profile.name}.displayName`} defaultMessage={plugin?.profile?.displayName || plugin?.profile?.name} />}
        </h6>
        <div className="d-flex flex-row">
          <div className="d-flex flex-row">
            { plugin?.profile?.maintainedBy?.toLowerCase() === 'remix' ? (
              <CustomTooltip placement="auto" tooltipId="maintainedByTooltipRemix" tooltipText={<FormattedMessage id="home.maintainedByRemix" />}>
                <i className="text-success mt-1 px-1 fa-solid fa-shield-halved"></i>
              </CustomTooltip>) :
              plugin?.profile?.maintainedBy ?
                (<CustomTooltip placement="auto" tooltipId={"maintainedByTooltip" + plugin?.profile?.maintainedBy} tooltipText={"Maintained by " + plugin?.profile?.maintainedBy}>
                  <i aria-hidden="true" className="mt-1 px-1 text-secondary fa-solid fa-shield-halved"></i>
                </CustomTooltip>)
                : (<CustomTooltip placement="auto" tooltipId="maintainedByTooltipRemixUnknown" tooltipText={<FormattedMessage id="panel.maintainedExternally" />}>
                  <i aria-hidden="true" className="mt-1 px-1 text-secondary fa-solid fa-shield-halved"></i>
                </CustomTooltip>)
            }
          </div>
          <div className="swapitHeaderInfoSection d-flex justify-content-between" data-id="swapitHeaderInfoSectionId" onClick={toggleClass}>
            <CustomTooltip placement="auto-end" tooltipText={<FormattedMessage id="panel.pluginInfo" />} tooltipId="pluginInfoTooltip" tooltipClasses="text-nowrap">
              {tooltipChild}
            </CustomTooltip>
          </div>
          {
            plugin && plugin.profile.name !== 'filePanel' && (
              <RenderIfNot condition={plugin.profile.name === 'filePanel'}>
                <>
                  <RenderIf condition={plugin.pinned}>
                    <>
                      <div className='d-flex' data-id="movePluginToLeft" data-pinnedplugin={`movePluginToLeft-${plugin.profile.name}`} onClick={unPinPlugin}>
                        <CustomTooltip placement="auto-end" tooltipId="unPinnedMsg" tooltipClasses="text-nowrap" tooltipText={<FormattedMessage id="panel.unPinnedMsg" />}>
                          <i aria-hidden="true" className="mt-1 px-2 fak fa-fa-dock-l"></i>
                        </CustomTooltip>
                      </div>
                      <CustomTooltip placement="bottom-end" tooltipText="Hide pinned Plugin">
                        <i
                          className="fa-solid fa-compress ms-2 fs-5"
                          onClick={closePlugin}
                          data-id="closePinnedPlugin"
                        ></i>
                      </CustomTooltip>
                    </>
                  </RenderIf>
                  <RenderIfNot condition={plugin.pinned}>
                    <div className='d-flex' data-id="movePluginToRight" data-pinnedplugin={`movePluginToRight-${plugin.profile.name}`} onClick={pinPlugin}>
                      <CustomTooltip placement="auto-end" tooltipId="pinnedMsg" tooltipClasses="text-nowrap" tooltipText={<FormattedMessage id="panel.pinnedMsg" />}>
                        <i aria-hidden="true" className="mt-1 px-1 ps-2 fak fa-fa-dock-r"></i>
                      </CustomTooltip>
                    </div>
                  </RenderIfNot>
                </>
              </RenderIfNot>
            )
          }
        </div>
      </div>
      <div className={`mx-3 mb-2 flex-column ${toggleExpander ? 'd-flex' : 'd-none'}`}>
        <div className="bg-light p-3 rounded">
          <div className="border-bottom pb-2 mb-2 font-weight-bold card-title">
            <FormattedMessage id="panel.pluginDetails" defaultMessage="Plugin details" />
          </div>

          {plugin?.profile?.maintainedBy && (
            <div className="d-flex align-items-center mb-3">
              <span className={`font-weight-bold ${plugin.profile.maintainedBy.toLowerCase() === 'remix' ? 'text-success' : ''}`}>
                Maintained by {plugin.profile.maintainedBy}
              </span>
              <i className={`fa-solid fa-shield-halved ms-2 ${plugin.profile.maintainedBy.toLowerCase() === 'remix' ? 'text-success' : 'text-body-secondary'}`}></i>
            </div>
          )}

          {plugin?.profile?.description && (
            <div className="mb-3">
              <label className="text-body-secondary d-block mb-1">
                <FormattedMessage id="panel.description" />
              </label>
              <span className="small">{plugin.profile.description}</span>
            </div>
          )}

          {plugin?.profile?.repo && (
            <span className="d-flex flex-row align-items-center d-block mb-1">
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
