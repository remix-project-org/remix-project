import React from 'react'
import './QuickDappBanner.css'

interface QuickDappBannerProps {
  onClose: () => void
  onStartNow: () => void
}

export const QuickDappBanner = ({ onClose, onStartNow }: QuickDappBannerProps) => {
  return (
    <div className="quick-dapp-banner" data-id="quickDappBanner">
      <div className="quick-dapp-banner-content">
        <img src="assets/img/remixAI_small.svg" alt="Remix AI" className="quick-dapp-banner-icon" />
        <span className="quick-dapp-banner-text">Create a dapp with your contracts</span>
        <button
          className="btn btn-ai quick-dapp-banner-btn"
          onClick={onStartNow}
          data-id="quickDappStartNowBtn"
        >
          Start now
        </button>
      </div>
      <button
        className="quick-dapp-banner-close"
        onClick={onClose}
        data-id="quickDappBannerClose"
        aria-label="Close banner"
      >
        <img src="assets/img/closeIcon.png" alt="Close" className="quick-dapp-banner-close-icon" />
      </button>
    </div>
  )
}

export default QuickDappBanner
