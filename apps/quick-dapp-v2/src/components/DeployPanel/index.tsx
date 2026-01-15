import React, { useContext, useState, useRef, useEffect } from 'react';
import { Form, Button, Alert, Card, Collapse, Spinner } from 'react-bootstrap';
import { ethers } from 'ethers';
import { FormattedMessage, useIntl } from 'react-intl';
import { AppContext } from '../../contexts';
import { readDappFiles } from '../EditHtmlTemplate';
import { InBrowserVite } from '../../InBrowserVite';
import remixClient from '../../remix-client';
import { trackMatomoEvent } from '@remix-api';

import BaseAppWizard from './BaseAppWizard';

const REMIX_ENDPOINT_IPFS = 'https://quickdapp-ipfs.api.remix.live';
const REMIX_ENDPOINT_ENS = 'https://quickdapp-ens.api.remix.live';

function DeployPanel(): JSX.Element {
  const intl = useIntl();
  const { appState, dispatch, dappManager } = useContext(AppContext);
  const { activeDapp } = appState;
  const { title, details, logo } = appState.instance;

  const [deployResult, setDeployResult] = useState({ 
    cid: activeDapp?.deployment?.ipfsCid || '', 
    gatewayUrl: activeDapp?.deployment?.gatewayUrl || '', 
    error: '' 
  });
  
  const [ensName, setEnsName] = useState('');
  const [ensResult, setEnsResult] = useState({ 
    success: activeDapp?.deployment?.ensDomain ? `Linked: ${activeDapp.deployment.ensDomain}` : '', 
    error: '', 
    txHash: '', 
    domain: activeDapp?.deployment?.ensDomain || '' 
  });
  
  const [isDeploying, setIsDeploying] = useState(false);
  const [isEnsLoading, setIsEnsLoading] = useState(false);
  
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(true);
  const [isEnsOpen, setIsEnsOpen] = useState(true);
  
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeDapp?.deployment) {
      setDeployResult(prev => ({
        ...prev,
        cid: activeDapp.deployment?.ipfsCid || prev.cid,
        gatewayUrl: activeDapp.deployment?.gatewayUrl || prev.gatewayUrl
      }));
      if (activeDapp.deployment.ensDomain) {
        setEnsResult(prev => ({
          ...prev,
          success: `Linked: ${activeDapp.deployment.ensDomain}`,
          domain: activeDapp.deployment.ensDomain!
        }));
      }
    }
  }, [activeDapp?.id, activeDapp?.deployment]);

  if (activeDapp?.config?.isBaseMiniApp) {
    return <BaseAppWizard />;
  }


  const handleSaveConfig = async () => {
    if (!dappManager || !activeDapp) return;
    setIsSavingConfig(true);
    try {
      const updatedConfig = await dappManager.updateDappConfig(activeDapp.slug, {
        config: { 
          ...activeDapp.config, 
          title: title || '', 
          details: details || '', 
          logo: logo || undefined 
        }
      });
      if (updatedConfig) {
        dispatch({ type: 'SET_ACTIVE_DAPP', payload: updatedConfig });
        // @ts-ignore
        await remixClient.call('notification', 'toast', 'Configuration saved successfully!');
      }
    } catch (e: any) {
      console.error("Save failed", e);
      // @ts-ignore
      await remixClient.call('notification', 'toast', 'Failed to save configuration: ' + e.message);
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
            dispatch({ type: 'SET_INSTANCE', payload: { logo: reader.result } });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveLogo = () => {
    dispatch({ type: 'SET_INSTANCE', payload: { logo: null } });
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleIpfsDeploy = async () => {
    if (!activeDapp) return;
    setDeployResult({ cid: '', gatewayUrl: '', error: '' });
    setIsDeploying(true);

    trackMatomoEvent(remixClient, {
      category: 'quick-dapp-v2',
      action: 'deploy_ipfs',
      name: 'start',
      isClick: true
    });

    let builder: InBrowserVite;
    
    try {
      builder = new InBrowserVite();
      await builder.initialize();
      const dappRootPath = `dapps/${activeDapp.slug}`;
      const filesMap = new Map<string, string>();
      await readDappFiles(dappRootPath, filesMap, dappRootPath.length);

      if (filesMap.size === 0) throw new Error("No DApp files found");
      
      const jsResult = await builder.build(filesMap, '/src/main.jsx');
      if (!jsResult.success) throw new Error(`Build failed: ${jsResult.error}`);

      let indexHtmlContent = filesMap.get('/index.html') || '';
      
      let logoDataUrl = '';
      if (logo && typeof logo === 'string' && logo.startsWith('data:image')) {
        logoDataUrl = logo;
      }

      const injectionScript = `<script>window.__QUICK_DAPP_CONFIG__={logo:"${logoDataUrl}",title:${JSON.stringify(title||'')},details:${JSON.stringify(details||'')}};</script>`;
      
      let modifiedHtml = indexHtmlContent;
      if (modifiedHtml.includes('</head>')) modifiedHtml = modifiedHtml.replace('</head>', `${injectionScript}\n</head>`);
      else modifiedHtml = `<html><head>${injectionScript}</head>${modifiedHtml}</html>`;
      
      const inlineScript = `<script type="module">\n${jsResult.js}\n</script>`;
      modifiedHtml = modifiedHtml.replace(/<script type="module"[^>]*src="(?:\/|\.\/)?src\/main\.jsx"[^>]*><\/script>/, inlineScript);
      modifiedHtml = modifiedHtml.replace(/<link rel="stylesheet"[^>]*href="(?:\/|\.\/)?src\/index\.css"[^>]*>/, '');

      const formData = new FormData();
      const htmlBlob = new Blob([modifiedHtml], { type: 'text/html' });
      formData.append('files', htmlBlob, 'index.html');


      const response = await fetch(`${REMIX_ENDPOINT_IPFS}/upload`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      setDeployResult({ cid: data.ipfsHash, gatewayUrl: data.gatewayUrl, error: '' });

      trackMatomoEvent(remixClient, {
        category: 'quick-dapp-v2',
        action: 'deploy_ipfs',
        name: 'success',
        isClick: false
      });

      if (dappManager) {
        const newConfig = await dappManager.updateDappConfig(activeDapp.slug, {
          status: 'deployed',
          lastDeployedAt: Date.now(),
          deployment: { ...activeDapp.deployment, ipfsCid: data.ipfsHash, gatewayUrl: data.gatewayUrl },
          config: { ...activeDapp.config, title: title || '', details: details || '', logo: logoDataUrl || undefined }
        });
        if (newConfig) dispatch({ type: 'SET_ACTIVE_DAPP', payload: newConfig });
      }

    } catch (e: any) {
      console.error(e);
      setDeployResult({ cid: '', gatewayUrl: '', error: `Upload failed: ${e.message}` });
    } finally {
      setIsDeploying(false);
    }
  };

  // ---------------------------------------------------------------------------
  // [Render] Standard UI
  // ---------------------------------------------------------------------------

  const renderEditForm = () => (
    <div className="mb-3">
      <Form.Group className="mb-3">
        <Form.Label className="text-uppercase mb-0 form-label">Dapp logo</Form.Label>
        <Form.Control ref={logoInputRef} type="file" accept="image/*" onChange={handleImageChange} className="mt-1" />
        {logo && typeof logo === 'string' && (
          <div className="mt-2 mb-2 position-relative d-inline-block border bg-white rounded p-1">
            <img src={logo} alt="Preview" style={{height: '60px', maxWidth: '100%', objectFit: 'contain'}} onError={(e)=>e.currentTarget.style.display='none'}/>
            <span onClick={handleRemoveLogo} style={{cursor:'pointer', position: 'absolute', top: -10, right: -10}} className="badge bg-danger rounded-circle"><i className="fas fa-times"></i></span>
          </div>
        )}
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label className="text-uppercase mb-0 form-label">Dapp Title</Form.Label>
        <Form.Control value={title} onChange={({ target: { value } }) => dispatch({ type: 'SET_INSTANCE', payload: { title: value } })} />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label className="text-uppercase mb-0 form-label">Dapp Description</Form.Label>
        <Form.Control as="textarea" rows={3} value={details} onChange={({ target: { value } }) => dispatch({ type: 'SET_INSTANCE', payload: { details: value } })} />
      </Form.Group>
      
      <div className="d-grid">
        <Button variant="primary" className="w-100" onClick={handleSaveConfig} disabled={isSavingConfig}>
          {isSavingConfig ? <><Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" /> Saving...</> : 'Save Configuration'}
        </Button>
      </div>
    </div>
  );

  const displayCid = deployResult.cid || activeDapp?.deployment?.ipfsCid;
  const displayGateway = deployResult.gatewayUrl || activeDapp?.deployment?.gatewayUrl;
  const displayEnsSuccess = ensResult.success || (activeDapp?.deployment?.ensDomain ? `Linked: ${activeDapp.deployment.ensDomain}` : '');
  const ensButtonText = isEnsLoading ? (displayEnsSuccess ? 'Updating...' : 'Registering...') : (displayEnsSuccess ? 'Update Content Hash' : 'Register Subdomain');
  const currentEnsDomain = ensResult.domain || activeDapp?.deployment?.ensDomain;

  return (
    <div>
      {/* 1. Dapp Details Panel */}
      <Card className="mb-2">
        <Card.Header onClick={() => setIsDetailsOpen(!isDetailsOpen)} style={{ cursor: 'pointer' }} className="d-flex justify-content-between bg-transparent border-0">
          Dapp details <i className={`fas ${isDetailsOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
        </Card.Header>
        <Collapse in={isDetailsOpen}>
          <Card.Body>
            {renderEditForm()}
          </Card.Body>
        </Collapse>
      </Card>
      
      {/* 2. IPFS Deploy Panel */}
      <Card className="mb-2">
        <Card.Header onClick={() => setIsPublishOpen(!isPublishOpen)} style={{ cursor: 'pointer' }} className="d-flex justify-content-between bg-transparent border-0">
          Publish to IPFS <i className={`fas ${isPublishOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
        </Card.Header>
        <Collapse in={isPublishOpen}>
          <Card.Body>
            <Button variant="primary" className="w-100" onClick={() => handleIpfsDeploy()} disabled={isDeploying}>
              {isDeploying ? <><i className="fas fa-spinner fa-spin me-1"></i> Uploading...</> : <FormattedMessage id="quickDapp.deployToIPFS" defaultMessage="Deploy to IPFS" />}
            </Button>
            {displayCid && (
              <Alert variant="success" className="mt-3" style={{ wordBreak: 'break-all' }}>
                <div className="fw-bold">Deployed Successfully!</div>
                <div><strong>CID:</strong> {displayCid}</div>
                {displayGateway && <div className="mt-1"><a href={displayGateway} target="_blank" rel="noopener noreferrer">View DApp</a></div>}
              </Alert>
            )}
            {deployResult.error && <Alert variant="danger" className="mt-3 small">{deployResult.error}</Alert>}
          </Card.Body>
        </Collapse>
      </Card>

      {/* 3. ENS Panel (Arbitrum) */}
      {displayCid && (
        <Card className="mb-2">
          <Card.Header onClick={() => setIsEnsOpen(!isEnsOpen)} style={{ cursor: 'pointer' }} className="d-flex justify-content-between bg-transparent border-0">
            Register ENS (Arbitrum) <i className={`fas ${isEnsOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
          </Card.Header>
          <Collapse in={isEnsOpen}>
            <Card.Body>
              <Alert variant="info">Register <strong>.remixdapp.eth</strong> on Arbitrum.</Alert>
              <Form.Group className="mb-2">
                <div className="input-group">
                  <Form.Control type="text" placeholder="myapp" value={ensName} onChange={(e) => {setEnsName(e.target.value.toLowerCase()); setEnsResult({...ensResult, success: ''})}} />
                  <span className="input-group-text">.remixdapp.eth</span>
                </div>
              </Form.Group>
              <Button variant="secondary" className="w-100" onClick={() => {
                const targetCid = deployResult.cid || activeDapp?.deployment?.ipfsCid;
                if(!targetCid) return;
                setIsEnsLoading(true);
                setEnsResult({success:'', error:'', txHash:'', domain:''});
                
                trackMatomoEvent(remixClient, {
                  category: 'quick-dapp-v2',
                  action: 'register_ens',
                  name: 'start',
                  isClick: true
                });

                (async () => {
                  try {
                    if (typeof window.ethereum === 'undefined') throw new Error("MetaMask missing");
                    const provider = new ethers.BrowserProvider(window.ethereum as any);
                    const accounts = await provider.send('eth_requestAccounts', []);
                    const response = await fetch(`${REMIX_ENDPOINT_ENS}/register`, {
                      method: 'POST', headers: {'Content-Type':'application/json'},
                      body: JSON.stringify({ label: ensName, owner: accounts[0], contentHash: targetCid })
                    });
                    const data = await response.json();
                    if(!response.ok) throw new Error(data.error);
                    setEnsResult({success:'Success!', error:'', txHash:data.txHash, domain:data.domain});
                    trackMatomoEvent(remixClient, {
                      category: 'quick-dapp-v2',
                      action: 'register_ens',
                      name: 'success',
                      isClick: false
                    });
                    if(dappManager) {
                      const newConfig = await dappManager.updateDappConfig(activeDapp.slug, {deployment:{...activeDapp.deployment, ensDomain: data.domain}});
                      if(newConfig) dispatch({type:'SET_ACTIVE_DAPP', payload:newConfig});
                    }
                  } catch(e:any) { setEnsResult(prev=>({...prev, error: e.message})) } 
                  finally { setIsEnsLoading(false) }
                })();
              }} disabled={isEnsLoading || !ensName}>{isEnsLoading ? 'Processing...' : ensButtonText}</Button>
              {currentEnsDomain && (
                <Alert variant="success" className="mt-3" style={{ wordBreak: 'break-all' }}>
                  <div className="fw-bold mb-1">
                    <i className="fas fa-check-circle me-2"></i>ENS Linked!
                  </div>
                  <div>
                    <a 
                      href={`https://${currentEnsDomain}.limo`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-decoration-underline fw-bold"
                    >
                      https://{currentEnsDomain}.limo
                    </a>
                  </div>
                  {ensResult.txHash && (
                    <div className="mt-2 small">
                      <span className="text-muted">Tx: </span>
                      <a 
                        href={`https://arbiscan.io/tx/${ensResult.txHash}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-muted text-decoration-none"
                      >
                        View on Explorer <i className="fas fa-external-link-alt small"></i>
                      </a>
                    </div>
                  )}
                </Alert>
              )}
              {ensResult.error && <Alert variant="danger" className="mt-3">{ensResult.error}</Alert>}
            </Card.Body>
          </Collapse>
        </Card>
      )}
    </div>
  );
}

export default DeployPanel;