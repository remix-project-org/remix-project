import React, { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { execution } from '@remix-project/remix-lib';
import { saveDetails, saveTitle } from '../../actions';

const txHelper = execution.txHelper;

const getFuncABIInputs = (funABI: any) => {
  if (!funABI.inputs) {
    return '';
  }
  return txHelper.inputParametersDeclarationToString(funABI.inputs);
};

export function ContractGUI(props: { funcABI: any, funcId: any }) {
  const intl = useIntl()
  const isConstant =
    props.funcABI.constant !== undefined ? props.funcABI.constant : false;
  const lookupOnly =
    props.funcABI.stateMutability === 'view' ||
    props.funcABI.stateMutability === 'pure' ||
    isConstant;
  const inputs = getFuncABIInputs(props.funcABI);
  const [title, setTitle] = useState<string>('');
  const [buttonOptions, setButtonOptions] = useState<{
    title: string;
    content: string;
    classList: string;
    dataId: string;
  }>({ title: '', content: '', classList: '', dataId: '' });

  useEffect(() => {
    if (props.funcABI.name) {
      setTitle(props.funcABI.name);
    } else {
      setTitle(props.funcABI.type === 'receive' ? '(receive)' : '(fallback)');
    }
  }, [props.funcABI]);

  useEffect(() => {
    if (lookupOnly) {
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
      setButtonOptions({
        title: title + ' - transact (payable)',
        content: 'transact',
        classList: 'btn-danger',
        dataId: title + ' - transact (payable)',
      });
    } else {
      setButtonOptions({
        title: title + ' - transact (not payable)',
        content: 'transact',
        classList: 'btn-warning',
        dataId: title + ' - transact (not payable)',
      });
    }
  }, [lookupOnly, props.funcABI, title]);

  return (
    <div className={`d-inline-block`} style={{ width: '90%' }}>
      <div className="p-2">
        <input
          data-id={`functionTitle${props.funcId}`}
          className="form-control"
          placeholder={intl.formatMessage({ id: 'quickDapp.functionTitle' })}
          value={props.funcABI.title || ''}
          onChange={({ target: { value } }) => {
            saveTitle({ id: props.funcABI.id, title: value });
          }}
        />
      </div>
      <div className="p-2 d-flex">
        <div
          className="d-flex p-0 wrapperElement"
          data-id={buttonOptions.dataId}
          data-bs-title={buttonOptions.title}
        >
          <button
            disabled
            className={`text-nowrap overflow-hidden text-truncate btn btn-sm ${
              buttonOptions.classList
            } ${
              props.funcABI.inputs && props.funcABI.inputs.length > 0
                ? 'has-args'
                : ''
            }`}
            data-id={buttonOptions.dataId}
            data-bs-title={buttonOptions.title}
            style={{ pointerEvents: 'none', width: 100 }}
          >
            {title}
          </button>
        </div>
        <input
          disabled
          className="instance-input w-100 p-2 border-0 rounded-end"
          data-id={'multiParamManagerBasicInputField'}
          placeholder={inputs}
          data-bs-title={inputs}
          style={{
            height: '2rem',
            visibility: !(
              props.funcABI.inputs && props.funcABI.inputs.length > 0
            )
              ? 'hidden'
              : 'visible',
          }}
        />
      </div>
      <div className="p-2">
        <textarea
          data-id={`functionInstructions${props.funcId}`}
          className="form-control"
          placeholder={intl.formatMessage({ id: 'quickDapp.functionInstructions' })}
          value={props.funcABI.details}
          onChange={({ target: { value } }) => {
            saveDetails({ id: props.funcABI.id, details: value });
          }}
        />
      </div>
    </div>
  );
}
