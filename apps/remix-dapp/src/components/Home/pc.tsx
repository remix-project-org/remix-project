import React, { useContext, useEffect } from 'react';
import { UniversalDappUI } from '../../components/UniversalDappUI';
import { SettingsUI } from '../../components/SettingsUI';
import RemixUiTerminal from '../../components/UiTerminal';
import DragBar from '../../components/DragBar';
import DappTop from '../../components/DappTop';
import { AppContext } from '../../contexts';

const PCPage: React.FC = () => {
  const {
    appState: { terminal, instance },
  } = useContext(AppContext);
  const { height } = terminal;

  return <div>
    <div
      className="row m-0 pt-3"
      style={{
        height: instance.noTerminal
          ? window.innerHeight
          : window.innerHeight - height - 5,
        overflowY: 'auto',
      }}
    >
      <div className="col-xl-9 col-lg-8 col-md-7 inline-block pr-0">
        <div className="mx-3 my-2 row">
          {instance.showLogo && <div className="col-2 text-center">
            <img src="/assets/logo.png" style={{ width: 95, height: 95 }} />
          </div>}
          <DappTop />
        </div>
        <UniversalDappUI />
      </div>
      <div className="col-xl-3 col-lg-4 col-md-5 inline-block pl-0">
        <SettingsUI />
      </div>
    </div>
    {!instance.noTerminal && (
      <>
        <DragBar />
        <RemixUiTerminal />
      </>
    )}
  </div>
};

export default PCPage;
