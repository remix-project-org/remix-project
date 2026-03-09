import React, { useEffect, useReducer, useState, useMemo, useRef } from 'react';
import { IntlProvider } from 'react-intl';
import CreateInstance from './components/CreateInstance';
import EditHtmlTemplate from './components/EditHtmlTemplate';
import LoadingScreen from './components/LoadingScreen';
import Dashboard from './components/Dashboard';
import { appInitialState, appReducer, AppAction } from './reducers';
import { AppContext } from './contexts';
import { DappManager } from './utils/DappManager';
import { QuickDappV2PluginApi, DappConfig } from './types';
import { endpointUrls } from '@remix-endpoints-helper';
import './App.css';

const QUICK_DAPP_FEATURE = 'dapp:quickdapp';

import { getNetworkName } from './utils/networks';

export interface RemixUiQuickDappV2Props {
  plugin: QuickDappV2PluginApi;
}

export function RemixUiQuickDappV2({ plugin }: RemixUiQuickDappV2Props): JSX.Element {
  const [locale, setLocale] = useState<{ code: string; messages: any }>({
    code: 'en',
    messages: null,
  });

  const [appState, dispatch] = useReducer(appReducer, appInitialState);
  const dappsRef = useRef(appState.dapps);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const activeDappRef = useRef(appState.activeDapp);

  // Permission gating state
  const [hasAccess, setHasAccess] = useState<boolean | null>(null); // null = checking
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // DappManager now receives the plugin from props instead of a singleton
  const dappManager = useMemo(() => new DappManager(plugin as any), [plugin]);
  const dappManagerRef = useRef(dappManager);

  // Check dapp:quickdapp permission on mount and when auth state changes
  useEffect(() => {
    const checkAccess = async () => {
      try {
        const token = typeof localStorage !== 'undefined'
          ? localStorage.getItem('remix_access_token')
          : null;

        if (!token) {
          setIsAuthenticated(false);
          setHasAccess(false);
          return;
        }

        const response = await fetch(endpointUrls.permissions, {
          credentials: 'include',
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json();
          setIsAuthenticated(true);
          const feature = data.features?.[QUICK_DAPP_FEATURE];
          setHasAccess(feature?.is_enabled === true);
        } else {
          setIsAuthenticated(false);
          setHasAccess(false);
        }
      } catch (err) {
        console.error('[QuickDapp] Permission check failed:', err);
        setIsAuthenticated(false);
        setHasAccess(false);
      }
    };

    checkAccess();

    // Re-check permissions when login/logout occurs
    const onAuthChanged = () => { checkAccess(); };
    try {
      plugin.on('auth' as any, 'authStateChanged', onAuthChanged);
    } catch (e) {
      console.warn('[QuickDapp] Could not listen for authStateChanged:', e);
    }

    return () => {
      try {
        (plugin as any).off('auth', 'authStateChanged', onAuthChanged);
      } catch (_) {}
    };
  }, [plugin]);

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
      // Permission gate: check dapp:quickdapp access before creating workspace
      try {
        const token = typeof localStorage !== 'undefined'
          ? localStorage.getItem('remix_access_token')
          : null;

        if (!token) {
          plugin.call('notification', 'toast', 'Please sign in to use QuickDapp V2. This feature is available to beta testers.');
          return;
        }

        const permResponse = await fetch(endpointUrls.permissions, {
          credentials: 'include',
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (permResponse.ok) {
          const permData = await permResponse.json();
          const feature = permData.features?.[QUICK_DAPP_FEATURE];
          if (!feature?.is_enabled) {
            plugin.call('notification', 'toast', 'QuickDapp V2 is currently available to beta testers only. Please contact the Remix team to request access.');
            return;
          }
        } else {
          plugin.call('notification', 'toast', 'Unable to verify access. Please sign in and try again.');
          return;
        }
      } catch (err) {
        console.error('[QuickDapp] Permission check failed in handleCreateDapp:', err);
        plugin.call('notification', 'toast', 'Unable to verify access. Please try again.');
        return;
      }

      dispatch({ type: 'SET_AI_LOADING', payload: true });
      dispatch({ type: 'SET_VIEW', payload: 'create' });

      try {
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
        dispatch({ type: 'SET_AI_LOADING', payload: false });

        await plugin.call('ai-dapp-generator', 'generateDapp', {
          description: payload.description,
          address: payload.address,
          abi: payload.abi,
          chainId: payload.chainId,
          contractName: contractData.name,
          isBaseMiniApp: payload.isBaseMiniApp || false,
          image: payload.image,
          slug: newDapp.slug,
          figmaUrl: payload.figmaUrl,
          figmaToken: payload.figmaToken
        });

      } catch (error: any) {
        console.error('[QuickDapp] Failed to create dapp:', error);
        dispatch({ type: 'SET_AI_LOADING', payload: false });
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
      if (!data.slug || !data.content) return;

      const workspaceName = data.slug;

      try {
        await dappManager.saveGeneratedFiles(workspaceName, data.content);

        if (data.isUpdate) {
          const updatedConfig = await dappManager.updateDappConfig(workspaceName, { status: 'created' });
          if (updatedConfig) {
            const updatedDappsList = dappsRef.current.map((d: DappConfig) =>
              d.slug === updatedConfig.slug ? updatedConfig : d
            );
            dispatch({ type: 'SET_DAPPS', payload: updatedDappsList });
          }
          dispatch({ type: 'SET_DAPP_PROCESSING', payload: { slug: workspaceName, isProcessing: false } });
          plugin.call('notification', 'toast', 'DApp code updated successfully.');
        } else {
          const updatedConfig = await dappManager.updateDappConfig(workspaceName, { status: 'created' });
          if (updatedConfig) {
            const updatedDappsList = dappsRef.current.map((d: DappConfig) =>
              d.slug === updatedConfig.slug ? updatedConfig : d
            );
            const isExist = dappsRef.current.find((d: DappConfig) => d.slug === updatedConfig.slug);
            if (!isExist) {
              updatedDappsList.unshift(updatedConfig);
            }
            dispatch({ type: 'SET_DAPPS', payload: updatedDappsList });
          }
          dispatch({ type: 'SET_DAPP_PROCESSING', payload: { slug: workspaceName, isProcessing: false } });
          dispatch({ type: 'SET_AI_LOADING', payload: false });
          plugin.call('notification', 'toast', `DApp '${updatedConfig?.name || workspaceName}' created successfully!`);
        }
      } catch (e: any) {
        console.error('[QuickDapp] Error handling dappGenerated:', e);
        dispatch({ type: 'SET_DAPP_PROCESSING', payload: { slug: workspaceName, isProcessing: false } });
      }
    };

    const handleDappGenerationError = (data: any) => {
      console.error('[QuickDapp] Received dappGenerationError event:', data);
      dispatch({ type: 'SET_AI_LOADING', payload: false });

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
      const filtered = dappsRef.current.filter((d: any) => d.workspaceName !== workspaceName);
      dispatch({ type: 'SET_DAPPS', payload: filtered });
    };

    plugin.event.on('createDapp', handleCreateDapp);
    plugin.event.on('openDapp', handleOpenDapp);
    plugin.event.on('startAiLoading', handleStartAiLoading);
    plugin.event.on('dappGenerated', handleDappGenerated);
    plugin.event.on('dappGenerationError', handleDappGenerationError);
    plugin.event.on('dappUpdateStart', handleDappUpdateStart);
    plugin.event.on('workspaceDeleted', handleWorkspaceDeleted);

    const pending = plugin.consumePendingCreateDapp?.();
    if (pending) {
      handleCreateDapp(pending);
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
            if (elapsed < FIVE_MINUTES) {
              dispatch({
                type: 'SET_DAPP_PROCESSING',
                payload: { slug: dapp.slug, isProcessing: true }
              });
            } else {
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
    if (!dapp.workspaceName) return;

    try {
      await plugin.call('filePanel', 'deleteWorkspace', dapp.workspaceName);
      dispatch({
        type: 'SET_DAPPS',
        payload: dappsRef.current.filter((d: DappConfig) => d.id !== dapp.id)
      });
      // Re-focus quick-dapp-v2 tab after a delay since deleteWorkspace
      // triggers async workspace switching that shifts mainPanel focus
      setTimeout(async () => {
        try { await plugin.call('tabs', 'focus', 'quick-dapp-v2'); } catch (e) {}
      }, 500);
    } catch (e) {
      console.error('[QuickDapp] Failed to delete workspace:', e);
    }
  };

  const handleDeleteAll = async () => {
    for (const dapp of dappsRef.current) {
      if (dapp.workspaceName) {
        try {
          await plugin.call('filePanel', 'deleteWorkspace', dapp.workspaceName);
        } catch (e) {}
      }
    }
    dispatch({ type: 'SET_DAPPS', payload: []});
    dispatch({ type: 'SET_VIEW', payload: 'create' });
    // Re-focus quick-dapp-v2 tab since deleteWorkspace shifts mainPanel focus
    try { await plugin.call('tabs', 'focus', 'quick-dapp-v2'); } catch (e) {}
  };

  const renderContent = () => {
    // Permission check: show loading while checking access
    if (hasAccess === null) {
      return (
        <div className="d-flex flex-column justify-content-center align-items-center" style={{ height: '80vh' }}>
          <i className="fas fa-spinner fa-spin fa-2x mb-3 text-primary"></i>
          <p className="text-muted">Checking access...</p>
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
            <p className="text-muted" style={{ maxWidth: '400px' }}>
              Please sign in to access QuickDapp V2. This feature is available to beta testers.
            </p>
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
      </IntlProvider>
    </AppContext.Provider>
  );
}

export default RemixUiQuickDappV2;
