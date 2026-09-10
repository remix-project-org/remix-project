// eslint-disable-next-line no-use-before-define
import React from 'react'
import './index.css'
import isElectron from 'is-electron'
import { MatomoManager } from './app/matomo/MatomoManager'
import { autoInitializeMatomo } from './app/matomo/MatomoAutoInit'
import { createMatomoConfig } from './app/matomo/MatomoConfig'
import { createTrackingFunction } from './app/utils/TrackingFunction'
import { setupThemeAndLocale } from './app/utils/AppSetup'
import { renderApp } from './app/utils/AppRenderer'
import { redirectConfirmedVisitor } from './app/utils/migrationConfirm'

; (async function () {
  // Someone who confirmed the move leaves before anything else starts, and in
  // particular before Matomo initialises: its initial page view would record
  // this visit on the origin they are leaving, and the destination counts them
  // again under a new visitor id. Reads localStorage only.
  // The OAuth popup runs on whichever origin opened it, so leave it alone.
  if (!isElectron() && !window.location.hash.includes('source=github') && redirectConfirmedVisitor()) return

  // Create Matomo configuration
  const matomoConfig = createMatomoConfig();
  const matomoManager = new MatomoManager(matomoConfig);
  window._matomoManagerInstance = matomoManager;

  // Setup config and auto-initialize Matomo if we have existing settings
  await autoInitializeMatomo({
    matomoManager,
    debug: false
  });

  // Setup theme and locale
  setupThemeAndLocale();

  // Create tracking function
  const trackingFunction = createTrackingFunction(matomoManager);

  // Render the app
  renderApp({ trackingFunction });
})()
