import React, { useEffect, useRef } from 'react';
import axios from 'axios';
import { endpointUrls } from '@remix-endpoints-helper';

interface GitHubCallbackProps {
  tokenExchangeEndpoint?: string;
}

export const GitHubCallback: React.FC<GitHubCallbackProps> = ({
  tokenExchangeEndpoint = `${endpointUrls.gitHubLoginProxy}/login/oauth/access_token`
}) => {
  const hasRun = useRef(false);

  const extractCode = (): string | null => {
    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get('code')) return searchParams.get('code')

    // If not found in search, check the hash
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    return hashParams.get('code')
  }

  const exchangeToken = async () => {
    const code = extractCode()

    // Clean up URL
    window.history.replaceState({}, document.title, window.location.pathname)

    if (!code) {
      console.warn('Missing authorization code')
      window.opener?.postMessage({
        type: 'GITHUB_AUTH_FAILURE',
        error: 'missing code'
      }, window.location.origin)
      return
    }

    try {
      const { data } = await axios.post(`${tokenExchangeEndpoint}?_=${Date.now()}`, {
        code,
        redirect_uri: window.location.origin + '/auth/github/callback'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      })

      if (data.access_token) {
        window.opener?.postMessage({
          type: 'GITHUB_AUTH_SUCCESS',
          token: data.access_token
        }, window.location.origin)
      } else {
        window.opener?.postMessage({
          type: 'GITHUB_AUTH_FAILURE',
          error: 'no access token'
        }, window.location.origin)
      }
    } catch (error) {
      console.error('Token exchange error:', error);
      window.opener?.postMessage({
        type: 'GITHUB_AUTH_FAILURE',
        error: error instanceof Error ? error.message : String(error)
      }, window.location.origin)
    }
  }

  useEffect(() => {
    if (!hasRun.current) {
      hasRun.current = true;
      exchangeToken();
    }
  }, []);

  return (
    <div className="auth-callback">
      <div className="text-center">
        <i className="fas fa-spinner fa-spin fa-2x"></i>
        <p>Completing GitHub login...</p>
      </div>
    </div>
  )
}
