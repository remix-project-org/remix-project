import React, { useContext } from 'react';
import { CustomTooltip } from '@remix-ui/helper';
import { FormattedMessage } from 'react-intl';
import { AppContext } from '../../contexts';

export function GasPriceUI() {
  const { appState, dispatch } = useContext(AppContext);
  const handleGasLimit = (e: any) => {
    dispatch({ type: 'settings/save', payload: { gasLimit: e.target.value } });
  };

  const gasLimit = appState.settings.gasLimit;

  return (
    <div className="block mt-2">
      <label>
        <FormattedMessage id="udapp.gasLimit" />
      </label>
      <CustomTooltip
        placement={'top'}
        tooltipClasses="whitespace-nowrap"
        tooltipId="remixGasPriceTooltip"
        tooltipText={<FormattedMessage id="udapp.tooltipText4" />}
      >
        <input
          type="number"
          className="form-control w-3/4"
          id="gasLimit"
          value={gasLimit}
          onChange={handleGasLimit}
        />
      </CustomTooltip>
    </div>
  );
}
