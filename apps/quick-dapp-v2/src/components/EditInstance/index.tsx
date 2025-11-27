import { useContext } from 'react';
import { omitBy } from 'lodash';
import { useIntl } from 'react-intl';
import { MultipleContainers } from '../MultipleContainers';
import { AppContext } from '../../contexts';
import ImageUpload from '../ImageUpload'

function EditInstance(): JSX.Element {
  const intl = useIntl()
  const { appState, dispatch } = useContext(AppContext);
  const { abi, items, containers, title, details, userInput, natSpec } =
    appState.instance;
  return (
    <div className="col-9 d-inline-block row">
      <div className="row">
        <ImageUpload />
        <div className="col-9 ps-0">
          <div className="my-2 p-3 bg-light">
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
          <div className="my-2 p-3 bg-light">
            <textarea
              data-id="dappInstructions"
              className="form-control"
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
      <MultipleContainers
        abi={abi}
        items={items}
        containers={containers}
        setItemsAndContainers={(
          newItems: any = items,
          newContainers: any = containers
        ) => {
          dispatch({
            type: 'SET_INSTANCE',
            payload: {
              items: newItems,
              containers: newContainers,
            },
          });
        }}
        handle
        scrollable
        containerStyle={{
          maxHeight: '90vh',
        }}
      />
    </div>
  );
}

export default EditInstance;
