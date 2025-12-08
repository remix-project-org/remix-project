import React, { useContext, useState, useRef } from 'react';
import { Form, Button, Alert, Card, Collapse } from 'react-bootstrap';
import { ethers } from 'ethers';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  emptyInstance,
  resetInstance,
} from '../../actions';
import { AppContext } from '../../contexts';
import { readDappFiles } from '../EditHtmlTemplate';
import { InBrowserVite } from '../../InBrowserVite';
import { trackMatomoEvent } from '@remix-api'

// const REMIX_ENDPOINT_IPFS = 'http://localhost:4000/quickdapp-ipfs';
// const REMIX_ENDPOINT_ENS = 'http://localhost:4000/ens-service';
const REMIX_ENDPOINT_IPFS = 'https://quickdapp-ipfs.api.remix.live';
const REMIX_ENDPOINT_ENS = 'https://quickdapp-ens.api.remix.live';

function DeployPanel(): JSX.Element {
  const intl = useIntl()
  const { appState, dispatch } = useContext(AppContext);
  const { title, details, logo } = appState.instance; 
  
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployResult, setDeployResult] = useState({ cid: '', gatewayUrl: '', error: '' }); 

  const [ensName, setEnsName] = useState('');
  const [isEnsLoading, setIsEnsLoading] = useState(false);
  const [ensResult, setEnsResult] = useState({ success: '', error: '', txHash: '', domain: '' });

  const [isDetailsOpen, setIsDetailsOpen] = useState(true);
  const [isPublishOpen, setIsPublishOpen] = useState(true);
  const [isEnsOpen, setIsEnsOpen] = useState(true);
  const [ensError, setEnsError] = useState('');

  const logoInputRef = useRef<HTMLInputElement>(null);

  const validateEnsName = (name: string) => {
    const regex = /^[a-z0-9-]+$/;
    
    if (!name) return '';
    if (name.length < 3) return 'Name must be at least 3 characters.';
    if (!regex.test(name)) return 'Only lowercase letters, numbers, and hyphens are allowed.';
    if (name.startsWith('-') || name.endsWith('-')) return 'Name cannot start or end with a hyphen.';
    
    return '';
  };

  const handleRemoveLogo = () => {
    dispatch({ type: 'SET_INSTANCE', payload: { logo: null } });
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
  };

  const handleImageChange = (e: any) => {
    if (e.target.files && e.target.files[0]) {
      const reader: any = new FileReader()
      reader.onloadend = () => {
        dispatch({ type: 'SET_INSTANCE', payload: { logo: reader.result } })
      }
      reader.readAsArrayBuffer(e.target.files[0])
    }
  }

  const handleIpfsDeploy = async () => {
    setIsDeploying(true);
    setDeployResult({ cid: '', gatewayUrl: '', error: '' });

    let builder: InBrowserVite;
    let jsResult: { js: string; success: boolean; error?: string };
    let filesMap: Map<string, string>;

    try {
      builder = new InBrowserVite();
      await builder.initialize();

      filesMap = new Map<string, string>();
      await readDappFiles('dapp', filesMap);

      if (filesMap.size === 0) {
        throw new Error("No DApp files");
      }

      jsResult = await builder.build(filesMap, '/src/main.jsx');
      if (!jsResult.success) {
        throw new Error(`DApp build failed: ${jsResult.error}`);
      }

    } catch (e: any) {
      console.error(e);
      setDeployResult({ cid: '', gatewayUrl: '', error: `Build failed: ${e.message}` });
      setIsDeploying(false);
      return;
    }

    try {

      trackMatomoEvent(this, {
        category: 'quick-dapp-v2',
        action: 'deploy_ipfs',
        name: 'start',
        isClick: true
      })

      const indexHtmlContent = filesMap.get('/index.html');
      if (!indexHtmlContent) {
        throw new Error("Cannot find index.html");
      }

      let modifiedHtml = indexHtmlContent;

      let logoDataUrl = '';
      if (logo && logo.byteLength > 0) {
        try {
          const base64data = btoa(
            new Uint8Array(logo).reduce((data, byte) => data + String.fromCharCode(byte), '')
          );
          logoDataUrl = 'data:image/jpeg;base64,' + base64data;
        } catch (err) {
          console.error('Logo conversion failed during deploy:', err);
        }
      }

      const injectionScript = `
        <script>
          window.__QUICK_DAPP_CONFIG__ = {
            logo: "${logoDataUrl}",
            title: ${JSON.stringify(title || '')},
            details: ${JSON.stringify(details || '')}
          };
        </script>
      `;
      modifiedHtml = modifiedHtml.replace('</head>', `${injectionScript}\n</head>`);
      
      const inlineScript = `<script type="module">\n${jsResult.js}\n</script>`;
      modifiedHtml = modifiedHtml.replace(
        /<script type="module"[^>]*src="(?:\/|\.\/)?src\/main\.jsx"[^>]*><\/script>/, 
        inlineScript
      );
      
      modifiedHtml = modifiedHtml.replace(
        /<link rel="stylesheet"[^>]*href="(?:\/|\.\/)?src\/index\.css"[^>]*>/, 
        ''
      );

      const formData = new FormData();
      const blob = new Blob([modifiedHtml], { type: 'text/html' });
      formData.append('file', blob, 'index.html');

      const response = await fetch(`${REMIX_ENDPOINT_IPFS}/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Server Error: ${errText}`);
      }

      const data = await response.json();
      
      setDeployResult({ 
        cid: data.ipfsHash, 
        gatewayUrl: data.gatewayUrl,
        error: '' 
      });

      trackMatomoEvent(this, {
        category: 'quick-dapp-v2',
        action: 'deploy_ipfs',
        name: 'success',
        isClick: false
      })
    } catch (e: any) {
      console.error(e);
      setDeployResult({ cid: '', gatewayUrl: '', error: `Upload failed: ${e.message}` });
    } finally {
      setIsDeploying(false);
    }
  };
  
  const handleEnsLink = async () => {
    setIsEnsLoading(true);
    setEnsResult({ success: '', error: '', txHash: '', domain: '' });

    const label = ensName.trim().toLowerCase();
    
    const validationError = validateEnsName(label);
    if (validationError) {
        setEnsError(validationError);
        return;
    }

    if (!label || !deployResult.cid) {
      setEnsResult({ ...ensResult, error: 'ENS label or IPFS CID is missing.' });
      setIsEnsLoading(false);
      return;
    }
    
    if (typeof window.ethereum === 'undefined') {
      setEnsResult({ ...ensResult, error: 'MetaMask is required to verify ownership.' });
      setIsEnsLoading(false);
      return;
    }

    try {
      trackMatomoEvent(this, {
        category: 'quick-dapp-v2',
        action: 'register_ens',
        name: 'start',
        isClick: true
      })
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const accounts = await provider.send('eth_requestAccounts', []);
      const ownerAddress = accounts[0];

      const response = await fetch(`${REMIX_ENDPOINT_ENS}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          label: label,
          owner: ownerAddress,
          contentHash: deployResult.cid
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }

      setEnsResult({
        success: `Successfully registered!`,
        error: '',
        txHash: data.txHash,
        domain: data.domain
      });

      trackMatomoEvent(this, {
        category: 'quick-dapp-v2',
        action: 'register_ens',
        name: 'success',
        isClick: false
      })
    } catch (e: any) {
      console.error(e);
      setEnsResult({ ...ensResult, error: `ENS Error: ${e.message}` });
    } finally {
      setIsEnsLoading(false);
    }
  };

  return (
    <div>
      {/* Dapp Details Card */}
      <Card className="mb-2">
        <Card.Header
          onClick={() => setIsDetailsOpen(!isDetailsOpen)}
          style={{ cursor: 'pointer' }}
          className="d-flex justify-content-between bg-transparent border-0"
        >
          Dapp details
          <i className={`fas ${isDetailsOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
        </Card.Header>
        <Collapse in={isDetailsOpen}>
          <Card.Body>
            <Form.Group className="mb-3">
              <Form.Label className="text-uppercase mb-0">Dapp logo</Form.Label>
              {logo && logo.byteLength > 0 && (
                <span onClick={handleRemoveLogo} style={{ cursor: 'pointer' }} className="ms-2 text-danger">
                  <i className="fas fa-trash"></i>
                </span>
              )}
              <Form.Control ref={logoInputRef} type="file" accept="image/*" onChange={handleImageChange} />
              <Form.Text className="text-muted">64x64px (Optional)</Form.Text>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="text-uppercase mb-0">Dapp Title</Form.Label>
              <Form.Control
                placeholder={intl.formatMessage({ id: 'quickDapp.dappTitle' })}
                value={title}
                onChange={({ target: { value } }) => dispatch({ type: 'SET_INSTANCE', payload: { title: value } })}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label className="text-uppercase mb-0">Dapp Description</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                placeholder={intl.formatMessage({ id: 'quickDapp.dappInstructions' })}
                value={details}
                onChange={({ target: { value } }) => dispatch({ type: 'SET_INSTANCE', payload: { details: value } })}
              />
            </Form.Group>
          </Card.Body>
        </Collapse>
      </Card>
      
      {/* Publish Settings Card */}
      <Card className="mb-2">
        <Card.Header
          onClick={() => setIsPublishOpen(!isPublishOpen)}
          style={{ cursor: 'pointer' }}
          className="d-flex justify-content-between bg-transparent border-0"
        >
          Publish to IPFS
          <i className={`fas ${isPublishOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
        </Card.Header>
        <Collapse in={isPublishOpen}>
          <Card.Body>
            <Alert variant="info">
              <i className="fas fa-info-circle me-2"></i>
              Deploy your DApp to IPFS using Remix's gateway. No personal IPFS keys required.
            </Alert>
              
            <Button
              variant="primary"
              className="w-100"
              onClick={handleIpfsDeploy}
              disabled={isDeploying}
            >
              {isDeploying ? (
                <><i className="fas fa-spinner fa-spin me-1"></i> Uploading to IPFS...</>
              ) : (
                <FormattedMessage id="quickDapp.deployToIPFS" defaultMessage="Deploy to IPFS" />
              )}
            </Button>

            {deployResult.cid && (
              <Alert variant="success" className="mt-3" style={{ wordBreak: 'break-all' }}>
                <div className="fw-bold">Deployed Successfully!</div>
                <div><strong>CID:</strong> {deployResult.cid}</div>
                <div className="mt-1">
                  <strong>Domain:</strong> <a href={deployResult.gatewayUrl} target="_blank" rel="noopener noreferrer">View DApp</a>
                </div>
              </Alert>
            )}
            {deployResult.error && (
              <Alert variant="danger" className="mt-3 small">
                {deployResult.error}
              </Alert>
            )}
          </Card.Body>
        </Collapse>
      </Card>

      {/* ENS Linking Card */}
      {deployResult.cid && (
        <Card className="mb-2">
          <Card.Header
            onClick={() => setIsEnsOpen(!isEnsOpen)}
            style={{ cursor: 'pointer' }}
            className="d-flex justify-content-between bg-transparent border-0"
          >
            Register ENS (Arbitrum)
            <i className={`fas ${isEnsOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
          </Card.Header>
          <Collapse in={isEnsOpen}>
            <Card.Body>
              <Alert variant="info">
                <i className="fas fa-gas-pump me-2"></i>
                Register a <strong>.remixdapp.eth</strong> subdomain on Arbitrum. 
                Remix covers the gas fees!
              </Alert>
              <Form.Group className="mb-2">
                <Form.Label className="text-uppercase mb-0">Subdomain Label</Form.Label>
                <div className="input-group">
                  <Form.Control 
                    type="text" 
                    placeholder="myapp" 
                    value={ensName} 
                    onChange={(e) => {
                      const val = e.target.value.toLowerCase();
                      setEnsName(val);
                      const errorMsg = validateEnsName(val);
                      setEnsError(errorMsg);
                      if (ensResult.success || ensResult.error) {
                        setEnsResult({ success: '', error: '', txHash: '', domain: '' });
                      }
                    }}
                    isInvalid={!!ensError}
                  />
                  <span className="input-group-text">.remixdapp.eth</span>
                </div>
                {ensError && (
                  <Form.Text className="text-danger">
                    <i className="fas fa-exclamation-circle me-1"></i>
                    {ensError}
                  </Form.Text>
                )}
                {!ensError && ensName && !ensResult.success && (
                  <Form.Text className="text-success">
                    <i className="fas fa-check-circle me-1"></i>
                    Valid name format
                  </Form.Text>
                )}
              </Form.Group>

              <Button 
                variant="secondary" 
                className="w-100" 
                onClick={handleEnsLink} 
                disabled={isEnsLoading || !ensName || !!ensError}
              >
                {isEnsLoading ? (
                  <><i className="fas fa-spinner fa-spin me-1"></i> Registering...</>
                ) : (
                  'Register Subdomain'
                )}
              </Button>

              {ensResult.success && (
                <Alert variant="success" className="mt-3">
                  <div>{ensResult.success}</div>
                  <div className="mt-1">
                    <strong>Domain:</strong> <a href={`https://${ensResult.domain}.limo`} target="_blank" rel="noreferrer">{ensResult.domain}</a>
                  </div>
                </Alert>
              )}
              {ensResult.error && (
                <Alert variant="danger" className="mt-3 small">{ensResult.error}</Alert>
              )}

            </Card.Body>
          </Collapse>
        </Card>
      )}

      <div className="mt-3">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => { resetInstance(); handleRemoveLogo(); }}
        >
          <FormattedMessage id="quickDapp.resetFunctions" />
        </Button>
        <Button
          size="sm"
          variant="danger"
          className="ms-3"
          onClick={() => { emptyInstance(); }}
        >
          <FormattedMessage id="quickDapp.deleteDapp" />
        </Button>
      </div>

    </div>
  );
}

export default DeployPanel;