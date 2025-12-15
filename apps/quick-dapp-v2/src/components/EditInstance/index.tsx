import React, { useContext } from 'react';
import { omitBy } from 'lodash';
import { useIntl } from 'react-intl';
import { AppContext } from '../../contexts';
import ImageUpload from '../ImageUpload';

function EditInstance(): JSX.Element {
  const intl = useIntl();
  const { appState, dispatch } = useContext(AppContext);
  
  const { title, details, userInput, natSpec } = appState.instance;

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="mb-3">
            <ImageUpload />
        </div>
        <div className="col-12 ps-0">
          <div className="mb-3 p-3 bg-light border rounded">
            <label className="form-label fw-bold">Dapp Title</label>
            <input
              data-id="dappTitle"
              className="form-control"
              placeholder={intl.formatMessage({ id: 'quickDapp.dappTitle' })}
              value={title}
              onChange={({ target: { value } }) => {
                dispatch({
                  type: 'SET_INSTANCE',
                  payload: {
                    title: natSpec.checked && !value ? natSpec.title : value,
                    userInput: omitBy(
                      { ...userInput, title: value },
                      (item) => item === ''
                    ),
                  },
                });
              }}
            />
          </div>
          <div className="mb-3 p-3 bg-light border rounded">
            <label className="form-label fw-bold">Description / Instructions</label>
            <textarea
              data-id="dappInstructions"
              className="form-control"
              rows={4}
              placeholder={intl.formatMessage({ id: 'quickDapp.dappInstructions' })}
              value={details}
              onChange={({ target: { value } }) => {
                dispatch({
                  type: 'SET_INSTANCE',
                  payload: {
                    details: natSpec.checked && !value ? natSpec.details : value,
                    userInput: omitBy(
                      { ...userInput, details: value },
                      (item) => item === ''
                    ),
                  },
                });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditInstance;