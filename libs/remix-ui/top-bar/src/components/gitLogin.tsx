/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useContext, useCallback, useState } from 'react'
import { Button, ButtonGroup, Dropdown } from 'react-bootstrap'
import { CustomTopbarMenu } from '@remix-ui/helper'
import { AppContext } from '@remix-ui/app'
import { MatomoEvent, TopbarEvent } from '@remix-api'
import { TrackingContext } from '@remix-ide/tracking'

interface GitHubLoginProps {
  cloneGitRepository: () => void
  logOutOfGithub: () => void
  loginWithGitHub: () => Promise<void>
  publishToGist: () => void
  theme?: 'light' | 'dark'
}

export const GitHubLogin: React.FC<GitHubLoginProps> = ({
  cloneGitRepository,
  logOutOfGithub,
  publishToGist,
  loginWithGitHub,
  theme = 'dark'
}) => {
  const appContext = useContext(AppContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = TopbarEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  // Get the GitHub user state from app context
  const gitHubUser = appContext?.appState?.gitHubUser
  const isConnected = gitHubUser?.isConnected

  // Persist minimal GH identity for billing callbacks
  if (isConnected && gitHubUser?.login && gitHubUser?.id) {
    try {
      window.localStorage.setItem('gh_login', gitHubUser.login)
      window.localStorage.setItem('gh_id', String(gitHubUser.id))
    } catch { }
  }

  // Simple login handler that delegates to the prop function
  const handleLogin = useCallback(async () => {
    try {
      await loginWithGitHub()
    } catch (error) {
      console.error('Failed to start GitHub login:', error)
    }
  }, [loginWithGitHub])
  const [buttonHoverTheme, setButtonHoverTheme] = useState('')
  return (
    <Dropdown
      as={ButtonGroup}
      align="end"
    >
      <Button
        className="btn btn-topbar btn-sm border d-flex flex-row flex-nowrap align-items-center justify-content-between github-login"
        variant={null}
        data-id="github-dropdown-toggle-login"
        onClick={isConnected ? undefined : handleLogin}
        disabled={isConnected}
        style={{
          backgroundColor: buttonHoverTheme
        }}
        onMouseOver={() => setButtonHoverTheme(prev => theme === 'dark' ? '#2b2c3f' : '#f9fafe')}
        onMouseOut={() => setButtonHoverTheme('')}
      >
        {isConnected ? (
          <div className="d-flex flex-row flex-nowrap align-items-center justify-content-center">
            <i className="fab fa-github me-1"></i>
            <span>{gitHubUser.login}</span>
            <img src={gitHubUser.avatar_url} alt="Avatar" className="ms-1" style={{
              width: '25px',
              height: '25px',
              borderRadius: '50%',
              objectFit: 'cover',
            }} />
          </div>
        ) : (
          <div className="d-flex flex-row flex-nowrap align-items-center justify-content-center">
            <i className="fab fa-github me-1"></i>
            <span className="d-flex flex-row flex-nowrap">Connect to GitHub</span>
          </div>
        )}
      </Button>

      <Dropdown.Toggle
        as={Button}
        variant="outline-secondary"
        className="btn-topbar btn-sm"
        data-id="github-dropdown-toggle"
        style={{
          backgroundColor: buttonHoverTheme
        }}
        onMouseOver={() => setButtonHoverTheme(prev => theme === 'dark' ? '#2b2c3f' : '#f9fafe')}
        onMouseOut={() => setButtonHoverTheme('')}
      >
      </Dropdown.Toggle>
      <Dropdown.Menu
        as={CustomTopbarMenu}
        className="custom-dropdown-items w-75 text-decoration-none bg-light"
      >
        <Dropdown.Item
          data-id="github-dropdown-item-clone"
          onClick={cloneGitRepository}
        >
          <i className="fab fa-github me-2"></i>
          <span>Clone</span>
        </Dropdown.Item>
        {isConnected && (
          <>
            <Dropdown.Item
              data-id="github-dropdown-item-publish-to-gist"
              onClick={async () => {
                await publishToGist()
                trackMatomoEvent({ category: 'topbar', action: 'GIT', name: 'publishToGist', isClick: true })
              }}
            >
              <i className="fab fa-github me-2"></i>
              <span>Publish to Gist</span>
            </Dropdown.Item>
            <Dropdown.Divider style={{ pointerEvents: 'none' }} className="border" />
            <Dropdown.Item
              data-id="github-dropdown-item-disconnect"
              onClick={async () => {
                await logOutOfGithub()
                try {
                  window.localStorage.removeItem('gh_login')
                  window.localStorage.removeItem('gh_id')
                } catch { }
                trackMatomoEvent({ category: 'topbar', action: 'GIT', name: 'logout', isClick: true })
              }}
              className="text-danger"
            >
              <i className="fas fa-sign-out-alt me-2"></i>
              <span>Disconnect</span>
            </Dropdown.Item>
          </>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
};
