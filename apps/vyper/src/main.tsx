import React from 'react'
import * as ReactDOM from 'react-dom'
import { createRoot } from 'react-dom/client';
import { initEndpoints } from '@remix-endpoints-helper'
import App from './app/app'

const container = document.getElementById('root');

if (container) {
  const root = createRoot(container)
  // Iframe plugins have their own module instance of @remix-endpoints-helper,
  // so the host's initEndpoints() call does not reach them. Run discovery here
  // before rendering so endpointUrls.* reflects the deployed config.
  initEndpoints()
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[Vyper] initEndpoints failed, falling back to defaults:', err)
    })
    .finally(() => {
      root.render(<App />)
    })
}

