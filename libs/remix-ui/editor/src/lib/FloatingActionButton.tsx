import React, { useState } from 'react'
import { CustomTooltip } from '@remix-ui/helper'

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
          <CustomTooltip placement="left" tooltipText="Edit your code with AI assistance">
            <button
              className="fab-menu-item"
              onClick={() => {
                onEditWithAI()
                setIsExpanded(false)
              }}
            >
              <i className="fas fa-edit"></i>
              <span className="fab-menu-text">Edit with AI</span>
            </button>
          </CustomTooltip>
          <CustomTooltip placement="left" tooltipText="Get AI explanation of your contract">
            <button
              className="fab-menu-item"
              onClick={() => {
                onExplainContract()
                setIsExpanded(false)
              }}
            >
              <i className="fas fa-file-contract"></i>
              <span className="fab-menu-text">Explain contract</span>
            </button>
          </CustomTooltip>
          <CustomTooltip placement="left" tooltipText="Create a Dapp from your contract">
            <button
              className="fab-menu-item"
              onClick={() => {
                onCreateDapp()
                setIsExpanded(false)
              }}
            >
              <i className="fas fa-rocket"></i>
              <span className="fab-menu-text">Create a DApp</span>
            </button>
          </CustomTooltip>
        </div>
      )}
      <CustomTooltip placement="left" tooltipText="Show AI tools" hide={isExpanded}>
        <button
          className={`fab-main-button ${isExpanded ? 'fab-expanded' : ''}`}
          onClick={toggleExpand}
        >
          {isExpanded ? (
            <i className="fas fa-times"></i>
          ) : (
            <img src="assets/img/remixai-logoAI.svg" alt="AI tools" className="fab-ai-logo" />
          )}
        </button>
      </CustomTooltip>
    </div>
  )
}
