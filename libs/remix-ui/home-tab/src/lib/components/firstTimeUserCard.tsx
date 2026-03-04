import React, { useContext } from 'react'
import { ThemeContext } from '../themeContext'
import { HomeTabEvent, MatomoEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'
import { FormattedMessage } from 'react-intl'

interface FirstTimeUserCardProps {
  plugin: any
}

export const FirstTimeUserCard: React.FC<FirstTimeUserCardProps> = ({ plugin }) => {
  const theme = useContext(ThemeContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const isDark = theme.name === 'dark'

  // Component-specific tracker with default HomeTabEvent type
  const trackMatomoEvent = <T extends MatomoEvent = HomeTabEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  const handleExplainEthereum = () => {
    trackMatomoEvent({
      category: 'hometab',
      action: 'explainEthereum',
      name: 'Explain Ethereum importance',
      isClick: true
    })
    plugin.call('rightSidePanel', 'maximizePanel')
    plugin.call('remixaiassistant', 'chatPipe', `Why Ethereum and decentralized applications are important for the future of technology and society. Give me a concise and clear explanation. Provide use cases. Propose some areas of discussion, then stop and let me ask you more questions about it.`)
  }

  const handleGetStarted = async () => {
    trackMatomoEvent({
      category: 'hometab',
      action: 'getStartedContract',
      name: 'Get started with contract',
      isClick: true
    })
    if (!await plugin.call('filePanel', 'workspaceExists', 'Introduction to ERC20 token')) await plugin.call('filePanel', 'createWorkspace', 'Introduction to ERC20 token', 'ozerc20')
    plugin.call('remixaiassistant', 'chatPipe', `an ERC20 token workspace has been created. Compile and Deploy it. Then give precise details for interacting with that contract in Remix. Propose some next steps for me to learn more about it and experiment with it. Then stop and let me ask you more questions.`)
  }

  return (
    <div 
      className="card border-0 h-100 shadow-lg" 
      style={{ 
        background: `linear-gradient(135deg, var(--bs-body-bg) 0%, ${isDark ? '#2a2a3e' : '#f8f9ff'} 100%)`,
        borderRadius: '20px',
        minHeight: '280px'
      }}
    >
      <div className="card-body p-4">
        {/* Welcome Header */}
        <div className="text-center mb-4">
          <h4 className="mb-2 fw-bold" style={{ color: isDark ? 'white' : 'black' }}>
            <FormattedMessage id="homeTab.newToRemix" defaultMessage="New to Remix? here's what you can do" />
          </h4>
          <p className="mb-0 small" style={{ color: isDark ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.7)' }}>
            Start your blockchain development journey with these interactive guides
          </p>
        </div>

        {/* Action Cards */}
        <div className="d-flex flex-column gap-3">
          <div 
            className="p-3 rounded-4 d-flex align-items-center justify-content-between shadow-sm position-relative overflow-hidden"
            style={{ 
              background: `linear-gradient(45deg, var(--bs-body-bg), ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)'})`,
              backdropFilter: 'blur(10px)',
              border: `2px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
              transition: 'all 0.3s ease',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-5px) scale(1.02)'
              e.currentTarget.style.boxShadow = '0 15px 35px rgba(0,0,0,0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)'
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.1)'
            }}
          >
            <div className="d-flex align-items-center flex-grow-1">
              <div 
                className="rounded-circle d-flex justify-content-center align-items-center me-4 shadow-sm"
                style={{ 
                  width: '60px', 
                  height: '60px', 
                  background: 'linear-gradient(45deg, var(--bs-info), var(--bs-cyan))'
                }}
              >
                <i className="fas fa-lightbulb text-white" style={{ fontSize: '1.5rem' }}></i>
              </div>
              <div className="flex-grow-1 pe-3">
                <h5 className="mb-2 fw-semibold" style={{ color: isDark ? 'white' : 'black' }}>
                  Learn the Foundation
                </h5>
                <p className="mb-0" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)' }}>
                  Why Ethereum and decentralized applications are important
                </p>
              </div>
            </div>
            <button 
              className="btn btn-primary btn-lg px-4 py-3 fw-semibold shadow-sm" 
              onClick={handleExplainEthereum}
              style={{ 
                borderRadius: '12px',
                background: 'linear-gradient(45deg, var(--bs-primary), var(--bs-info))',
                border: 'none'
              }}
            >
              <i className="fas fa-play me-2"></i>
              Explore
            </button>
          </div>

          <div 
            className="p-3 rounded-4 d-flex align-items-center justify-content-between shadow-sm position-relative overflow-hidden"
            style={{ 
              background: `linear-gradient(45deg, var(--bs-body-bg), ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)'})`,
              backdropFilter: 'blur(10px)',
              border: `2px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
              transition: 'all 0.3s ease',
              cursor: 'pointer'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-5px) scale(1.02)'
              e.currentTarget.style.boxShadow = '0 15px 35px rgba(0,0,0,0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0) scale(1)'
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(0,0,0,0.1)'
            }}
          >
            <div className="d-flex align-items-center flex-grow-1">
              <div 
                className="rounded-circle d-flex justify-content-center align-items-center me-4 shadow-sm"
                style={{ 
                  width: '60px', 
                  height: '60px', 
                  background: 'linear-gradient(45deg, var(--bs-success), var(--bs-teal))'
                }}
              >
                <i className="fas fa-code text-white" style={{ fontSize: '1.5rem' }}></i>
              </div>
              <div className="flex-grow-1 pe-3">
                <h5 className="mb-2 fw-semibold" style={{ color: isDark ? 'white' : 'black' }}>
                  Build Your First Contract
                </h5>
                <p className="mb-0" style={{ color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)' }}>
                  Get started with a typical and well used smart contract on Ethereum
                </p>
              </div>
            </div>
            <button 
              className="btn btn-success btn-lg px-4 py-3 fw-semibold shadow-sm" 
              onClick={handleGetStarted}
              style={{ 
                borderRadius: '12px',
                background: 'linear-gradient(45deg, var(--bs-success), var(--bs-teal))',
                border: 'none'
              }}
            >
              <i className="fas fa-code me-2"></i>
              Build
            </button>
          </div>
        </div>

        {/* Bottom decoration with animation */}
        <div className="text-center mt-3">
          <div className="d-flex justify-content-center align-items-center gap-2">
            <div 
              className="rounded-circle shadow-sm" 
              style={{ 
                width: '8px', 
                height: '8px', 
                background: 'var(--bs-primary)',
                animation: 'pulse 2s infinite'
              }}
            ></div>
            <div 
              className="rounded-circle shadow-sm" 
              style={{ 
                width: '8px', 
                height: '8px', 
                background: 'var(--bs-info)',
                animation: 'pulse 2s infinite 0.5s'
              }}
            ></div>
            <div 
              className="rounded-circle shadow-sm" 
              style={{ 
                width: '8px', 
                height: '8px', 
                background: 'var(--bs-success)',
                animation: 'pulse 2s infinite 1s'
              }}
            ></div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); }
        }
      `}</style>
    </div>
  )
}

export default FirstTimeUserCard