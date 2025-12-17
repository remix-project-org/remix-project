import React, { useContext, useState, useRef, useEffect } from 'react';
import { Form, Button, Alert, Card, Collapse } from 'react-bootstrap';
import { ethers } from 'ethers';
import { FormattedMessage, useIntl } from 'react-intl';
import { AppContext } from '../../contexts';
import { readDappFiles } from '../EditHtmlTemplate';
import { InBrowserVite } from '../../InBrowserVite';
import remixClient from '../../remix-client';

// const REMIX_ENDPOINT_IPFS = 'https://quickdapp-ipfs.api.remix.live';
const REMIX_ENDPOINT_ENS = 'https://quickdapp-ens.api.remix.live';
const REMIX_ENDPOINT_IPFS = 'http://localhost:4000/quickdapp-ipfs';
// const REMIX_ENDPOINT_ENS = 'http://localhost:4000/ens-service';

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
  const [isEnsLoading, setIsEnsLoading] = useState(false);
  const [ensResult, setEnsResult] = useState({ 
    success: activeDapp?.deployment?.ensDomain ? `Linked: ${activeDapp.deployment.ensDomain}` : '', 
    error: '', txHash: '', domain: activeDapp?.deployment?.ensDomain || '' 
  });

  const [isDeploying, setIsDeploying] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(true);
  const [isEnsOpen, setIsEnsOpen] = useState(true);
  const [ensError, setEnsError] = useState('');

  const [associationJson, setAssociationJson] = useState('');
  const [isUpdatingManifest, setIsUpdatingManifest] = useState(false);
  const [isMiniAppSectionOpen, setIsMiniAppSectionOpen] = useState(true);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const miniAppSectionRef = useRef<HTMLDivElement>(null);

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
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader: any = new FileReader()
      reader.onloadend = () => {
        dispatch({ type: 'SET_INSTANCE', payload: { logo: reader.result } })
      }
      reader.readAsArrayBuffer(e.target.files[0])
    }
  }

  const handleIpfsDeploy = async (): Promise<string | null> => {
    if (!activeDapp) return null;
    setIsDeploying(true);
    setDeployResult({ cid: '', gatewayUrl: '', error: '' });

    let builder: InBrowserVite;
    let jsResult;
    let filesMap = new Map<string, string>();

    try {
      builder = new InBrowserVite();
      await builder.initialize();
      const dappRootPath = `dapps/${activeDapp.slug}`;
      await readDappFiles(dappRootPath, filesMap, dappRootPath.length);

      if (filesMap.size === 0) throw new Error("No DApp files");
      jsResult = await builder.build(filesMap, '/src/main.jsx');
      if (!jsResult.success) throw new Error(`Build failed: ${jsResult.error}`);

      let indexHtmlContent = filesMap.get('/index.html') || '';
      let logoDataUrl = logo || '';
      
      if (logo && logo.byteLength > 0 && typeof logo !== 'string') {
        try {
            const base64data = btoa(
                new Uint8Array(logo as ArrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );
            logoDataUrl = 'data:image/jpeg;base64,' + base64data;
        } catch (e) {}
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
      
      let modifiedHtml = indexHtmlContent;
      if (modifiedHtml.includes('</head>')) {
        modifiedHtml = modifiedHtml.replace('</head>', `${injectionScript}\n</head>`);
      } else {
        modifiedHtml = `<html><head>${injectionScript}</head>${modifiedHtml}</html>`;
      }
      
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
      const htmlBlob = new Blob([modifiedHtml], { type: 'text/html' });
      
      formData.append('files', htmlBlob, 'index.html');

      if (activeDapp.config?.isBaseMiniApp) {
        try {
          const manifestPath = `dapps/${activeDapp.slug}/.well-known/farcaster.json`;
          // @ts-ignore
          const manifestContent = await remixClient.call('fileManager', 'readFile', manifestPath);
          
          if (manifestContent) {
            const manifestBlob = new Blob([manifestContent], { type: 'application/json' });
            
            formData.append('files', manifestBlob, '.well-known:::farcaster.json');
            console.log('[Deploy] Added farcaster.json to deployment payload');
          }
        } catch (e) {
          console.warn('[Deploy] Failed to read manifest file:', e);
        }
      }

      const response = await fetch(`${REMIX_ENDPOINT_IPFS}/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = await response.json();
      
      setDeployResult({ 
        cid: data.ipfsHash, 
        gatewayUrl: data.gatewayUrl,
        error: '' 
      });

      if (dappManager) {
        const newConfig = await dappManager.updateDappConfig(activeDapp.slug, {
          status: 'deployed',
          lastDeployedAt: Date.now(),
          deployment: {
            ...activeDapp.deployment,
            ipfsCid: data.ipfsHash,
            gatewayUrl: data.gatewayUrl
          }
        });
        
        if (newConfig) {
          dispatch({ type: 'SET_ACTIVE_DAPP', payload: newConfig });
        }
      }

      return data.ipfsHash;

    } catch (e: any) {
      console.error(e);
      setDeployResult({ cid: '', gatewayUrl: '', error: `Upload failed: ${e.message}` });
      return null;
    } finally {
      setIsDeploying(false);
    }
  };
  
  const handleEnsLink = async () => {
    const targetCid = deployResult.cid || activeDapp?.deployment?.ipfsCid;

    if (!activeDapp || !targetCid) {
        setEnsResult({ ...ensResult, error: 'IPFS CID is missing. Deploy first.' });
        return;
    }

    setIsEnsLoading(true);
    setEnsResult({ success: '', error: '', txHash: '', domain: '' });

    const label = ensName.trim().toLowerCase();
    const validationError = validateEnsName(label);
    if (validationError) {
        setEnsError(validationError);
        setIsEnsLoading(false);
        return;
    }
    
    if (typeof window.ethereum === 'undefined') {
      setEnsResult({ ...ensResult, error: 'MetaMask is required.' });
      setIsEnsLoading(false);
      return;
    }

    try {
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const accounts = await provider.send('eth_requestAccounts', []);
      const ownerAddress = accounts[0];

      const response = await fetch(`${REMIX_ENDPOINT_ENS}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label,
          owner: ownerAddress,
          contentHash: targetCid
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Registration failed');

      setEnsResult({
        success: `Success! Linked to ${targetCid}`,
        error: '',
        txHash: data.txHash,
        domain: data.domain
      });

      if (dappManager) {
        const newConfig = await dappManager.updateDappConfig(activeDapp.slug, {
          deployment: {
            ...activeDapp.deployment,
            ensDomain: data.domain
          }
        });
        if (newConfig) {
          dispatch({ type: 'SET_ACTIVE_DAPP', payload: newConfig });
        }
      }

      if (activeDapp?.config?.isBaseMiniApp) {
        setIsMiniAppSectionOpen(true);
        setTimeout(() => {
          miniAppSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }

    } catch (e: any) {
      console.error(e);
      setEnsResult({ ...ensResult, error: `ENS Error: ${e.message}` });
    } finally {
      setIsEnsLoading(false);
    }
  };

  const handleSaveAndRedeploy = async () => {
    if (!associationJson || !activeDapp) return;
    
    try {
      setIsUpdatingManifest(true);
      const parsed = JSON.parse(associationJson);
      
      // Validation
      if (!parsed.header || !parsed.payload || !parsed.signature) {
          alert("Invalid JSON. Must contain header, payload, and signature.");
          setIsUpdatingManifest(false);
          return;
      }
      
      // Read & Update Manifest
      const manifestPath = `dapps/${activeDapp.slug}/.well-known/farcaster.json`;
      // @ts-ignore
      const content = await remixClient.call('fileManager', 'readFile', manifestPath);
      const manifest = content ? JSON.parse(content) : {};
      
      manifest.accountAssociation = {
          header: parsed.header,
          payload: parsed.payload,
          signature: parsed.signature
      };
      
      // Write back
      // @ts-ignore
      await remixClient.call('fileManager', 'writeFile', manifestPath, JSON.stringify(manifest, null, 2));
      
      // Trigger Re-deploy
      // @ts-ignore
      await remixClient.call('notification', 'toast', 'Manifest updated. Re-deploying to IPFS...');
      await handleIpfsDeploy(); // Wait for deployment

      // @ts-ignore
      await remixClient.call('notification', 'toast', 'Re-deployment complete! Please update ENS Content Hash.');
      
      setAssociationJson('');

    } catch (e: any) {
      console.error(e);
      alert("Process failed: " + e.message);
    } finally {
      setIsUpdatingManifest(false);
    }
  };

  const renderBaseMiniAppFlow = () => {
    // Optional chaining check
    if (!activeDapp?.config?.isBaseMiniApp) return null;

    const hasIpfs = !!(deployResult.cid || activeDapp.deployment?.ipfsCid);
    const hasEns = !!(ensResult.domain || activeDapp.deployment?.ensDomain);
    const currentEns = ensResult.domain || activeDapp.deployment?.ensDomain;
    
    // Check if domain is a Limo link
    const verifyUrl = currentEns ? `https://${currentEns}.limo` : '';

    return (
      <Card className="mb-3 border-info shadow-sm">
        <Card.Header 
           onClick={() => setIsMiniAppSectionOpen(!isMiniAppSectionOpen)}
           className="bg-info bg-opacity-10 text-primary fw-bold d-flex justify-content-between cursor-pointer"
           style={{ cursor: 'pointer' }}
        >
           <span><i className="fas fa-rocket me-2"></i>Base Mini App Setup</span>
           <i className={`fas ${isMiniAppSectionOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
        </Card.Header>
        <Collapse in={isMiniAppSectionOpen}>
          <Card.Body>
            
            {/* Step 1: Deploy IPFS */}
            <div className={`d-flex align-items-center mb-2 ${hasIpfs ? 'text-success' : 'text-muted'}`}>
                <i className={`fas ${hasIpfs ? 'fa-check-circle' : 'fa-circle'} me-2`}></i>
                <strong>Step 1: Deploy to IPFS</strong>
            </div>
            {!hasIpfs && (
                <div className="ms-4 mb-3 small text-muted">
                    Click "Deploy to IPFS" below to start.
                </div>
            )}

            {/* Step 2: Register ENS */}
            <div className={`d-flex align-items-center mb-2 ${hasEns ? 'text-success' : 'text-muted'}`}>
                <i className={`fas ${hasEns ? 'fa-check-circle' : 'fa-circle'} me-2`}></i>
                <strong>Step 2: Register ENS Domain</strong>
            </div>
            {hasIpfs && !hasEns && (
                <div className="ms-4 mb-3 small alert alert-warning py-2">
                    Required! Farcaster verification needs a stable domain. <br/>
                    Click "Register ENS" below to link your IPFS CID.
                </div>
            )}

            {/* Step 3: Verify & Update */}
            <div className="d-flex align-items-center mb-2">
                <i className="fas fa-circle me-2 text-primary"></i>
                <strong>Step 3: Verification & Update</strong>
            </div>
            
            {hasEns ? (
                <div className="ms-4 p-3 bg-light rounded border">
                    <p className="small mb-2">
                        <strong>1. Copy your ENS URL:</strong><br/>
                        <code className="user-select-all">{verifyUrl}</code>
                        <i className="fas fa-copy ms-2" style={{cursor:'pointer'}} onClick={() => navigator.clipboard.writeText(verifyUrl)}></i>
                    </p>
                    <p className="small mb-2">
                        <strong>2. Go to Base Build Tool:</strong><br/>
                        <a href="https://www.base.dev/preview?tab=account" target="_blank" rel="noreferrer" className="btn btn-sm btn-outline-primary py-0 px-2">
                            Open Tool <i className="fas fa-external-link-alt ms-1"></i>
                        </a>
                        <br/>
                        <span className="text-muted" style={{fontSize: '0.75rem'}}>Enter your ENS URL there and sign.</span>
                    </p>
                    <p className="small mb-1">
                        <strong>3. Paste the Signature JSON here:</strong>
                    </p>
                    <Form.Control
                        as="textarea"
                        rows={3}
                        className="small font-monospace mb-2"
                        placeholder='{"header": "...", "payload": "...", "signature": "..."}'
                        value={associationJson}
                        onChange={(e) => setAssociationJson(e.target.value)}
                    />
                    <Button 
                        variant="primary" 
                        size="sm" 
                        className="w-100"
                        onClick={handleSaveAndRedeploy}
                        disabled={isUpdatingManifest || !associationJson}
                    >
                        {isUpdatingManifest ? (
                            <><i className="fas fa-spinner fa-spin me-1"></i> Processing...</>
                        ) : (
                            'Save Signature & Re-Deploy'
                        )}
                    </Button>
                    <div className="text-muted mt-2" style={{fontSize: '0.7rem'}}>
                        * This will update <code>farcaster.json</code> and upload to IPFS again.
                    </div>
                </div>
            ) : (
                <div className="ms-4 mb-3 small text-muted">
                    Complete Step 2 (ENS) to unlock verification.
                </div>
            )}

            {/* Step 4: Finalize */}
            <div className="d-flex align-items-center mt-3 mb-2 text-muted">
                <i className="fas fa-sync-alt me-2"></i>
                <strong>Step 4: Finalize ENS</strong>
            </div>
             <div className="ms-4 small text-muted">
                After Re-deploying (Step 3), click <strong>"Update Content Hash"</strong> in the ENS section below to point your domain to the new CID.
            </div>

          </Card.Body>
        </Collapse>
      </Card>
    );
  };

  const displayCid = deployResult.cid || activeDapp?.deployment?.ipfsCid;
  const displayGateway = deployResult.gatewayUrl || activeDapp?.deployment?.gatewayUrl;
  const displayEnsSuccess = ensResult.success || (activeDapp?.deployment?.ensDomain ? `Linked: ${activeDapp.deployment.ensDomain}` : '');
  
  // ENS Button Text Logic
  const ensButtonText = isEnsLoading 
    ? (displayEnsSuccess ? 'Updating...' : 'Registering...') 
    : (displayEnsSuccess ? 'Update Content Hash' : 'Register Subdomain');

  return (
    <div>
      {/* 1. Base Mini App Flow (Rendered only if isBaseMiniApp is true) */}
      {renderBaseMiniAppFlow()}

      {/* 2. Dapp Details */}
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
      
      {/* 3. IPFS Deploy Section */}
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
              Deploy your DApp to IPFS using Remix's gateway.
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

            {displayCid && (
              <Alert variant="success" className="mt-3" style={{ wordBreak: 'break-all' }}>
                <div className="fw-bold">Deployed Successfully!</div>
                <div><strong>CID:</strong> {displayCid}</div>
                {displayGateway && (
                  <div className="mt-1">
                    <strong>Domain:</strong> <a href={displayGateway} target="_blank" rel="noopener noreferrer">View DApp</a>
                  </div>
                )}
              </Alert>
            )}
            {deployResult.error && (
              <Alert variant="danger" className="mt-3 small">{deployResult.error}</Alert>
            )}
          </Card.Body>
        </Collapse>
      </Card>

      {/* 4. ENS Register Section (Visible after IPFS Deploy) */}
      {displayCid && (
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
                {ensError && <Form.Text className="text-danger">{ensError}</Form.Text>}
              </Form.Group>

              <Button 
                variant="secondary" 
                className="w-100" 
                onClick={handleEnsLink} 
                disabled={isEnsLoading || !ensName || !!ensError}
              >
                {isEnsLoading ? (
                  <><i className="fas fa-spinner fa-spin me-1"></i> Processing...</>
                ) : (
                  ensButtonText 
                )}
              </Button>

              {displayEnsSuccess && (
                <Alert variant="success" className="mt-3 small">
                  <div><i className="fas fa-check-circle me-1"></i> {displayEnsSuccess}</div>
                  
                  {activeDapp?.config?.isBaseMiniApp && (
                      <div className="mt-2 pt-2 border-top border-success border-opacity-25">
                          <strong>Next Step:</strong> Go to <a href="#" onClick={(e) => {
                              e.preventDefault();
                              setIsMiniAppSectionOpen(true);
                              miniAppSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }}>Step 3 (Verification)</a> above.
                      </div>
                  )}

                  {activeDapp?.deployment?.ensDomain && (
                    <div className="mt-1">
                        Domain: <a href={`https://${activeDapp.deployment.ensDomain}.limo`} target="_blank" rel="noreferrer">{activeDapp.deployment.ensDomain}</a>
                    </div>
                  )}
                </Alert>
              )}
              {ensResult.error && (
                <Alert variant="danger" className="mt-3 small">{ensResult.error}</Alert>
              )}

            </Card.Body>
          </Collapse>
        </Card>
      )}

    </div>
  );
}

export default DeployPanel;