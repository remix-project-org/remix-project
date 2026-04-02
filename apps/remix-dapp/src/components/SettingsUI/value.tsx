import React, { useContext, useEffect, useRef } from 'react';
import { FormattedMessage } from 'react-intl';
import { BN } from 'bn.js';
import { CustomTooltip } from '@remix-ui/helper';
import { AppContext } from '../../contexts';

export function ValueUI() {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const inputValue = useRef<HTMLInputElement>({} as HTMLInputElement);

  const { appState, dispatch } = useContext(AppContext);
  const { sendValue, sendUnit } = appState.settings;

  useEffect(() => {
    if (sendValue !== inputValue.current.value) {
      inputValue.current.value = sendValue;
    }
  }, [sendValue]);

  const validateValue = (e: { target: { value: any } }) => {
    const value = e.target.value;

    if (!value) {
      // assign 0 if given value is
      // - empty
      inputValue.current.value = '0';
      dispatch({ type: 'SET_SETTINGS', payload: { sendValue: '0' } });
      return;
    }

    let v;
    try {
      v = new BN(value, 10);
      dispatch({
        type: 'SET_SETTINGS',
        payload: { sendValue: v.toString(10) },
      });
    } catch (e) {
      // assign 0 if given value is
      // - not valid (for ex 4345-54)
      // - contains only '0's (for ex 0000) copy past or edit
      inputValue.current.value = '0';
      dispatch({ type: 'SET_SETTINGS', payload: { sendValue: '0' } });
    }

    if (v?.lt(0)) {
      inputValue.current.value = '0';
      dispatch({ type: 'SET_SETTINGS', payload: { sendValue: '0' } });
    }
  };

  return (
    <div className="block mt-2">
      <label data-id="remixDRValueLabel">
        <FormattedMessage id="udapp.value" />
      </label>
      <div className="flex flex-row">
        <CustomTooltip
          placement={'top-start'}
          tooltipClasses="whitespace-nowrap"
          tooltipId="remixValueTooltip"
          tooltipText={<FormattedMessage id="udapp.tooltipText5" />}
        >
          <input
            ref={inputValue}
            type="number"
            min="0"
            pattern="^[0-9]"
            step="1"
            className="form-control w-3/4"
            id="value"
            data-id="dandrValue"
            onChange={validateValue}
            value={sendValue}
          />
        </CustomTooltip>

        <select
          name="unit"
          value={sendUnit}
          className="form-control p-1 w-1/4 ml-2 udapp_col2_2 form-select"
          id="unit"
          onChange={(e: any) => {
            dispatch({
              type: 'SET_SETTINGS',
              payload: {
                sendUnit: e.target.value,
              },
            });
          }}
        >
          <option data-unit="wei" value="wei">
            Wei
          </option>
          <option data-unit="gwei" value="gwei">
            Gwei
          </option>
          <option data-unit="finney" value="finney">
            Finney
          </option>
          <option data-unit="ether" value="ether">
            Ether
          </option>
        </select>
      </div>
    </div>
  );
}
