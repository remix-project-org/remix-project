import React, { useContext } from 'react'
import { HomeTabEvent, MatomoEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'
import { FormattedMessage } from 'react-intl'

interface FirstTimeUserCardProps {
  plugin: any
}

export const FirstTimeUserCard: React.FC<FirstTimeUserCardProps> = ({ plugin }) => {
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)

  const trackMatomoEvent = <T extends MatomoEvent = HomeTabEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  const handleExplainEthereum = async () => {
    trackMatomoEvent({ category: 'hometab', action: 'explainEthereum', name: 'Explain Ethereum importance', isClick: true })
    await plugin.call('manager', 'activatePlugin', 'remixaiassistant')
    await plugin.call('menuicons', 'select', 'remixaiassistant')
    await plugin.call('remixaiassistant', 'newConversation')
    setTimeout(() => {
      plugin.call('remixaiassistant', 'chatPipe', `Why Ethereum and decentralized applications are important for the future of technology and society. Give me a concise and clear explanation. Provide use cases. Propose some areas of discussion, then stop and let me ask you more questions about it.`, false, { source: 'home-tab', presetId: 'learn-ethereum' })
    }, 200)
  }

  const handleGetStarted = async () => {
    trackMatomoEvent({ category: 'hometab', action: 'getStartedContract', name: 'Get started with contract', isClick: true })
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
      await new Promise((res) => setTimeout(() => res({}), 500))
      await plugin.call('fileManager', 'open', 'contracts/MyToken.sol')
      plugin.call('remixaiassistant', 'chatPipe', `an ERC20 token workspace has been created. Compile and Deploy MyToken. Then give precise details for interacting with that contract in Remix. Propose some next steps for me to learn more about it and experiment with it. Then stop and let me ask you more questions.`, false, { source: 'home-tab', presetId: 'erc20-intro' })
    }, 200)
  }

  return (
    <>
      <div className="ht-section-header">
        <span className="ht-section-title">
          <FormattedMessage id="homeTab.newToRemix" defaultMessage="New to Remix" />
        </span>
      </div>

      <button className="ht-row ht-row-cta" onClick={handleExplainEthereum}>
        <span className="ht-row-icon ht-row-icon-cta"><i className="fas fa-lightbulb"></i></span>
        <span className="ht-row-text">
          <strong><FormattedMessage id="home.learnFoundationTitle" /></strong>
          <small><FormattedMessage id="home.learnFoundationDesc" /></small>
        </span>
      </button>

      <button className="ht-row" onClick={handleGetStarted}>
        <span className="ht-row-icon"><i className="fas fa-code"></i></span>
        <span className="ht-row-text">
          <strong><FormattedMessage id="home.buildFirstContractTitle" /></strong>
          <small><FormattedMessage id="home.buildFirstContractDesc" /></small>
        </span>
      </button>
    </>
  )
}

export default FirstTimeUserCard
