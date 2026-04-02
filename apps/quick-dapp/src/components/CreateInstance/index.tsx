import React, { useState } from 'react';
import { Alert, Button, Form } from 'react-bootstrap';
import { FormattedMessage, useIntl } from 'react-intl';
import { initInstance } from '../../actions';

const CreateInstance: React.FC = () => {
  const intl = useIntl()
  const [formVal, setFormVal] = useState({
    address: '',
    abi: [],
    name: '',
    network: '',
  });
  const [error, setError] = useState('')
  return (
    <Form
      className="w-1/2 m-auto"
      onSubmit={(e: any) => {
        e.preventDefault();
        initInstance({ ...formVal });
      }}
    >
      <Form.Group className="mb-2" controlId="formAddress">
        <Form.Label className="uppercase mb-0"><FormattedMessage id="quickDapp.address" /></Form.Label>
        <Form.Control
          type="address"
          placeholder={intl.formatMessage({ id: 'quickDapp.enterAddress' })}
          value={formVal.address}
          onChange={(e) => {
            setFormVal({ ...formVal, address: e.target.value });
          }}
        />
      </Form.Group>

      <Form.Group className="mb-2" controlId="formAbi">
        <Form.Label className="uppercase mb-0">abi</Form.Label>
        <Form.Control
          as="textarea"
          rows={3}
          type="abi"
          placeholder={intl.formatMessage({ id: 'quickDapp.enterAbi' })}
          onChange={(e) => {
            setError('')
            let abi = [];
            if (e.target.value !== '') {
              try {
                abi = JSON.parse(e.target.value);
              } catch (error) {
                setError(error.toString())
              }
            }
            setFormVal({ ...formVal, abi });
          }}
        />
        {error && <Form.Text className='text-danger'>
          {error}
        </Form.Text>}
      </Form.Group>

      <Form.Group className="mb-2" controlId="formName">
        <Form.Label className="uppercase mb-0"><FormattedMessage id="quickDapp.name" /></Form.Label>
        <Form.Control
          type="name"
          placeholder={intl.formatMessage({ id: 'quickDapp.enterName' })}
          value={formVal.name}
          onChange={(e) => {
            setFormVal({ ...formVal, name: e.target.value });
          }}
        />
      </Form.Group>

      <Form.Group className="mb-2" controlId="formNetwork">
        <Form.Label className="uppercase mb-0"><FormattedMessage id="quickDapp.network" /></Form.Label>
        <Form.Control
          type="network"
          placeholder={intl.formatMessage({ id: 'quickDapp.enterNetwork' })}
          value={formVal.network}
          onChange={(e) => {
            setFormVal({ ...formVal, network: e.target.value });
          }}
        />
      </Form.Group>
      <Button
        variant="primary"
        type="submit"
        className="mt-2"
        data-id="createDapp"
        disabled={
          !formVal.address ||
          !formVal.name ||
          !formVal.network ||
          !formVal.abi.length
        }
      >
        <FormattedMessage id="quickDapp.submit" />
      </Button>
      <Alert className="mt-4" variant="info" data-id="quickDappTooltips">
        <FormattedMessage id="quickDapp.text1" />
        <br />
        <FormattedMessage id="quickDapp.text2" />
      </Alert>
      <img src='./assets/edit-dapp.png' />
    </Form>
  );
};

export default CreateInstance;
