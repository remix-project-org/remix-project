import React, { useState } from 'react'
import { FeatureGroup } from '@remix-api'
import { useAuth } from '../../../app/src/lib/remix-app/context/auth-context'
import { BetaInfoModal } from './modals/beta-info-modal'
import './feature-badges.css'

interface FeatureBadgesProps {
  plugin?: any
  onClose?: () => void
}

const BADGE_CONFIG: Record<string, { icon: string; colorClass: string }> = {
  'beta': { icon: 'fas fa-flask', colorClass: 'feature-badge--beta' },
  'AI BASIC': { icon: 'fas fa-robot', colorClass: 'feature-badge--ai' },
  'ai-unlimited': { icon: 'fas fa-infinity', colorClass: 'feature-badge--ai-unlimited' },
}

const getDefaultBadgeConfig = (name: string) => ({
  icon: 'fas fa-star',
  colorClass: 'feature-badge--default'
})

export const FeatureBadges: React.FC<FeatureBadgesProps> = ({ plugin, onClose }) => {
  const { featureGroups } = useAuth()
  const [showBetaModal, setShowBetaModal] = useState(false)

  if (!featureGroups || featureGroups.length === 0) return null

  const handleBadgeClick = (group: FeatureGroup) => {
    if (group.name === 'beta') {
      setShowBetaModal(true)
    }
    // Other badges: future modals can be added here
  }

  return (
    <>
      <div className="feature-badges-section">
        <div className="feature-badges-label">Your Plan</div>
        <div className="feature-badges-list">
          {featureGroups.map((group) => {
            const config = BADGE_CONFIG[group.name] || getDefaultBadgeConfig(group.name)
            const isClickable = group.name === 'beta' // only beta has a modal for now

            return (
              <div
                key={group.name}
                className={`feature-badge ${config.colorClass} ${isClickable ? 'feature-badge--clickable' : ''}`}
                title={group.description}
                onClick={isClickable ? () => handleBadgeClick(group) : undefined}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
              >
                <i className={`${config.icon} feature-badge-icon`}></i>
                <span data-id={`feature-badge-name-${group.name}`} className="feature-badge-name">{group.display_name}</span>
                {isClickable && <i className="fas fa-chevron-right feature-badge-arrow"></i>}
              </div>
            )
          })}
        </div>
      </div>
      <div className="dropdown-divider user-menu-divider"></div>

      {showBetaModal && (
        <BetaInfoModal
          onClose={() => {
            setShowBetaModal(false)
          }}
          plugin={plugin}
        />
      )}
    </>
  )
}
