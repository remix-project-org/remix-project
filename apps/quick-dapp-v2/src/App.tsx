import React, { useEffect, useReducer, useState } from 'react';
import { IntlProvider } from 'react-intl'
import CreateInstance from './components/CreateInstance';
import EditInstance from './components/EditInstance';
import EditHtmlTemplate from './components/EditHtmlTemplate';
import DeployPanel from './components/DeployPanel';
import LoadingScreen from './components/LoadingScreen';
import { appInitialState, appReducer } from './reducers/state';
import {
  connectRemix,
  initDispatch,
  updateState,
  selectTheme,
} from './actions';
import { AppContext } from './contexts';
import remixClient from './remix-client';
import './App.css';

function App(): JSX.Element {
  const [locale, setLocale] = useState<{code: string; messages: any}>({
    code: 'en',
    messages: null,
  })
  const [appState, dispatch] = useReducer(appReducer, appInitialState);
  const { isAiLoading } = appState;

  useEffect(() => {
    updateState(appState);
  }, [appState]);
  useEffect(() => {
    initDispatch(dispatch);
    updateState(appState);
    connectRemix().then(() => {
      remixClient.call('theme', 'currentTheme').then((theme: any) => {
        selectTheme(theme.name);
      });
      remixClient.on('theme', 'themeChanged', (theme: any) => {
        selectTheme(theme.name);
      });
      // @ts-ignore
      remixClient.call('locale', 'currentLocale').then((locale: any) => {
        setLocale(locale)
      })
      // @ts-ignore
      remixClient.on('locale', 'localeChanged', (locale: any) => {
        setLocale(locale)
      })
      // @ts-ignore
      remixClient.on('ai-dapp-generator', 'generationProgress', (progress: any) => {
        if (progress.status === 'started') {
          dispatch({ type: 'SET_AI_LOADING', payload: true });
        }
      });
      // @ts-ignore
      remixClient.on('ai-dapp-generator', 'dappGenerated', () => {
        dispatch({ type: 'SET_AI_LOADING', payload: false });
      });
      // @ts-ignore
      remixClient.on('ai-dapp-generator', 'dappUpdated', () => {
        dispatch({ type: 'SET_AI_LOADING', payload: false });
      });
    });
  }, []);
  return (
    <AppContext.Provider
      value={{
        dispatch,
        appState,
      }}
    >
      <IntlProvider locale={locale.code} messages={locale.messages || {}}>
        {!locale.messages ? (
          <div className="text-center pt-5">
            <i className="fas fa-spinner fa-spin fa-2x"></i>
          </div>
        ) : (
          <>
            {appState.instance.htmlTemplate ? (
              <div className="container-fluid pt-3">
                <EditHtmlTemplate />
              </div>
            ) : Object.keys(appState.instance.abi).length > 0 ? (
              <div className="row m-0 pt-3">
                <EditInstance />
                <DeployPanel />
              </div>
            ) : (
              <div className="row m-0 pt-3">
                <CreateInstance isAiLoading={isAiLoading} />
              </div>
            )}
          </>
        )}
        <LoadingScreen />
      </IntlProvider>
    </AppContext.Provider>
  );
}

export default App;
