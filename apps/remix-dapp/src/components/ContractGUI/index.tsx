import React, { useEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import * as remixLib from '@remix-project/remix-lib';
import { CopyToClipboard } from '@remix-ui/clipboard'
import { CustomTooltip } from '@remix-ui/helper';

const { txFormat, txHelper } = remixLib.execution;
export function ContractGUI(props: any) {
  const [title, setTitle] = useState<string>('');
  const [basicInput, setBasicInput] = useState<string>('');
  const [toggleContainer, setToggleContainer] = useState<boolean>(false);
  const [buttonOptions, setButtonOptions] = useState<{
    title: string;
    content: string;
    classList: string;
    dataId: string;
  }>({ title: '', content: '', classList: '', dataId: '' });
  const multiFields = useRef<Array<HTMLInputElement | null>>([]);
  const basicInputRef = useRef<any>();
  const intl = useIntl();

  useEffect(() => {
    if (props.funcABI.name) {
      setTitle(props.funcABI.name);
    } else {
      setTitle(props.funcABI.type === 'receive' ? '(receive)' : '(fallback)');
    }
    setBasicInput('');
    // we have the reset the fields before resetting the previous references.
    if (basicInputRef.current) basicInputRef.current.value = '';
    multiFields.current
      .filter((el) => el !== null && el !== undefined)
      .forEach((el: any) => (el.value = ''));
    multiFields.current = [];
  }, [props.funcABI]);

  useEffect(() => {
    if (props.lookupOnly) {
      //   // call. stateMutability is either pure or view
      setButtonOptions({
        title: title + ' - call',
        content: 'call',
        classList: 'btn-info',
        dataId: title + ' - call',
      });
    } else if (
      props.funcABI.stateMutability === 'payable' ||
      props.funcABI.payable
    ) {
      //   // transact. stateMutability = payable
      setButtonOptions({
        title: title + ' - transact (payable)',
        content: 'transact',
        classList: 'btn-danger',
        dataId: title + ' - transact (payable)',
      });
    } else {
      //   // transact. stateMutability = nonpayable
      setButtonOptions({
        title: title + ' - transact (not payable)',
        content: 'transact',
        classList: 'btn-warning',
        dataId: title + ' - transact (not payable)',
      });
    }
  }, [props.lookupOnly, props.funcABI, title]);

  const getEncodedCall = () => {
    const multiString = getMultiValsString(multiFields.current);
    // copy-to-clipboard icon is only visible for method requiring input params
    if (!multiString) {
      return intl.formatMessage({ id: 'udapp.getEncodedCallError' });
    }
    const multiJSON = JSON.parse('[' + multiString + ']');

    const encodeObj = txFormat.encodeData(props.funcABI, multiJSON, null);

    if (encodeObj.error) {
      console.error(encodeObj.error);
      return encodeObj.error;
    } else {
      return encodeObj.data;
    }
  };

  const getEncodedParams = () => {
    try {
      const multiString = getMultiValsString(multiFields.current);
      // copy-to-clipboard icon is only visible for method requiring input params
      if (!multiString) {
        return intl.formatMessage({ id: 'udapp.getEncodedCallError' });
      }
      const multiJSON = JSON.parse('[' + multiString + ']');
      return txHelper.encodeParams(props.funcABI, multiJSON);
    } catch (e) {
      console.error(e);
    }
  };

  const switchMethodViewOn = () => {
    setToggleContainer(true);
    makeMultiVal();
  };

  const switchMethodViewOff = () => {
    setToggleContainer(false);
    const multiValString = getMultiValsString(multiFields.current);

    if (multiValString) setBasicInput(multiValString);
  };

  const getMultiValsString = (fields: (HTMLInputElement | null)[]) => {
    const valArray = fields as HTMLInputElement[];
    let ret = '';
    const valArrayTest = [];

    for (let j = 0; j < valArray.length; j++) {
      if (ret !== '') ret += ',';
      let elVal = valArray[j] ? valArray[j].value : '';

      valArrayTest.push(elVal);
      elVal = elVal.replace(/(^|,\s+|,)(\d+)(\s+,|,|$)/g, '$1"$2"$3'); // replace non quoted number by quoted number
      elVal = elVal.replace(
        /(^|,\s+|,)(0[xX][0-9a-fA-F]+)(\s+,|,|$)/g,
        '$1"$2"$3'
      ); // replace non quoted hex string by quoted hex string
      if (elVal) {
        try {
          JSON.parse(elVal);
        } catch (e) {
          elVal = '"' + elVal + '"';
        }
      }
      ret += elVal;
    }
    const valStringTest = valArrayTest.join('');

    if (valStringTest) {
      return ret;
    } else {
      return '';
    }
  };

  const makeMultiVal = () => {
    const inputString = basicInput;

    if (inputString) {
      const inputJSON = txFormat.parseFunctionParams(inputString);
      const multiInputs = multiFields.current as HTMLInputElement[];

      for (let k = 0; k < multiInputs.length; k++) {
        if (inputJSON[k]) {
          multiInputs[k].value = JSON.stringify(inputJSON[k]);
        }
      }
    }
  };

  const handleActionClick = async () => {
    props.clickCallBack(props.funcABI.inputs, basicInput);
  };

  const handleBasicInput = (e: { target: { value: any } }) => {
    const value = e.target.value;

    setBasicInput(value);
  };

  const handleExpandMultiClick = () => {
    const valsString = getMultiValsString(multiFields.current);

    if (valsString) {
      props.clickCallBack(props.funcABI.inputs, valsString);
    } else {
      props.clickCallBack(props.funcABI.inputs, '');
    }
  };

  return (
    <div
      className={`${
        props.funcABI.inputs && props.funcABI.inputs.length > 0
          ? 'udapp_hasArgs'
          : ''
      }`}
    >
      <div className={`${toggleContainer ? 'hidden' : 'flex'} w-full pt-2`}>
        <CustomTooltip
          delay={0}
          placement={'right'}
          tooltipClasses="whitespace-normal"
          tooltipId="remixUdappInstanceButtonTooltip"
          tooltipText={
            props.inputs !== '' && basicInput === ''
              ? intl.formatMessage({ id: 'udapp.tooltipText12' })
              : buttonOptions.title
          }
        >
          <div
            className="flex p-0 wrapperElement"
            onClick={handleActionClick}
            data-id={buttonOptions.dataId}
            data-bs-title={buttonOptions.title}
          >
            <button
              className={`whitespace-nowrap overflow-hidden truncate ${props.widthClass} btn btn-sm ${buttonOptions.classList}`}
              data-id={buttonOptions.dataId}
              data-bs-title={buttonOptions.title}
              disabled={
                props.disabled || (props.inputs !== '' && basicInput === '')
              }
              style={{
                width: 100,
                minWidth: 80,
                borderRadius: 3,
              }}
            >
              {title}
            </button>
          </div>
        </CustomTooltip>
        <input
          className="form-control"
          data-id={
            props.funcABI.type === 'fallback' ||
            props.funcABI.type === 'receive'
              ? `'(${props.funcABI.type}')`
              : 'multiParamManagerBasicInputField'
          }
          placeholder={props.inputs}
          onChange={handleBasicInput}
          data-bs-title={
            props.funcABI.type === 'fallback' ||
            props.funcABI.type === 'receive'
              ? `'(${props.funcABI.type}')`
              : props.inputs
          }
          ref={basicInputRef}
          style={{
            height: '2rem',
            visibility: !(
              (props.funcABI.inputs && props.funcABI.inputs.length > 0) ||
              props.funcABI.type === 'fallback' ||
              props.funcABI.type === 'receive'
            )
              ? 'hidden'
              : 'visible',
          }}
        />
        <i
          className="fas fa-angle-down udapp_methCaret"
          onClick={switchMethodViewOn}
          style={{
            lineHeight: 2,
            visibility: !(
              props.funcABI.inputs && props.funcABI.inputs.length > 0
            )
              ? 'hidden'
              : 'visible',
          }}
        ></i>
      </div>
      <div className={`${toggleContainer ? 'flex' : 'hidden'} w-full`}>
        <div className="w-full text-dark">
          <div
            onClick={switchMethodViewOff}
            className="flex justify-between items-center pt-2"
          >
            <div className="run-instance-multi-title" style={{ fontSize: 12 }}>
              {title}
            </div>
            <i className="fas fa-angle-up udapp_methCaret"></i>
          </div>
          <div>
            {props.funcABI.inputs.map((inp: any, index: number) => {
              return (
                <div
                  className="udapp_multiArg flex items-center justify-end mt-2"
                  key={index}
                >
                  <label htmlFor={inp.name}> {inp.name}: </label>
                  <CustomTooltip
                    placement="left-end"
                    tooltipId="udappContractActionsTooltip"
                    tooltipClasses="whitespace-nowrap"
                    tooltipText={inp.name}
                  >
                    <input
                      ref={(el) => {
                        multiFields.current[index] = el;
                      }}
                      className="form-control"
                      placeholder={inp.type}
                      data-id={`multiParamManagerInput${inp.name}`}
                      onChange={handleBasicInput}
                    />
                  </CustomTooltip>
                </div>
              );
            })}
          </div>
          <div className="flex udapp_group udapp_multiArg flex items-center justify-end mt-2">
            <CopyToClipboard
              tip={intl.formatMessage({ id: 'udapp.copyCalldata' })}
              icon="fa-clipboard"
              direction={'bottom'}
              getContent={getEncodedCall}
            >
              <button className="btn">
                <i
                  id="copyCalldata"
                  className="mr-2 far fa-copy"
                  aria-hidden="true"
                ></i>
                <label htmlFor="copyCalldata">Calldata</label>
              </button>
            </CopyToClipboard>
            <CopyToClipboard
              tip={intl.formatMessage({ id: 'udapp.copyParameters' })}
              icon="fa-clipboard"
              direction={'bottom'}
              getContent={getEncodedParams}
            >
              <button className="btn">
                <i
                  id="copyParameters"
                  className="mr-2 far fa-copy"
                  aria-hidden="true"
                ></i>
                <label htmlFor="copyParameters">
                  <FormattedMessage id="udapp.parameters" />
                </label>
              </button>
            </CopyToClipboard>
            <CustomTooltip
              placement={'right'}
              tooltipClasses="whitespace-nowrap"
              tooltipId="remixUdappInstanceButtonTooltip"
              tooltipText={buttonOptions.title}
            >
              <div onClick={handleExpandMultiClick}>
                <button
                  type="button"
                  data-id={buttonOptions.dataId}
                  className={`btn ${buttonOptions.classList}`}
                  disabled={
                    props.disabled || (props.inputs !== '' && basicInput === '')
                  }
                  style={{ width: 80 }}
                >
                  {buttonOptions.content}
                </button>
              </div>
            </CustomTooltip>
          </div>
        </div>
      </div>
    </div>
  );
}
