import React, { useContext } from 'react';
import { NetworkUI } from './network';
import { AccountUI } from './account';
import { GasPriceUI } from './gasPrice';
import { ValueUI } from './value';
import { LocaleUI } from './locale';
// import { ThemeUI } from './theme';
import { FormattedMessage, useIntl } from 'react-intl';
import { CopyToClipboard } from '@remix-ui/clipboard'
import { AppContext } from '../../contexts';
import { CustomTooltip, shortenAddress } from '@remix-ui/helper';
import { isMobile } from '../../utils/tools';
import { LowLevelInteractions } from '../UniversalDappUI/lowLevelInteractions';

export function SettingsUI() {
  const intl = useIntl();
  const { appState } = useContext(AppContext);
  const { balance, name, address, verified } = appState.instance;

  return (
    <div className="px-4">
      <div className="bg-light mt-2 mb-4 p-3">
        <div className="flex justify-between items-center">
          <div className="bg-transparent m-0 p-0 border-0 alert alert-secondary">
            <div className="input-group-prepend">
              <span
                className="input-group-text border-0 p-0 bg-transparent uppercase"
                style={{ fontSize: 11 }}
              >
                {name} at {shortenAddress(address)}
              </span>
              <span className="btn p-0">
                <CopyToClipboard
                  tip={intl.formatMessage({ id: 'udapp.copy' })}
                  content={address}
                  direction={'top'}
                />
              </span>
            </div>
            <div className="input-group-prepend">
              <div
                className="input-group-text border-0 p-0 bg-transparent uppercase"
                style={{ fontSize: 11 }}
              >
                <FormattedMessage id="udapp.balance" />: {balance} ETH
              </div>
            </div>
          </div>
          <LocaleUI />
        </div>
      </div>
      <div className="bg-light mt-3 mb-4 p-3">
        <NetworkUI />
        <AccountUI />
        <GasPriceUI />
        <ValueUI />
        {/* <ThemeUI /> */}
      </div>
      <LowLevelInteractions />
      <div className="p-2 w-auto flex justify-between items-center">
        <span>
          QuickDapp by{' '}
          <a href={`https://remix.ethereum.org`} target="_blank">
            <CustomTooltip
              placement="top"
              tooltipId="remix"
              tooltipClasses="whitespace-nowrap"
              tooltipText="Remix IDE"
            >
              <img
                className=""
                src="https://remix.ethereum.org/assets/img/remix-logo-blue.png"
                style={{ height: '1.5rem' }}
                alt=""
              />
            </CustomTooltip>
          </a>
        </span>
        {!isMobile() && verified && (
          <a
            href={`https://remix.ethereum.org/address/${address}`}
            className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors"
            role="button"
            aria-disabled="true"
            target="_blank"
            data-id="viewSourceCode"
          >
            <FormattedMessage id="udapp.viewSourceCode" />
          </a>
        )}
      </div>
    </div>
  );
}
