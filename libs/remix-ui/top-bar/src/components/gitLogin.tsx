/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useContext, useCallback } from 'react'
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
}

export const GitHubLogin: React.FC<GitHubLoginProps> = ({
  cloneGitRepository,
  logOutOfGithub,
  publishToGist,
  loginWithGitHub
}) => {
  const appContext = useContext(AppContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = TopbarEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  // Get the GitHub user state from app context
  const gitHubUser = appContext?.appState?.gitHubUser
  const isConnected = gitHubUser?.isConnected

  // Simple login handler that delegates to the prop function
  const handleLogin = useCallback(async () => {
    try {
      await loginWithGitHub()
    } catch (error) {
      console.error('Failed to start GitHub login:', error)
    }
  }, [loginWithGitHub])

  return (
    <Dropdown
      as={ButtonGroup}
      align="end"
    >
      <Button
        className="btn btn-topbar btn-sm border d-flex flex-nowrap align-items-center justify-content-between github-login"
        variant={ null }
        data-id="github-dropdown-toggle-login"
        onClick={isConnected ? undefined : handleLogin}
        disabled={isConnected}
      >
        {isConnected ? (
          <div className="d-flex flex-nowrap align-items-center flex-row justify-content-center">
            <i className="fab fa-github me-1"></i>
            <span>{gitHubUser.login}</span>
            <img src={gitHubUser.avatar_url} alt="Avatar" className="ms-1" style={{
              width: '25px',
              height: '25px',
              borderRadius: '50%',
              objectFit: 'cover',
            }}/>
          </div>
        ) : (
          <div className="d-flex flex-nowrap align-items-center flex-row justify-content-center">
            <i className="fab fa-github me-1"></i>
            <span>Login with GitHub</span>
          </div>
        )}
      </Button>

      <Dropdown.Toggle
        as={Button}
        variant="outline-secondary"
        className="btn-topbar btn-sm"
        data-id="github-dropdown-toggle"
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
