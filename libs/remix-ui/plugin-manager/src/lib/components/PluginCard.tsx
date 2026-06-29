import React, { useContext } from 'react'
import { FormattedMessage, useIntl } from 'react-intl'
import { ToggleSwitch } from '@remix-ui/toggle'
import { RenderIf } from '@remix-ui/helper'
import { ThemeContext } from '../themeContext'

interface PluginCardProps {
  profile: any
  isActive: boolean
  isLoading: boolean
  togglePlugin: (pluginName: string) => void
}

function PluginCard({ profile, isActive, isLoading, togglePlugin }: PluginCardProps) {
  const theme = useContext(ThemeContext)
  const isDark = theme.name === 'dark'
  const intl = useIntl()

  const handleDocsClick = () => {
    if (profile.documentation) {
      window.open(profile.documentation, '_blank')
    }
  }

  return (
    <article className="mb-3 card h-100" data-id={`pluginManagerComponentActiveTile`}>
      <div className="d-flex align-items-center px-2 justify-content-between border-bottom">
        <div className='d-flex align-items-center px-2'>
          <RenderIf condition={isLoading}>
            <i className="fad fa-spinner fa-spin me-2"></i>
          </RenderIf>
          <RenderIf condition={!isLoading}>
            {profile.icon ? <img src={profile.icon} className="me-2 remixui_pluginIcon" alt={`${profile.name} icon`} /> : <i className="fas fa-puzzle-piece me-2"></i>}
          </RenderIf>
          <span className="fw-bold" style={{ color: isDark ? 'white' : 'black' }}>{profile.displayName || profile.name}</span>
        </div>
        <div className="toggle-container">
          <div
            data-id={`pluginManagerComponent${isActive ? 'Deactivate' : 'Activate'}Button${profile.name}`}
            aria-label={`${isActive ? 'Deactivate' : 'Activate'} ${profile.displayName || profile.name}`}>
            <ToggleSwitch
              id={`toggleSwitch-${profile.name}`}
              isOn={isActive}
              onClick={() => togglePlugin(profile.name)}
            />
          </div>
        </div>
      </div>

      <div className="d-flex flex-column justify-content-between h-100">
        <div className="p-3">
          <div className={`text-${(profile.maintainedBy || '').toLowerCase() === 'remix' ? 'success' : 'dark'} mb-1`}>
            <i className="fa-solid fa-shield-halved me-2"></i>
            <FormattedMessage id="home.maintainedBy" defaultMessage="Maintained by"/> {profile.maintainedBy || intl.formatMessage({ id: 'pluginManager.communityMaintained' })}
          </div>
          <div className="small mb-2" style={{ color: isDark ? 'white' : 'black' }}>{profile.description}</div>
        </div>
        {profile.documentation && (
          <div className="px-3 pb-3">
            <button className="btn btn-light btn-sm w-100 text-decoration-none border" onClick={handleDocsClick}>
              <i className="fa-solid fa-book me-1"></i>
              <FormattedMessage id="pluginManager.openDocumentation" defaultMessage="Open documentation" />
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

export default PluginCard