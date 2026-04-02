import React, { useContext, useState, useEffect } from 'react';
import { Form, Button, Alert, InputGroup } from 'react-bootstrap';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  deploy,
  teardown,
  emptyInstance,
  resetInstance,
  getInfoFromNatSpec,
} from '../../actions';
import { ThemeUI } from './theme';
import { CustomTooltip } from '@remix-ui/helper';
import { AppContext } from '../../contexts';

function DeployPanel(): JSX.Element {
  const intl = useIntl()
  const { appState, dispatch } = useContext(AppContext);
  const { verified, natSpec, noTerminal } = appState.instance;
  const [formVal, setFormVal] = useState<any>({
    email: localStorage.getItem('__SURGE_EMAIL') || '',
    password: localStorage.getItem('__SURGE_PASSWORD') || '',
    subdomain: '',
    shortname: localStorage.getItem('__DISQUS_SHORTNAME') || '',
    shareTo: [],
  });
  const setShareTo = (type: string) => {
    let shareTo = formVal.shareTo;
    if (formVal.shareTo.includes(type)) {
      shareTo = shareTo.filter((item: string) => item !== type);
    } else {
      shareTo.push(type);
    }
    setFormVal({ ...formVal, shareTo });
  };
  const [deployState, setDeployState] = useState({
    code: '',
    error: '',
    loading: false,
  });
  const [teardownState, setTeardownState] = useState({
    code: '',
    error: '',
    loading: false,
  });

  useEffect(() => {
    window.scrollTo(0, document.body.scrollHeight);
  }, [deployState, teardownState])

  return (
    <div className="col-3 inline-block">
      <h3 className="mb-3" data-id="quick-dapp-admin">QuickDapp <FormattedMessage id="quickDapp.admin" /></h3>
      <Button
        size="sm"
        style={{ height: 32 }}
        data-id="resetFunctions"
        onClick={() => {
          resetInstance();
        }}
      >
        <FormattedMessage id="quickDapp.resetFunctions" />
      </Button>
      <Button
        size="sm"
        style={{ height: 32, width: 100 }}
        data-id="deleteDapp"
        className="ml-3"
        onClick={() => {
          emptyInstance();
        }}
      >
        <FormattedMessage id="quickDapp.deleteDapp" />
      </Button>
      <Alert variant="info" className="my-2">
        <FormattedMessage
          id="quickDapp.text3"
          values={{
            a: (chunks) => (
              <a target="_blank" href="https://surge.sh/help/">
                {chunks}
              </a>
            ),
          }}
        />
      </Alert>
      <Form
        onSubmit={(e) => {
          e.preventDefault();
          setDeployState({ code: '', error: '', loading: true });
          deploy(formVal, (state: any) => {
            setDeployState({ ...state, loading: false });
          });
        }}
      >
        <Form.Group className="mb-2" controlId="formEmail">
          <Form.Label className="uppercase mb-0"><FormattedMessage id="quickDapp.email" /></Form.Label>
          <Form.Control
            data-id="surgeEmail"
            type="email"
            placeholder={intl.formatMessage({ id: 'quickDapp.surgeEmail' })}
            required
            value={formVal.email}
            onChange={(e) => {
              setFormVal({ ...formVal, email: e.target.value });
            }}
          />
        </Form.Group>
        <Form.Group className="mb-2" controlId="formPassword">
          <Form.Label className="uppercase mb-0"><FormattedMessage id="quickDapp.password" /></Form.Label>
          <Form.Control
            data-id="surgePassword"
            type="password"
            placeholder={intl.formatMessage({ id: 'quickDapp.surgePassword' })}
            required
            value={formVal.password}
            onChange={(e) => {
              setFormVal({ ...formVal, password: e.target.value });
            }}
          />
        </Form.Group>
        <Form.Group className="mb-2" controlId="formPassword">
          <Form.Label className="uppercase mb-0"><FormattedMessage id="quickDapp.subdomain" /></Form.Label>
          <InputGroup>
            <InputGroup.Text>https://</InputGroup.Text>
            <Form.Control
              data-id="surgeSubdomain"
              type="subdomain"
              placeholder={intl.formatMessage({ id: 'quickDapp.uniqueSubdomain' })}
              required
              value={formVal.subdomain}
              onChange={(e) => {
                setFormVal({ ...formVal, subdomain: e.target.value });
              }}
            />
            <InputGroup.Text>.surge.sh</InputGroup.Text>
          </InputGroup>
        </Form.Group>
        {/* <Form.Group className="mb-3" controlId="formShortname">
          <Form.Label>Disqus Shortname (Optional)</Form.Label>
          <Form.Control
            type="shortname"
            placeholder="Disqus Shortname"
            value={formVal.shortname}
            onChange={(e) => {
              setFormVal({ ...formVal, shortname: e.target.value });
            }}
          />
        </Form.Group> */}
        <Form.Group className="mb-2" controlId="formShareTo">
          <Form.Label className="uppercase mb-0">
            <FormattedMessage id="quickDapp.shareTo" />
          </Form.Label>
          <br />
          <div className="inline-flex items-center form-check">
            <input
              id="shareToTwitter"
              className="form-check-input"
              type="checkbox"
              name="group1"
              value="twitter"
              onChange={(e) => {
                setShareTo(e.target.value);
              }}
              checked={formVal.shareTo.includes('twitter')}
            />

            <label
              htmlFor="shareToTwitter"
              className="m-0 form-check-label"
              style={{ paddingTop: 1 }}
            >
              Twitter
            </label>
          </div>
          <div className="inline-flex items-center form-check ml-3">
            <input
              id="shareToFacebook"
              className="form-check-input"
              type="checkbox"
              name="group1"
              value="facebook"
              onChange={(e) => {
                setShareTo(e.target.value);
              }}
              checked={formVal.shareTo.includes('facebook')}
            />

            <label
              htmlFor="shareToFacebook"
              className="m-0 form-check-label"
              style={{ paddingTop: 1 }}
            >
              Facebook
            </label>
          </div>
        </Form.Group>
        <Form.Group className="mb-2" controlId="formShareTo">
          <Form.Label className="uppercase mb-0">
            <FormattedMessage id="quickDapp.useNatSpec" />
          </Form.Label>
          <br />
          <span
            data-id="useNatSpec"
            id="useNatSpec"
            className="btn ai-switch pl-0 py-0"
            onClick={async () => {
              getInfoFromNatSpec(!natSpec.checked);
            }}
          >
            <CustomTooltip
              placement="top"
              tooltipText={intl.formatMessage({ id: 'quickDapp.useNatSpecTooltip' })}
            >
              <i
                className={
                  natSpec.checked
                    ? 'fas fa-toggle-on fa-lg'
                    : 'fas fa-toggle-off fa-lg'
                }
              ></i>
            </CustomTooltip>
          </span>
        </Form.Group>
        <Form.Group className="mb-2" controlId="formVerified">
          <Form.Label className="uppercase mb-0">
            <FormattedMessage id="quickDapp.verifiedByEtherscan" />
          </Form.Label>
          <div className="flex py-1 items-center form-check">
            <input
              id="verifiedByEtherscan"
              className="form-check-input"
              type="checkbox"
              onChange={(e) => {
                dispatch({
                  type: 'SET_INSTANCE',
                  payload: { verified: e.target.checked },
                });
              }}
              checked={verified}
            />

            <label
              htmlFor="verifiedByEtherscan"
              className="m-0 form-check-label"
              style={{ paddingTop: 1 }}
            >
              <FormattedMessage id="quickDapp.verified" />
            </label>
          </div>
        </Form.Group>
        <Form.Group className="mb-2" controlId="formNoTerminal">
          <Form.Label className="uppercase mb-0">
            <FormattedMessage id="quickDapp.noTerminal" />
          </Form.Label>
          <div className="flex py-1 items-center form-check">
            <input
              id="noTerminal"
              className="form-check-input"
              type="checkbox"
              onChange={(e) => {
                dispatch({
                  type: 'SET_INSTANCE',
                  payload: { noTerminal: e.target.checked },
                });
              }}
              checked={noTerminal}
            />

            <label
              htmlFor="noTerminal"
              className="m-0 form-check-label"
              style={{ paddingTop: 1 }}
            >
              <FormattedMessage id="quickDapp.no" />
            </label>
          </div>
        </Form.Group>
        <ThemeUI />
        <Button
          data-id="deployDapp"
          variant="primary"
          type="submit"
          className="mt-3"
          disabled={!formVal.email || !formVal.password || !formVal.subdomain}
        >
          {deployState.loading && (
            <i className="fas fa-spinner fa-spin mr-1"></i>
          )}
          <FormattedMessage id="quickDapp.deploy" />
        </Button>
        <Button
          data-id="teardownDapp"
          variant="primary"
          className="mt-3 ml-3"
          disabled={!formVal.email || !formVal.password || !formVal.subdomain}
          // hide this button for now, just for e2e use
          style={{ display: 'none' }}
          onClick={() => {
            setTeardownState({ code: '', error: '', loading: true });
            teardown(formVal, (state) => {
              setTeardownState({ ...state, loading: false });
            })
          }}
        >
          {teardownState.loading && (
            <i className="fas fa-spinner fa-spin mr-1"></i>
          )}
          <FormattedMessage id="quickDapp.teardown" />
        </Button>
        {deployState.code !== '' && (
          <Alert variant={deployState.code === 'SUCCESS' ? "success" : "danger"} className="mt-4" data-id="deployResult">
            {deployState.code === 'SUCCESS' ? <>
              <FormattedMessage id="quickDapp.text4" /> <br /> <FormattedMessage id="quickDapp.text5" />
              <br />
              <a
                data-id="dappUrl"
                target="_blank"
                href={`https://${formVal.subdomain}.surge.sh`}
              >{`https://${formVal.subdomain}.surge.sh`}</a>
            </> : deployState.error}
          </Alert>
        )}
        {teardownState.code !== '' && (
          <Alert variant={teardownState.code === 'SUCCESS' ? "success" : "danger"} className="mt-4" data-id="teardownResult">
            {teardownState.code === 'SUCCESS' ? <FormattedMessage id="quickDapp.text6" /> : teardownState.error}
          </Alert>
        )}
      </Form>
    </div>
  );
}

export default DeployPanel;
