import React, { useState } from 'react'

interface FloatingActionButtonProps {
  onGasAudit: () => void
  onSecurityAudit: () => void
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({ onGasAudit, onSecurityAudit }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const toggleExpand = () => {
    setIsExpanded(!isExpanded)
  }

  return (
    <div className="fab-container">
      {isExpanded && (
        <div className="fab-menu">
          <button
            className="fab-menu-item"
            onClick={() => {
              onGasAudit()
              setIsExpanded(false)
            }}
            title="AI-powered gas optimization analysis"
          >
            <i className="fas fa-gas-pump"></i>
            <span className="fab-menu-text">Gas Audit</span>
          </button>
          <button
            className="fab-menu-item"
            onClick={() => {
              onSecurityAudit()
              setIsExpanded(false)
            }}
            title="AI-powered security analysis"
          >
            <i className="fas fa-shield-alt"></i>
            <span className="fab-menu-text">Security Audit</span>
          </button>
        </div>
      )}
      <button
        className={`fab-main-button ${isExpanded ? 'fab-expanded' : ''}`}
        onClick={toggleExpand}
        title={isExpanded ? 'Close AI tools' : 'Show AI tools'}
      >
        {isExpanded ? (
          <i className="fas fa-times"></i>
        ) : (
          <img src="assets/img/remixai-logoAI.svg" alt="AI tools" className="fab-ai-logo" />
        )}
      </button>
    </div>
  )
}
