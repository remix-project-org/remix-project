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

  const handleExplainEthereum = async () => {
    trackMatomoEvent({
      category: 'hometab',
      action: 'explainEthereum',
      name: 'Explain Ethereum importance',
      isClick: true
    })
    await plugin.call('manager', 'activatePlugin', 'remixaiassistant')
    await plugin.call('menuicons', 'select', 'remixaiassistant')
    await plugin.call('remixaiassistant', 'newConversation')
    setTimeout(() => {
      plugin.call('remixaiassistant', 'chatPipe', `Why Ethereum and decentralized applications are important for the future of technology and society. Give me a concise and clear explanation. Provide use cases. Propose some areas of discussion, then stop and let me ask you more questions about it.`)
    }, 200)
  }

  const handleGetStarted = async () => {
    trackMatomoEvent({
      category: 'hometab',
      action: 'getStartedContract',
      name: 'Get started with contract',
      isClick: true
    })
    const params = {
      optimize: false,
      evmVersion: 'osaka',
      language: 'Solidity',
      version: '0.8.34+commit.80d5c536'
    }
    await plugin.call('solidity', 'setCompilerConfig', params)
    await plugin.call('manager', 'activatePlugin', 'remixaiassistant')
    await plugin.call('menuicons', 'select', 'remixaiassistant')
    await plugin.call('remixaiassistant', 'newConversation')
    setTimeout(async () => {
      if (!await plugin.call('filePanel', 'workspaceExists', 'Introduction to ERC20 token')) await plugin.call('filePanel', 'createWorkspace', 'Introduction to ERC20 token', 'ozerc20')
      await plugin.call('filePanel', 'switchToWorkspace', { name: 'Introduction to ERC20 token', isLocalHost: false })

      plugin.call('notification', 'toast', 'Creating a new workspace and start building...')
      await new Promise((res) => setTimeout(() => res({}), 500)) // wait for the workspace to actually be created
      await plugin.call('fileManager', 'open', 'contracts/MyToken.sol')
      plugin.call('remixaiassistant', 'chatPipe', `an ERC20 token workspace has been created. Compile and Deploy MyToken. Then give precise details for interacting with that contract in Remix. Propose some next steps for me to learn more about it and experiment with it. Then stop and let me ask you more questions.`)
    }, 200)
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
            <FormattedMessage id="homeTab.newToRemix" defaultMessage="First time in Remix? here's what you can do" />
          </h4>
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
              cursor: 'pointer',
              outline: 'none',
              userSelect: 'none'
            }}
            tabIndex={-1}
            onClick={handleExplainEthereum}
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
                className="d-flex justify-content-center align-items-center me-3 shadow-sm"
                style={{
                  width: '20px'
                }}
              >
                <i className="fas fa-lightbulb text-primary" style={{ color: isDark ? '#64c4ff' : 'var(--bs-primary)', fontSize: '1.2rem' }}></i>
              </div>
              <div className="flex-grow-1 pe-3">
                <h5 className="mb-2" style={{ color: isDark ? 'white' : 'black' }}>
                  <FormattedMessage id="home.learnFoundationTitle" />
                </h5>
                <p className="mb-0" style={{ fontSize: '0.875rem', color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)' }}>
                  <FormattedMessage id="home.learnFoundationDesc" />
                </p>
              </div>
            </div>
          </div>

          <div
            className="p-3 rounded-4 d-flex align-items-center justify-content-between shadow-sm position-relative overflow-hidden"
            style={{
              background: `linear-gradient(45deg, var(--bs-body-bg), ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)'})`,
              backdropFilter: 'blur(10px)',
              border: `2px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`,
              transition: 'all 0.3s ease',
              cursor: 'pointer',
              outline: 'none',
              userSelect: 'none'
            }}
            tabIndex={-1}
            onClick={handleGetStarted}
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
                className="d-flex justify-content-center align-items-center me-3 shadow-sm"
                style={{
                  width: '20px'
                }}
              >
                <i className="fas fa-code text-primary" style={{ color: isDark ? '#64c4ff' : 'var(--bs-primary)', fontSize: '1.2rem' }}></i>
              </div>
              <div className="flex-grow-1 pe-3">
                <h5 className="mb-2" style={{ color: isDark ? 'white' : 'black' }}>
                  <FormattedMessage id="home.buildFirstContractTitle" />
                </h5>
                <p className="mb-0" style={{ fontSize: '0.875rem', color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)' }}>
                  <FormattedMessage id="home.buildFirstContractDesc" />
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FirstTimeUserCard
