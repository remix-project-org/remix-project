import React, { useEffect, useReducer, useState, useMemo } from 'react';
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
  
  const [isAppLoading, setIsAppLoading] = useState(true);

  const dappManager = useMemo(() => new DappManager(remixClient as any), []);

  useEffect(() => {
    updateState(appState);
  }, [appState]);

  useEffect(() => {
    initDispatch(dispatch);
    
    const initApp = async () => {
      setIsAppLoading(true);
      
      try {
        await connectRemix();
        
        // @ts-ignore
        remixClient.call('locale', 'currentLocale').then((l: any) => setLocale(l));
        // @ts-ignore
        remixClient.on('locale', 'localeChanged', (l: any) => setLocale(l));

        // @ts-ignore
        remixClient.on('ai-dapp-generator', 'generationProgress', (progress: any) => {
          if (progress.status === 'started') dispatch({ type: 'SET_AI_LOADING', payload: true });
        });
        // @ts-ignore
        remixClient.on('ai-dapp-generator', 'dappGenerated', () => dispatch({ type: 'SET_AI_LOADING', payload: false }));
        // @ts-ignore
        remixClient.on('ai-dapp-generator', 'dappUpdated', () => dispatch({ type: 'SET_AI_LOADING', payload: false }));

        const dapps = (await dappManager.getDapps()) || [];
        dispatch({ type: 'SET_DAPPS', payload: dapps });

        const validDapps = dapps.filter((d: any) => d.config?.status !== 'draft');

        if (validDapps.length > 0) {
          dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
        } else {
          dispatch({ type: 'SET_VIEW', payload: 'create' });
        }

      } catch (e) {
        console.error("Failed to load app", e);
        dispatch({ type: 'SET_DAPPS', payload: [] });
        dispatch({ type: 'SET_VIEW', payload: 'create' });
      } finally {
        setIsAppLoading(false);
        dispatch({ type: 'SET_LOADING', payload: { screen: false } });
      }
    };

    initApp();

    const onCreatingStart = () => {
      dispatch({ type: 'SET_VIEW', payload: 'create' });
      dispatch({ type: 'SET_AI_LOADING', payload: true });
    };

    const onDappCreated = async (newDappConfig: any) => {
      const updatedDapps = await dappManager.getDapps();
      dispatch({ type: 'SET_DAPPS', payload: updatedDapps });
      dispatch({ type: 'SET_ACTIVE_DAPP', payload: newDappConfig });
      dispatch({ type: 'SET_VIEW', payload: 'editor' });
      setTimeout(() => dispatch({ type: 'SET_AI_LOADING', payload: false }), 100);
    };

    const onCreatingError = () => {
      dispatch({ type: 'SET_AI_LOADING', payload: false });
    };

    remixClient.internalEvents.on('creatingDappStart', onCreatingStart);
    remixClient.internalEvents.on('dappCreated', onDappCreated);
    remixClient.internalEvents.on('creatingDappError', onCreatingError);

    return () => {
      remixClient.internalEvents.off('creatingDappStart', onCreatingStart);
      remixClient.internalEvents.off('dappCreated', onDappCreated);
      remixClient.internalEvents.off('creatingDappError', onCreatingError);
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