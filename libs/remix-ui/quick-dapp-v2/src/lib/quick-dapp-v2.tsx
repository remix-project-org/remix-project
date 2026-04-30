import React, { useEffect, useReducer, useState, useMemo, useRef, useContext } from 'react';
import { LoginModal } from '@remix-ui/login';
import { IntlProvider } from 'react-intl';
import CreateInstance from './components/CreateInstance';
import EditHtmlTemplate from './components/EditHtmlTemplate';
import LoadingScreen from './components/LoadingScreen';
import Dashboard from './components/Dashboard';
import { appInitialState, appReducer, AppAction } from './reducers';
import { AppContext } from './contexts';
import { AppContext as RemixAppContext, useAuth } from '@remix-ui/app';
import { DappManager } from './utils/DappManager';
import { QuickDappV2PluginApi, DappConfig } from './types';
import './App.css';

import { getNetworkName } from './utils/networks';

export interface RemixUiQuickDappV2Props {
  plugin: QuickDappV2PluginApi;
}

export function RemixUiQuickDappV2({ plugin }: RemixUiQuickDappV2Props): JSX.Element {
  const [locale, setLocale] = useState<{ code: string; messages: any }>({
    code: 'en',
    messages: null,
  });
  const remixAppContext = useContext(RemixAppContext)
  const { isAuthenticated, features } = useAuth()
  const [appState, dispatch] = useReducer(appReducer, appInitialState);
  const dappsRef = useRef(appState.dapps);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const activeDappRef = useRef(appState.activeDapp);

  // Permission gating
  const hasAccess = features?.['dapp:quickdapp']
  const quickdappEnabled = remixAppContext?.appConfig?.['quickdapp.enabled']
  const quickdappEnabledRef = useRef(quickdappEnabled)
  quickdappEnabledRef.current = quickdappEnabled
  const [showLoginModal, setShowLoginModal] = useState(false);

  // DappManager now receives the plugin from props instead of a singleton
  const dappManager = useMemo(() => new DappManager(plugin as any), [plugin]);
  const dappManagerRef = useRef(dappManager);
  // Track workspaces being deleted by us to prevent double SET_DAPPS dispatch
  const deletingWorkspacesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    dappsRef.current = appState.dapps;
  }, [appState.dapps, appState.view]);

  useEffect(() => {
    activeDappRef.current = appState.activeDapp;
  }, [appState]);

  useEffect(() => {
    dappManagerRef.current = dappManager;
  }, [dappManager]);

  useEffect(() => {
    if (!plugin) return;

    const handleCreateDapp = async (payload: any) => {
      if (quickdappEnabledRef.current === false) {
        plugin.call('notification', 'toast', 'QuickDapp is not available yet.')
        return
      }
      try {
        console.log('[QuickDapp] handleCreateDapp called', { contractName: payload.contractName || payload.name });
        const contractData = {
          address: payload.address,
          name: payload.contractName || payload.name || 'Untitled',
          abi: payload.abi,
          chainId: payload.chainId,
          networkName: getNetworkName(payload.chainId),
          sourceFilePath: payload.sourceFilePath || ''
        };

        const newDapp = await dappManager.createDapp(
          contractData.name,
          contractData,
          payload.isBaseMiniApp || false
        );

        dispatch({ type: 'SET_ACTIVE_DAPP', payload: newDapp });
        dispatch({ type: 'SET_DAPPS', payload: [newDapp, ...dappsRef.current]});
        dispatch({ type: 'SET_DAPP_PROCESSING', payload: { slug: newDapp.slug, isProcessing: true } });
        dispatch({ type: 'SET_VIEW', payload: 'dashboard' });

        console.log('[QuickDapp] handleCreateDapp done, workspace:', newDapp.slug);
        // DApp generation is handled by AI Assistant via DAppGeneratorHandler MCP tool

      } catch (error: any) {
        console.error('[QuickDapp] handleCreateDapp failed:', error);
        plugin.call('notification', 'toast', `Failed to create DApp: ${error.message}`);
      }
    };

    const handleOpenDapp = async (slug: string) => {
      const dapp = dappsRef.current.find((d: DappConfig) => d.slug === slug || d.workspaceName === slug);
      if (dapp) {
        dispatch({ type: 'SET_ACTIVE_DAPP', payload: dapp });
        dispatch({ type: 'SET_VIEW', payload: 'editor' });
      }
    };

    const handleStartAiLoading = () => {
      dispatch({ type: 'SET_AI_LOADING', payload: true });
    };

    const handleDappGenerated = async (data: any) => {
      console.log('[QuickDapp] handleDappGenerated', { slug: data?.slug, isUpdate: data?.isUpdate });
      if (!data.slug) {
        console.log('[QuickDapp] handleDappGenerated: missing slug');
        return;
      }

      const workspaceName = data.slug;

      try {
        console.log('[QuickDapp] Refreshing dashboard for:', workspaceName);

        // Files already saved by handler — refresh dashboard state
        const freshDapps = await dappManagerRef.current.getDapps();
        console.log('[QuickDapp] Fetched', freshDapps.length, 'dapps from disk');
        dispatch({ type: 'SET_DAPPS', payload: freshDapps });

        const thisDapp = freshDapps.find((d: DappConfig) => d.slug === workspaceName || d.workspaceName === workspaceName);
        if (thisDapp) {
          console.log('[QuickDapp] Found matching dapp:', thisDapp.name, thisDapp.slug);
          dispatch({ type: 'SET_ACTIVE_DAPP', payload: thisDapp });
        } else {
          console.log('[QuickDapp] No matching dapp found for workspace:', workspaceName);
        }

        dispatch({ type: 'SET_DAPP_PROCESSING', payload: { slug: workspaceName, isProcessing: false } });
        dispatch({ type: 'SET_AI_LOADING', payload: false });
        dispatch({ type: 'SET_GENERATION_PROGRESS', payload: null });

        // Reset status from 'creating'/'updating' → 'created'
        console.log('[QuickDapp] Resetting config status to created for:', workspaceName);
        try {
          await dappManagerRef.current.updateDappConfig(workspaceName, {
            status: 'created',
            processingStartedAt: null
          });
        } catch (e) {
          console.warn('[QuickDapp] Failed to reset config status:', e);
        }

        if (!data.isUpdate) {
          plugin.call('notification', 'toast', `DApp '${thisDapp?.name || workspaceName}' created successfully!`);
        } else {
          plugin.call('notification', 'toast', 'DApp code updated successfully.');
        }
        console.log('[QuickDapp] handleDappGenerated done');
      } catch (e: any) {
        console.error('[QuickDapp] Error in handleDappGenerated:', e);
        dispatch({ type: 'SET_DAPP_PROCESSING', payload: { slug: workspaceName, isProcessing: false } });
      }
    };

    const handleDappGenerationError = (data: any) => {
      console.error('[QuickDapp] Received dappGenerationError event:', data);
      dispatch({ type: 'SET_AI_LOADING', payload: false });
      dispatch({ type: 'SET_GENERATION_PROGRESS', payload: null });

      const slug = data?.slug;
      if (slug) {
        dappManager.updateDappConfig(slug, { status: 'created', processingStartedAt: null });
        dispatch({ type: 'SET_DAPP_PROCESSING', payload: { slug, isProcessing: false } });
      }

      plugin.call('notification', 'toast', `Generation Failed: ${data?.error || 'Unknown error'}`);
    };

    const handleDappUpdateStart = async (data: any) => {
      if (data?.slug) {
        await dappManager.updateDappConfig(data.slug, {
          status: 'updating',
          processingStartedAt: Date.now()
        });
        dispatch({ type: 'SET_DAPP_PROCESSING', payload: { slug: data.slug, isProcessing: true } });
      }
    };

    const handleWorkspaceDeleted = (workspaceName: string) => {
      // Skip if we triggered this deletion ourselves (prevents double dispatch)
      if (deletingWorkspacesRef.current.has(workspaceName)) return;
      const filtered = dappsRef.current.filter((d: any) => d.workspaceName !== workspaceName);
      dispatch({ type: 'SET_DAPPS', payload: filtered });
    };

    const generatedFilesRef: string[] = [];
    let currentSlugRef = '';
    let currentWritingFile = '';
    const handleGenerationProgress = async (data: any) => {
      // Preserve slug from preparation across all subsequent events
      if (data.slug) {
        currentSlugRef = data.slug;
      }
      const enrichedData = { ...data, slug: data.slug || currentSlugRef };

      if (data.status === 'preparing') {
        generatedFilesRef.length = 0;
        currentWritingFile = '';
        dispatch({ type: 'SET_GENERATION_PROGRESS', payload: enrichedData });
        // Also set processing state so the DappCard shows the spinner overlay
        if (enrichedData.slug) {
          console.log('[QuickDapp] generationProgress preparing — refreshing dapps and setting processing=true for:', enrichedData.slug);
          // Refresh dapp list from disk so the new card appears in dashboard
          try {
            const freshDapps = await dappManagerRef.current.getDapps();
            dispatch({ type: 'SET_DAPPS', payload: freshDapps });
          } catch (e) {
            console.warn('[QuickDapp] Failed to refresh dapps on preparing:', e);
          }
          dispatch({ type: 'SET_DAPP_PROCESSING', payload: { slug: enrichedData.slug, isProcessing: true } });
          dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
        }
      } else if (data.status === 'generating_file' && data.filename) {
        // Previous file is now done — move it to generatedFiles
        if (currentWritingFile && !generatedFilesRef.includes(currentWritingFile)) {
          generatedFilesRef.push(currentWritingFile);
        }
        currentWritingFile = data.filename;
        dispatch({ type: 'SET_GENERATION_PROGRESS', payload: {
          ...enrichedData,
          generatedFiles: [...generatedFilesRef]
        } });
      } else {
        // On parsing/validating/complete — finalize the last writing file
        if (currentWritingFile && !generatedFilesRef.includes(currentWritingFile)) {
          generatedFilesRef.push(currentWritingFile);
          currentWritingFile = '';
        }
        dispatch({ type: 'SET_GENERATION_PROGRESS', payload: {
          ...enrichedData,
          generatedFiles: [...generatedFilesRef]
        } });
      }
    };

    plugin.event.on('createDapp', handleCreateDapp);
    plugin.event.on('openDapp', handleOpenDapp);
    plugin.event.on('startAiLoading', handleStartAiLoading);
    plugin.event.on('dappGenerated', handleDappGenerated);
    plugin.event.on('dappGenerationError', handleDappGenerationError);
    plugin.event.on('dappUpdateStart', handleDappUpdateStart);
    plugin.event.on('workspaceDeleted', handleWorkspaceDeleted);
    plugin.event.on('generationProgress', handleGenerationProgress);

    const pending = plugin.consumePendingCreateDapp?.();
    if (pending) {
      if (quickdappEnabledRef.current !== false) {
        handleCreateDapp(pending);
      }
    }

    // Cleanup function to remove event listeners
    return () => {
      plugin.event.off('createDapp', handleCreateDapp);
      plugin.event.off('openDapp', handleOpenDapp);
      plugin.event.off('startAiLoading', handleStartAiLoading);
      plugin.event.off('dappGenerated', handleDappGenerated);
      plugin.event.off('dappGenerationError', handleDappGenerationError);
      plugin.event.off('dappUpdateStart', handleDappUpdateStart);
      plugin.event.off('workspaceDeleted', handleWorkspaceDeleted);
      plugin.event.off('generationProgress', handleGenerationProgress);
    };
  }, [plugin, dappManager]);

  // Note: workspaceDeleted handler is now in the main event listener useEffect above

  // App initialization - runs once on mount
  useEffect(() => {
    const initApp = async () => {
      setIsAppLoading(true);

      try {
        // Get locale
        plugin.call('locale', 'currentLocale').then((l: any) => setLocale(l));
        plugin.on('locale', 'localeChanged', (l: any) => setLocale(l));

        // Wait for filePanel to be ready
        for (let i = 0; i < 10; i++) {
          try {
            const currentWs = await plugin.call('filePanel', 'getCurrentWorkspace');
            if (currentWs && currentWs.name) {
              break;
            }
          } catch (e) {}
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        const dapps = (await dappManager.getDapps()) || [];
        dispatch({ type: 'SET_DAPPS', payload: dapps });

        const FIVE_MINUTES = 5 * 60 * 1000;
        const now = Date.now();

        for (const dapp of dapps) {
          const status = dapp.status;
          const processingStartedAt = dapp.processingStartedAt || 0;
          const elapsed = now - processingStartedAt;

          if (status === 'creating' || status === 'updating') {
            // Skip stale entries — MCP handler manages file writes
            console.log('[QuickDapp] Dapp', dapp.slug, 'is in', status, 'state, elapsed:', (elapsed/1000).toFixed(0), 's')

            if (elapsed < FIVE_MINUTES) {
              dispatch({
                type: 'SET_DAPP_PROCESSING',
                payload: { slug: dapp.slug, isProcessing: true }
              });
            } else {
              console.log('[QuickDapp] Dapp', dapp.slug, 'timed out — resetting to created')
              await dappManager.updateDappConfig(dapp.slug, {
                status: 'created',
                processingStartedAt: null
              });
            }
          }
        }

        const refreshedDapps = (await dappManager.getDapps()) || [];
        dispatch({ type: 'SET_DAPPS', payload: refreshedDapps });

        if (refreshedDapps.length > 0) {
          // Check if current workspace matches a DApp workspace
          let autoOpenedDapp = false;
          try {
            const currentWs = await plugin.call('filePanel', 'getCurrentWorkspace');
            if (currentWs?.name) {
              const matchingDapp = refreshedDapps.find((d: any) => d.workspaceName === currentWs.name);
              if (matchingDapp) {
                dispatch({ type: 'SET_ACTIVE_DAPP', payload: matchingDapp });
                dispatch({ type: 'SET_VIEW', payload: 'editor' });
                autoOpenedDapp = true;
              }
            }
          } catch (e) {
            console.warn('[QuickDapp] Could not detect current workspace for auto-open:', e);
          }
          if (!autoOpenedDapp) {
            dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
          }
        } else {
          dispatch({ type: 'SET_VIEW', payload: 'create' });
        }

      } catch (e) {
        dispatch({ type: 'SET_DAPPS', payload: []});
        dispatch({ type: 'SET_VIEW', payload: 'create' });
      } finally {
        setIsAppLoading(false);
        dispatch({ type: 'SET_LOADING', payload: { screen: false } });
      }
    };

    initApp();
  }, [plugin, dappManager]);

  // Handle delete operations
  const handleDeleteOne = async (dapp: DappConfig) => {
    if (!dapp.workspaceName || !dappManager) return;

    try {
      deletingWorkspacesRef.current.add(dapp.workspaceName);
      await dappManager.deleteDapp(dapp.workspaceName);
      const updatedDapps = await dappManager.getDapps();
      dispatch({ type: 'SET_DAPPS', payload: updatedDapps || []});

      if (!updatedDapps || updatedDapps.length === 0) {
        dispatch({ type: 'SET_VIEW', payload: 'create' });
      }

      // Directly clean localStorage.recentWorkspaces
      try {
        const raw = localStorage.getItem('recentWorkspaces');
        if (raw) {
          const recents = JSON.parse(raw);
          const cleaned = recents.filter((entry: any) => {
            const name = typeof entry === 'string' ? entry : entry?.name;
            return name !== dapp.workspaceName;
          });
          localStorage.setItem('recentWorkspaces', JSON.stringify(cleaned));
        }
      } catch {}
    } catch (e) {
      console.error('[QuickDapp] deleteOne failed:', e);
    } finally {
      deletingWorkspacesRef.current.delete(dapp.workspaceName);
    }
  };

  const handleDeleteAll = async () => {
    // Snapshot workspace names before clearing
    const deletedWorkspaceNames = dappsRef.current
      .map(d => d.workspaceName)
      .filter(Boolean);

    try {
      // Collect workspace names to mark as "deleting by us"
      for (const dapp of dappsRef.current) {
        if (dapp.workspaceName) {
          deletingWorkspacesRef.current.add(dapp.workspaceName);
        }
      }
      // Optimistic UI: clear DApp list immediately so user sees instant feedback
      dispatch({ type: 'SET_DAPPS', payload: []});
      dispatch({ type: 'SET_VIEW', payload: 'create' });

      await dappManager.deleteAllDapps();

      // Directly clean localStorage.recentWorkspaces to avoid depending on
      // homeTab's workspaceDeleted event listener (which may not be mounted)
      try {
        const raw = localStorage.getItem('recentWorkspaces');
        if (raw) {
          const recents = JSON.parse(raw);
          const cleaned = recents.filter((entry: any) => {
            const name = typeof entry === 'string' ? entry : entry?.name;
            return !deletedWorkspaceNames.includes(name);
          });
          localStorage.setItem('recentWorkspaces', JSON.stringify(cleaned));
        }
      } catch {}
    } catch (e) {
      console.error('[QuickDapp] deleteAll failed:', e);
      // Recover: re-fetch actual state if deletion failed
      try {
        const remaining = await dappManager.getDapps();
        dispatch({ type: 'SET_DAPPS', payload: remaining || []});
        if (remaining && remaining.length > 0) {
          dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
        }
      } catch {}
    } finally {
      deletingWorkspacesRef.current.clear();
    }
  };

  const renderContent = () => {
    // If quickdapp is disabled via app config, show "Coming Soon"
    const quickdappEnabled = remixAppContext?.appConfig?.['quickdapp.enabled']
    if (quickdappEnabled === false) {
      return (
        <div className="d-flex flex-column justify-content-center align-items-center text-center px-4" style={{ height: '80vh' }}>
          <i className="fas fa-flask fa-3x mb-3 text-info"></i>
          <h4 className="mb-2">Coming Soon</h4>
          <p className="text-muted" style={{ maxWidth: '400px' }}>
            QuickDapp V2 is under development and will be available soon. Stay tuned!
          </p>
        </div>
      );
    }

    // Permission check: show access denied if user doesn't have dapp:quickdapp feature
    if (!hasAccess) {
      return (
        <div className="d-flex flex-column justify-content-center align-items-center text-center px-4" style={{ height: '80vh' }}>
          <i className="fas fa-lock fa-3x mb-3 text-warning"></i>
          <h4 className="mb-2">Access Required</h4>
          {isAuthenticated ? (
            <p className="text-muted" style={{ maxWidth: '400px' }}>
              QuickDapp V2 is currently available to beta testers only. Please contact the Remix team to request access.
            </p>
          ) : (
            <>
              <p className="text-muted" style={{ maxWidth: '400px' }}>
                Please sign in to access QuickDapp V2. This feature is available to beta testers.
              </p>
              <button
                className="btn btn-sm btn-primary mt-2"
                onClick={() => setShowLoginModal(true)}
              >
                Sign In
              </button>
            </>
          )}
        </div>
      );
    }

    if (isAppLoading || !locale.messages) {
      return (
        <div className="d-flex flex-column justify-content-center align-items-center" style={{ height: '80vh' }}>
          <i className="fas fa-spinner fa-spin fa-2x mb-3 text-primary"></i>
          <p className="text-muted">Loading QuickDapp...</p>
        </div>
      );
    }

    if (appState.isAiLoading) {
      return (
        <div className="container-fluid">
          <CreateInstance isAiLoading={true} />
        </div>
      );
    }

    if (!appState.dapps || appState.dapps.length === 0) {
      return (
        <div className="container-fluid pt-3">
          <CreateInstance isAiLoading={appState.isAiLoading} />
        </div>
      );
    }

    switch (appState.view) {
    case 'dashboard':
      return (
        <Dashboard
          dapps={appState.dapps}
          processingState={appState.dappProcessing}
          generationProgress={appState.generationProgress}
          onOpen={async (dapp) => {
            if (dapp.workspaceName) {
              try {
                await dappManager.openDappWorkspace(dapp.workspaceName);
              } catch (e) {
                console.warn('[App] Failed to switch workspace:', e);
              }
            }
            dispatch({ type: 'SET_ACTIVE_DAPP', payload: dapp });
            dispatch({ type: 'SET_VIEW', payload: 'editor' });
          }}
          onCreateNew={() => dispatch({ type: 'SET_VIEW', payload: 'create' })}
          onDeleteOne={(slug: string) => {
            const dapp = appState.dapps.find((d: DappConfig) => d.slug === slug);
            if (dapp) handleDeleteOne(dapp);
          }}
          onDeleteAll={handleDeleteAll}
        />
      );

    case 'editor':
      if (!appState.activeDapp) return null;
      return (
        <div className="d-flex flex-column h-100">
          <div className="flex-grow-1 position-relative" style={{ overflow: 'hidden' }}>
            <div className="container-fluid pt-3 h-100">
              <EditHtmlTemplate />
            </div>
          </div>
        </div>
      );

    case 'create':
    default:
      return (
        <div className="container-fluid pt-3">
          {!appState.isAiLoading && (
            <div className="mb-3 px-2">
              <button
                className="btn btn-sm btn-link text-decoration-none px-0"
                onClick={() => dispatch({ type: 'SET_VIEW', payload: 'dashboard' })}
              >
                <i className="fas fa-arrow-left me-1"></i> Back to Dashboard
              </button>
            </div>
          )}
          <CreateInstance isAiLoading={appState.isAiLoading} />
        </div>
      );
    }
  };

  return (
    <AppContext.Provider value={{ dispatch, appState, dappManager, plugin }}>
      <IntlProvider locale={locale.code} messages={locale.messages || {}}>
        <div className="App qd-container">
          {renderContent()}
        </div>
        <LoadingScreen />
        {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} plugin={plugin} />}
      </IntlProvider>
    </AppContext.Provider>
  );
}

export default RemixUiQuickDappV2;
