import React, { useContext, useEffect, useState } from 'react';
import { UniversalDappUI } from '../../components/UniversalDappUI';
import { SettingsUI } from '../../components/SettingsUI';
import DappTop from '../../components/DappTop';
import { AppContext } from '../../contexts';
import TxList from '../../components/UiTerminal/TxList';

const MobilePage: React.FC = () => {
  const {
    appState: { instance },
  } = useContext(AppContext);
  const [active, setActive] = useState('functions');

  return <div>
    <div
      className={`${
        active === 'functions' ? '' : 'hidden'
      } col-xl-9 col-lg-8 col-md-7 pr-0`}
    >
      <div className="mx-3 my-2 row">
        {instance.showLogo && <div className="col-2 text-center px-0 flex items-center">
          <img src="/assets/logo.png" style={{ width: 55, height: 55 }} />
        </div>}
        <DappTop />
      </div>
      <UniversalDappUI />
    </div>
    {!instance.noTerminal && (
      <div className={`${active === 'transactions' ? '' : 'hidden'}`}>
        <TxList />
      </div>
    )}
    <div
      className={`${
        active === 'settings' ? '' : 'hidden'
      } col-xl-3 col-lg-4 col-md-5 pl-0`}
    >
      <SettingsUI />
    </div>
    <ul
      className="nav nav-pills justify-center fixed-bottom row bg-light"
      style={{ zIndex: 'auto' }}
    >
      <li
        className={`nav-item col text-center p-2`}
        onClick={() => {
          setActive('functions');
        }}
      >
        <span
          className={`${active === 'functions' ? 'active' : ''} nav-link`}
        >
        Functions
        </span>
      </li>
      {!instance.noTerminal && (
        <li
          className={`nav-item col text-center p-2`}
          onClick={() => {
            setActive('transactions');
          }}
        >
          <span
            className={`${
              active === 'transactions' ? 'active' : ''
            } nav-link`}
          >
          Transactions
          </span>
        </li>
      )}
      <li
        className={`${
          active === 'settings' ? 'active' : ''
        } nav-item col text-center p-2`}
        onClick={() => {
          setActive('settings');
        }}
      >
        <span className={`${active === 'settings' ? 'active' : ''} nav-link`}>
        Settings
        </span>
      </li>
    </ul>
  </div>
};

export default MobilePage;
