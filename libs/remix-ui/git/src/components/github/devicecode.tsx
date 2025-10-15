import React, { useEffect, useRef, useState, useCallback, useContext } from "react";
import { gitActionsContext, pluginActionsContext } from "../../state/context";
import { gitPluginContext } from "../gitui";
import axios from "axios";
import { CopyToClipboard } from "@remix-ui/clipboard";
import { endpointUrls } from "@remix-endpoints-helper";
import isElectron from "is-electron";
import { startGitHubLogin, getDeviceCodeFromGitHub, connectWithDeviceCode, disconnectFromGitHub } from "../../lib/gitLoginActions";
import { TrackingContext } from '@remix-ide/tracking';
import { GitEvent, MatomoEvent } from '@remix-api';

export const ConnectToGitHub = () => {
  const context = React.useContext(gitPluginContext)
  const actions = React.useContext(gitActionsContext)
  const pluginActions = React.useContext(pluginActionsContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const [gitHubResponse, setGitHubResponse] = React.useState<any>(null)
  const [authorized, setAuthorized] = React.useState<boolean>(false)
  const [popupError, setPopupError] = useState(false)
  const [desktopIsLoading, setDesktopIsLoading] = React.useState<boolean>(false)

  // Component-specific tracker with default GitEvent type
  const trackMatomoEvent = <T extends MatomoEvent = GitEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }

  const popupRef = useRef<Window | null>(null)

  const openPopupLogin = useCallback(async () => {
    trackMatomoEvent({
      category: 'git',
      action: 'CONNECT_TO_GITHUB',
      name: 'BUTTON_CLICK',
      isClick: true
    })
    try {
      if (isElectron()) {
        setDesktopIsLoading(true)
      }
      await startGitHubLogin()
      if (!isElectron()) {
        setAuthorized(true)
      }
    } catch (error) {
      console.error('GitHub login failed:', error)
      if (isElectron()) {
        setDesktopIsLoading(false)
      } else {
        setPopupError(true)
        // Fallback to device code flow
        await handleGetDeviceCode()
      }
    }
  }, [])

  const handleGetDeviceCode = async () => {
    setDesktopIsLoading(false)
    setPopupError(false)
    setAuthorized(false)

    try {
      const githubResponse = await getDeviceCodeFromGitHub()
      setGitHubResponse(githubResponse)
    } catch (error) {
      console.error('Failed to get device code:', error)
      trackMatomoEvent({
        category: 'git',
        action: 'CONNECT_TO_GITHUB',
        name: 'DEVICE_CODE_FAIL',
        isClick: true
      })
    }
  }

  const connectApp = async () => {
    try {
      await connectWithDeviceCode(gitHubResponse.device_code)
      setAuthorized(true)
    } catch (error) {
      console.error('Failed to connect with device code:', error)
      trackMatomoEvent({
        category: 'git',
        action: 'CONNECT_TO_GITHUB',
        name: 'DEVICE_CODE_FAIL',
        isClick: true
      })
    }
  }

  useEffect(() => {
    if (context.gitHubUser && context.gitHubUser.isConnected) {
      setDesktopIsLoading(false)
    }
  },[context.gitHubUser])

  const handleDisconnect = async () => {
    try {
      await disconnectFromGitHub()
      setAuthorized(false)
      setGitHubResponse(null)
    } catch (error) {
      console.error('Failed to disconnect from GitHub:', error)
    }
  }

  return (
    <>
      {(context.gitHubUser && context.gitHubUser.isConnected) ? null : <>
        <label className="text-uppercase">Connect to GitHub</label>
        <button className='btn btn-secondary mt-1 w-100' onClick={openPopupLogin}>
          <i className="fab fa-github me-1"></i>Login with GitHub
        </button>
        {popupError && !gitHubResponse && !authorized && (
          <div className="alert alert-warning mt-2" role="alert">
            GitHub login failed. You can continue using another method.
            <button className='btn btn-outline-primary btn-sm mt-2 w-100' onClick={handleGetDeviceCode}>
              Use another method
            </button>
          </div>
        )}
        {desktopIsLoading && <div className="text-center mt-2">
          <i className="fas fa-spinner fa-spin fa-2x mt-1"></i>
          <div className="alert alert-warning mt-2" role="alert">
            In case of issues, you can try another method.
            <button className='btn btn-outline-primary btn-sm mt-2 w-100' onClick={handleGetDeviceCode}>
              Use another method
            </button>
          </div>
        </div>
        }
      </>}
      {gitHubResponse && !authorized &&
        <div className="pt-2">

          Step 1: Copy this code:
          <div className="input-group text-secondary mb-0 h6">
            <input disabled type="text" className="form-control" value={gitHubResponse.user_code} />
            <div className="input-group-append">
              <CopyToClipboard callback={() => trackMatomoEvent({
                category: 'git',
                action: 'GITHUB_DEVICE_CODE_FLOW',
                name: 'COPY_CODE',
                isClick: true
              })} content={gitHubResponse.user_code} data-id='copyToClipboardCopyIcon' className='far fa-copy ms-1 p-2 mt-1' direction={"top"} />
            </div>
          </div>
          <br></br>
          Step 2: Authorize the app here
          <br></br><a target="_blank" href={gitHubResponse.verification_uri}>{gitHubResponse.verification_uri}</a>
          <br /><br></br>
          Step 3: When you are done, click on the button below:
          <button className='btn btn-primary mt-1 w-100' onClick={async () => {
            connectApp()
          }}>Connect</button>
        </div>
      }
      {
        (context.gitHubUser && context.gitHubUser.isConnected) ?
          <div className="pt-2">
            <button data-id='disconnect-github' className='btn btn-primary mt-1 w-100' onClick={async () => {
              handleDisconnect()
            }}>Disconnect</button>
          </div> : null
      }
      {
        (context.gitHubUser && context.gitHubUser.isConnected) ?
          <div className="pt-2">

            <div className="mb-1" data-id={`connected-as-${context.gitHubUser.login}`}>Connected as {context.gitHubUser.login}</div>
            <div className="row">
              {context.gitHubUser.avatar_url ?
                <div className="col-6">
                  <img data-id={`connected-img-${context.gitHubUser.login}`} src={context.gitHubUser.avatar_url} className="w-100" />
                </div> : null}
            </div>
            <div className="row mt-2">
              <div className="col-6">
                {context.gitHubUser.html_url ? <>
                  <label className="text-uppercase">user on github:</label>
                  <a data-id={`connected-link-${context.gitHubUser.login}`} href={context.gitHubUser.html_url}>{context.gitHubUser.html_url}</a> </> : null}
                {context.userEmails && context.userEmails.length > 0 ? <>
                  <label className="text-uppercase mt-2">email:</label>
                  {context.userEmails && context.userEmails.filter((email: any) => email.primary).map((email: any) => {
                    return <span key={email.email}><br></br>{email.email}</span>
                  })}</> : null}
              </div>
            </div>

          </div> : null
      }

    </>)
}
