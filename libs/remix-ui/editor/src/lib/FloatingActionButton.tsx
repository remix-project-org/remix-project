import React, { useState } from 'react'

interface FloatingActionButtonProps {
  onEditWithAI: () => void
  onExplainContract: () => void
  onCreateDapp: () => void
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({ onEditWithAI, onExplainContract, onCreateDapp }) => {
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
              onEditWithAI()
              setIsExpanded(false)
            }}
            title="Edit your code with AI assistance"
          >
            <i className="fas fa-edit"></i>
            <span className="fab-menu-text">Edit with AI</span>
          </button>
          <button
            className="fab-menu-item"
            onClick={() => {
              onExplainContract()
              setIsExpanded(false)
            }}
            title="Get AI explanation of your contract"
          >
            <i className="fas fa-file-contract"></i>
            <span className="fab-menu-text">Explain contract</span>
          </button>
          <button
            className="fab-menu-item"
            onClick={() => {
              onCreateDapp()
              setIsExpanded(false)
            }}
            title="Create a Dapp from your contract"
          >
            <i className="fas fa-rocket"></i>
            <span className="fab-menu-text">Create a DApp</span>
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
