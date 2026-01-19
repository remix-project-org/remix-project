import React, { useEffect, useReducer, useState, useMemo, useRef } from 'react';
import { IntlProvider } from 'react-intl'
import CreateInstance from './components/CreateInstance';
import EditHtmlTemplate from './components/EditHtmlTemplate';
import LoadingScreen from './components/LoadingScreen';
import Dashboard from './components/Dashboard';
import { appInitialState, appReducer } from './reducers/state';
import {
  connectRemix,
  initDispatch,
  updateState,
} from './actions';
import { AppContext } from './contexts';
import remixClient from './remix-client';
import { DappManager } from './utils/DappManager';
import './App.css';

function App(): JSX.Element {
  const [locale, setLocale] = useState<{code: string; messages: any}>({
    code: 'en',
    messages: null,
  });

  const [appState, dispatch] = useReducer(appReducer, appInitialState);
  const dappsRef = useRef(appState.dapps);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const activeDappRef = useRef(appState.activeDapp);
  const dappManager = useMemo(() => new DappManager(remixClient as any), []);

  useEffect(() => {
    dappsRef.current = appState.dapps;
  }, [appState.dapps]);

  useEffect(() => {
    updateState(appState);
    activeDappRef.current = appState.activeDapp;
  }, [appState]);

  useEffect(() => {
    console.log('[DEBUG-APP] Initializing App...');
    initDispatch(dispatch);
    
    const initApp = async () => {
      setIsAppLoading(true);
      
      try {
        await connectRemix();
        console.log('[DEBUG-APP] Remix Connected');
        
        // @ts-ignore
        remixClient.call('locale', 'currentLocale').then((l: any) => setLocale(l));
        // @ts-ignore
        remixClient.on('locale', 'localeChanged', (l: any) => setLocale(l));

        // @ts-ignore
        remixClient.on('ai-dapp-generator', 'generationProgress', (progress: any) => {
          console.log('[DEBUG-APP] Generation Progress (Ignored for global loading):', progress);
        });
        
        const dapps = (await dappManager.getDapps()) || [];
        console.log('[DEBUG-APP] Loaded Dapps:', dapps.length);
        dispatch({ type: 'SET_DAPPS', payload: dapps });

        const validDapps = dapps.filter((d: any) => d.config?.status !== 'draft');

        if (validDapps.length > 0) {
          dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
        } else {
          dispatch({ type: 'SET_VIEW', payload: 'create' });
        }

      } catch (e) {
        console.error("[DEBUG-APP] Failed to load app", e);
        dispatch({ type: 'SET_DAPPS', payload: [] });
        dispatch({ type: 'SET_VIEW', payload: 'create' });
      } finally {
        setIsAppLoading(false);
        dispatch({ type: 'SET_LOADING', payload: { screen: false } });
      }
    };

    initApp();
  }, [dappManager, dispatch]); 

  useEffect(() => {
    console.log('[DEBUG-APP] Registering Event Listeners...');

    const onCreatingStart = async (data: any) => {
      console.log('[DEBUG-APP] Event: creatingDappStart', data);
  
      dispatch({ type: 'SET_AI_LOADING', payload: false });

      if (data.dappConfig) {
        const newDappsList = [data.dappConfig, ...dappsRef.current];
        dispatch({ type: 'SET_DAPPS', payload: newDappsList });
        
        dispatch({ 
          type: 'SET_DAPP_PROCESSING', 
          payload: { slug: data.slug, isProcessing: true } 
        });

        if (appState.dapps.length === 0) {
          dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
        }
      }
    };

    const onDappUpdateStart = (data: any) => {
      console.log('[DEBUG-APP] Event: dappUpdateStart', data.slug);
      if (data && data.slug) {
        dispatch({ 
          type: 'SET_DAPP_PROCESSING', 
          payload: { slug: data.slug, isProcessing: true } 
        });
      }
    };

    const onDappCreated = async (newDappConfig: any) => {
      console.log(`[DEBUG-APP] Event: dappCreated for ${newDappConfig.slug}`);
      
      const updatedDappsList = dappsRef.current.map((d: any) => 
        d.slug === newDappConfig.slug ? newDappConfig : d
      );

      const isExist = dappsRef.current.find((d: any) => d.slug === newDappConfig.slug);
      if (!isExist) {
        updatedDappsList.unshift(newDappConfig);
      }

      dispatch({ type: 'SET_DAPPS', payload: updatedDappsList });

      dispatch({ 
        type: 'SET_DAPP_PROCESSING', 
        payload: { slug: newDappConfig.slug, isProcessing: false } 
      });
      
      dispatch({ type: 'SET_AI_LOADING', payload: false });
      
      console.log('[DEBUG-APP] Dapp created. List updated in memory.');
    };
    
    const onCreatingError = (errorData?: any) => {
      console.error('[DEBUG-APP] Event: creatingDappError', errorData);
      dispatch({ type: 'SET_AI_LOADING', payload: false });
      
      const targetSlug = errorData?.slug || activeDappRef.current?.slug;

      if (targetSlug) {
        console.log(`[DEBUG-APP] Turning off processing for specific slug: ${targetSlug}`);
        dispatch({ 
          type: 'SET_DAPP_PROCESSING', 
          payload: { slug: targetSlug, isProcessing: false } 
        });
      } else {
        console.warn('[DEBUG-APP] Error received without slug. Loading state might be stuck.');
      }
    };

    const onDappUpdated = (data: any) => {
      console.log('[DEBUG-APP] Event: dappUpdated', data.slug);
      
      dispatch({ type: 'SET_AI_LOADING', payload: false });

      if (data.slug) {
        console.log('[DEBUG-APP] Finishing update process for:', data.slug);
        dispatch({ 
          type: 'SET_DAPP_PROCESSING', 
          payload: { slug: data.slug, isProcessing: false } 
        });
      }
    };

    remixClient.internalEvents.on('creatingDappStart', onCreatingStart);
    remixClient.internalEvents.on('dappCreated', onDappCreated);
    remixClient.internalEvents.on('creatingDappError', onCreatingError);
    remixClient.internalEvents.on('dappUpdated', onDappUpdated);
    remixClient.internalEvents.on('dappUpdateStart', onDappUpdateStart);
    return () => {
      console.log('[DEBUG-APP] Cleaning up Event Listeners');
      remixClient.internalEvents.off('creatingDappStart', onCreatingStart);
      remixClient.internalEvents.off('dappCreated', onDappCreated);
      remixClient.internalEvents.off('creatingDappError', onCreatingError);
      remixClient.internalEvents.off('dappUpdated', onDappUpdated);
      remixClient.internalEvents.off('dappUpdateStart', onDappUpdateStart);
    };
  }, [dappManager, dispatch]);

  const handleDeleteOne = async (slug: string) => {
    await dappManager.deleteDapp(slug);
    const updatedDapps = (await dappManager.getDapps()) || [];
    dispatch({ type: 'SET_DAPPS', payload: updatedDapps });
    
    if (updatedDapps.length === 0) {
      dispatch({ type: 'SET_VIEW', payload: 'create' });
    }
  };

  const handleDeleteAll = async () => {
    await dappManager.deleteAllDapps();
    dispatch({ type: 'SET_DAPPS', payload: [] });
    dispatch({ type: 'SET_VIEW', payload: 'create' });
  };

  const renderContent = () => {
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
            onOpen={(dapp) => {
              dispatch({ type: 'SET_ACTIVE_DAPP', payload: dapp });
              dispatch({ type: 'SET_VIEW', payload: 'editor' });
            }}
            onCreateNew={() => dispatch({ type: 'SET_VIEW', payload: 'create' })}
            onDeleteOne={handleDeleteOne}
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
    <AppContext.Provider value={{ dispatch, appState, dappManager }}>
      <IntlProvider locale={locale.code} messages={locale.messages || {}}>
        <div className="App">
           {renderContent()}
        </div>
        <LoadingScreen />
      </IntlProvider>
    </AppContext.Provider>
  );
}

export default App;