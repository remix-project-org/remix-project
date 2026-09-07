/**
 * App Renderer
 *
 * Handles rendering the appropriate React component tree based on routing
 */

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { TrackingProvider } from '../contexts/TrackingContext';
import { Preload } from '../components/preload';
import { GitHubPopupCallback } from '../pages/GitHubPopupCallback';
import { MigrationConfirmed } from '../pages/MigrationConfirmed';
import { isConfirmingMigration } from './migrationConfirm';
import { TrackingFunction } from './TrackingFunction';

export interface RenderAppOptions {
  trackingFunction: TrackingFunction;
}

/**
 * Render the appropriate React app component based on current URL
 */
export function renderApp(options: RenderAppOptions): Root | null {
  const { trackingFunction } = options;

  const container = document.getElementById('root');
  if (!container) {
    console.error('Root container not found');
    return null;
  }

  const root = createRoot(container);

  if (window.location.hash.includes('source=github')) {
    root.render(
      <TrackingProvider trackingFunction={trackingFunction}>
        <GitHubPopupCallback />
      </TrackingProvider>
    );
  } else if (isConfirmingMigration()) {
    // The user is only passing through to confirm they have moved, so the IDE
    // never needs to start.
    root.render(
      <TrackingProvider trackingFunction={trackingFunction}>
        <MigrationConfirmed
          onTrack={(action, name) =>
            trackingFunction?.({ category: 'App', action, name, isClick: false } as any)
          }
        />
      </TrackingProvider>
    );
  } else {
    root.render(
      <TrackingProvider trackingFunction={trackingFunction}>
        <Preload root={root} trackingFunction={trackingFunction} />
      </TrackingProvider>
    );
  }

  return root;
}