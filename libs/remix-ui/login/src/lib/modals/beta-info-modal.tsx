import React from 'react'
import './beta-info-modal.css'

interface BetaInfoModalProps {
  onClose: () => void
  plugin?: any
}

export const BetaInfoModal: React.FC<BetaInfoModalProps> = ({ onClose, plugin }) => {
  return (
    <div
      className="modal d-flex align-items-center justify-content-center beta-modal-backdrop"
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered beta-modal-dialog"
        role="document"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content d-flex flex-row overflow-hidden beta-modal-content">
          {/* Left Section - swirl art */}
          <div className="d-flex flex-column justify-content-center align-items-center position-relative beta-modal-left-section">
            <div className="position-absolute top-0 start-0 end-0 bottom-0 beta-modal-gradient-overlay" />
            <div className="text-center w-100 position-relative beta-modal-content-wrapper">
              <div className="beta-modal-hero-icon">
                <i className="fas fa-flask"></i>
              </div>
              <h3 className="beta-modal-hero-title">Remix Beta</h3>
              <p className="beta-modal-hero-subtitle">You're shaping the future of Web3 tooling</p>
            </div>
          </div>

          {/* Right Section */}
          <div className="d-flex flex-column beta-modal-right-section">
            <div className="modal-header border-0 flex-column align-items-start">
              <div className="d-flex w-100 align-items-center mb-2">
                <h5 className="modal-title mb-0">Remix Beta Testing Program</h5>
                <div className="close ms-auto beta-modal-close-btn fs-5" onClick={onClose}>
                  <i className="fas fa-times text-dark"></i>
                </div>
              </div>
              <p className="text-muted mb-0 fs-small-medium">
                Help us build the future of Web3 development tooling.
              </p>
            </div>

            <div className="modal-body flex-grow-1 beta-modal-body">
              {/* Benefits */}
              <div className="beta-modal-section">
                <h6 className="beta-modal-section-title">Why you matter</h6>
                <ul className="beta-modal-benefits-list">
                  <li>
                    <i className="fas fa-bolt beta-modal-benefit-icon"></i>
                    <div>
                      <strong>First Access</strong>
                      <span>Try new features before anyone else</span>
                    </div>
                  </li>
                  <li>
                    <i className="fas fa-comments beta-modal-benefit-icon"></i>
                    <div>
                      <strong>Direct Line</strong>
                      <span>Your feedback goes straight to the core team</span>
                    </div>
                  </li>
                  <li>
                    <i className="fas fa-graduation-cap beta-modal-benefit-icon"></i>
                    <div>
                      <strong>Early Mastery</strong>
                      <span>Master the new workflow before everyone else</span>
                    </div>
                  </li>
                </ul>
              </div>

              {/* What's included */}
              <div className="beta-modal-section">
                <h6 className="beta-modal-section-title">What's included</h6>
                <div className="beta-modal-features-grid">
                  <div className="beta-modal-feature-item">
                    <i className="fas fa-cloud beta-modal-feature-icon"></i>
                    <span>Advanced AI Models</span>
                  </div>
                  <div className="beta-modal-feature-item">
                    <i className="fas fa-robot beta-modal-feature-icon"></i>
                    <span>AI MCP</span>
                  </div>
                  <div className="beta-modal-feature-item">
                    <i className="fas fa-code-branch beta-modal-feature-icon"></i>
                    <span>Quick Dapp Frontend Builder</span>
                  </div>
                  <div className="beta-modal-feature-item">
                    <i className="fas fa-palette beta-modal-feature-icon"></i>
                    <span>Cloud Workspaces</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="beta-modal-actions">
                <button
                  className="btn beta-modal-btn-discord"
                  onClick={() => window.open('https://discord.gg/remix', '_blank')}
                >
                  <i className="fab fa-discord me-2"></i>
                  Join our Discord
                </button>
                <button
                  className="btn beta-modal-btn-docs"
                  onClick={() => window.open('https://remix-ide.readthedocs.io/', '_blank')}
                >
                  <i className="fas fa-book me-2"></i>
                  Read the Docs
                </button>
                <button
                  className="btn beta-modal-btn-blog"
                  onClick={() => window.open('https://medium.com/remix-ide', '_blank')}
                >
                  <i className="fas fa-newspaper me-2"></i>
                  Latest Blog Posts
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="beta-modal-footer">
              <p className="text-muted mb-0 fs-small">
                <i className="fas fa-heart me-1" style={{ color: '#e74c3c' }}></i>
                Thank you for being a beta tester!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
