import React, { useContext } from 'react';
import { AppContext } from '../../contexts';
import { FormattedMessage } from 'react-intl';
import { setProvider } from '../../actions';

export function NetworkUI() {
  const { appState, dispatch } = useContext(AppContext);
  const { networkName, provider } = appState.settings;
  return (
    <div className="">
      <label>
        <FormattedMessage id="udapp.environment" />
      </label>
      <div className="flex items-center">
        <select
          id="txorigin"
          data-id="runTabSelectAccount"
          name="txorigin"
          value={provider}
          className="form-control overflow-hidden w-full font-normal form-select pr-4"
          onChange={(e) => {
            dispatch({
              type: 'SET_SETTINGS',
              payload: { provider: e.target.value },
            });
            setProvider({ provider: e.target.value, networkName });
          }}
        >
          <option value={'metamask'} key={'metamask'}>
            MetaMask
          </option>
          {/* <option value={'walletconnect'} key={'walletconnect'}>
            WalletConnect
          </option> */}
        </select>
      </div>
      <div className="relative w-full" data-id="settingsNetworkEnv">
        <span className="badge bg-secondary">{networkName}</span>
      </div>
      {/* {provider === 'walletconnect' && (
        <div className="mt-2">
          <w3m-button />
        </div>
      )} */}
    </div>
  );
}
