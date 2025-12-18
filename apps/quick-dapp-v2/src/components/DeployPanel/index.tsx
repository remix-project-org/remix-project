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
  
  const [currentStep, setCurrentStep] = useState(1); 
  const [baseEnsName, setBaseEnsName] = useState(''); 
  const [baseAppIdMeta, setBaseAppIdMeta] = useState(''); 
  const [baseAssociationJson, setBaseAssociationJson] = useState(''); 
  const [baseFlowLoading, setBaseFlowLoading] = useState(false);
  const [baseLogs, setBaseLogs] = useState<string[]>([]); 
  
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
        if (activeDapp.config.isBaseMiniApp && currentStep === 1) {
          const namePart = activeDapp.deployment.ensDomain.split('.')[0];
          setBaseEnsName(namePart);
        }
      }
    }
  }, [activeDapp?.id, activeDapp?.deployment]);

  const addLog = (msg: string) => setBaseLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const validateEnsName = (name: string) => {
    const regex = /^[a-z0-9-]+$/;
    if (!name) return '';
    if (name.length < 3) return 'Name must be at least 3 characters.';
    if (!regex.test(name)) return 'Only lowercase letters, numbers, and hyphens are allowed.';
    if (name.startsWith('-') || name.endsWith('-')) return 'Name cannot start or end with a hyphen.';
    return '';
  };

  // ===========================================================================
  // [🔴 Base Mini App Logic]
  // ===========================================================================
  
  const handleStep1Config = async () => {
    if (!baseEnsName || !baseAppIdMeta) {
      // @ts-ignore
      await remixClient.call('notification', 'toast', "Please fill in both ENS Name and App ID Meta Tag.");
      return;
    }
    const nameError = validateEnsName(baseEnsName);
    if (nameError) {
      // @ts-ignore
      await remixClient.call('notification', 'toast', "Invalid ENS Name: " + nameError);
      return;
    }

    try {
      setBaseFlowLoading(true);
      addLog("Reading index.html...");
      
      const indexHtmlPath = `dapps/${activeDapp.slug}/index.html`;
      // @ts-ignore
      let content = await remixClient.call('fileManager', 'readFile', indexHtmlPath);
      if (!content) throw new Error("index.html not found");

      content = content.replace(/<meta\s+name=["']base:app_id["'][^>]*>/gi, '');
      content = content.replace('</head>', `    ${baseAppIdMeta}\n  </head>`);
      addLog("Injected Base App ID Meta Tag.");

      const targetUrl = `https://${baseEnsName}.remixdapp.eth.limo`;
      addLog(`Setting Mini App URL to: ${targetUrl}`);

      const fcMetaRegex = /(<meta\s+name=["']fc:miniapp["']\s+content=')([^']*)(')/;
      const match = content.match(fcMetaRegex);

      if (match) {
        try {
          const jsonStr = match[2]; 
          const jsonObj = JSON.parse(jsonStr);
            
          if (jsonObj.button && jsonObj.button.action) {
              jsonObj.button.action.url = targetUrl;
          } else {
              jsonObj.url = targetUrl;
          }

          const newJsonStr = JSON.stringify(jsonObj);
          content = content.replace(fcMetaRegex, `$1${newJsonStr}$3`);
          addLog("Updated fc:miniapp URL.");
        } catch (parseErr) {
          addLog("Warning: Failed to parse existing fc:miniapp JSON. Skipping URL update.");
        }
      } else {
        const newMeta = `<meta name="fc:miniapp" content='{"version":"next","imageUrl":"https://github.com/remix-project-org.png","button":{"title":"Launch","action":{"type":"launch_miniapp","name":"${title}","url":"${targetUrl}"}}}' />`;
        content = content.replace('</head>', `    ${newMeta}\n  </head>`);
        addLog("Injected new fc:miniapp tag.");
      }

      // @ts-ignore
      await remixClient.call('fileManager', 'writeFile', indexHtmlPath, content);
      // @ts-ignore
      await remixClient.call('notification', 'toast', "Config Saved! Proceed to Deployment.");
      addLog("Saved index.html configuration.");

      setCurrentStep(2); 

    } catch (e: any) {
      console.error(e);
      addLog("Error: " + e.message);
      // @ts-ignore
      await remixClient.call('notification', 'toast', "Configuration failed: " + e.message);
    } finally {
      setBaseFlowLoading(false);
    }
  };

  const executeDeployAndEns = async (stepName: string) => {
    try {
      setBaseFlowLoading(true);
      addLog(`Starting ${stepName}...`);

      addLog("Uploading to IPFS...");
      const cid = await handleIpfsDeploy(); 
      if (!cid) throw new Error("IPFS Upload failed");
      addLog(`IPFS Deployed: ${cid}`);

      addLog(`Linking ENS: ${baseEnsName}.remixdapp.eth -> ${cid}`);
      
      if (typeof window.ethereum === 'undefined') throw new Error("MetaMask not found");
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const accounts = await provider.send('eth_requestAccounts', []);
      const ownerAddress = accounts[0];

      const response = await fetch(`${REMIX_ENDPOINT_ENS}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: baseEnsName.toLowerCase(),
          owner: ownerAddress,
          contentHash: cid
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'ENS Registration failed');

      const successMsg = stepName === "Final Re-Deployment" 
          ? "Final Deploy Success! Check Base Dev now." 
          : "Deploy & ENS Success! Go to Step 3.";
      
      // @ts-ignore
      await remixClient.call('notification', 'toast', successMsg);

      addLog(`ENS Success! TX: ${data.txHash}`);
      
      setEnsResult({
          success: 'Linked',
          error: '',
          txHash: data.txHash,
          domain: data.domain
      });

      return true;

    } catch (e: any) {
        console.error(e);
        addLog("Error: " + e.message);
        // @ts-ignore
        await remixClient.call('notification', 'toast', "Deploy failed: " + e.message);
        return false;
    } finally {
        setBaseFlowLoading(false);
    }
  };

  const handleStep2Deploy = async () => {
    const success = await executeDeployAndEns("First Deployment");
    if (success) setCurrentStep(3);
  };

  const handleStep3Association = async () => {
    if (!baseAssociationJson) return;

    try {
      setBaseFlowLoading(true);
      addLog("Parsing Association JSON...");
      
      let parsed;
      try {
          parsed = JSON.parse(baseAssociationJson);
      } catch (e) {
          throw new Error("Invalid JSON format");
      }

      let associationData;
      if (parsed.accountAssociation) {
          associationData = parsed.accountAssociation;
      } else if (parsed.header && parsed.payload && parsed.signature) {
          associationData = parsed;
      } else {
          throw new Error("JSON must contain accountAssociation object OR header/payload/signature fields.");
      }

      addLog("Valid JSON found. Updating manifest...");

      const manifestPath = `dapps/${activeDapp.slug}/.well-known/farcaster.json`;
      // @ts-ignore
      const content = await remixClient.call('fileManager', 'readFile', manifestPath);
      const manifest = content ? JSON.parse(content) : {};

      manifest.accountAssociation = associationData;

      // @ts-ignore
      await remixClient.call('fileManager', 'writeFile', manifestPath, JSON.stringify(manifest, null, 2));
      addLog("Manifest updated locally.");

      setCurrentStep(4);

    } catch (e: any) {
      console.error(e);
      addLog("Error: " + e.message);
      // @ts-ignore
      await remixClient.call('notification', 'toast', "Manifest update failed: " + e.message);
    } finally {
      setBaseFlowLoading(false);
    }
  };

  const handleStep4Finalize = async () => {
    const success = await executeDeployAndEns("Final Re-Deployment");
    if (success) {
      addLog("All steps completed! You can now publish on base.dev");
      // @ts-ignore
      await remixClient.call('notification', 'toast', 'Base Mini App Ready!');
    }
  };
  
  const handleIpfsDeploy = async (): Promise<string | null> => {
    if (!activeDapp) return null;
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
          const base64data = btoa(new Uint8Array(logo as ArrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ''));
          logoDataUrl = 'data:image/jpeg;base64,' + base64data;
        } catch (e) {}
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

      if (activeDapp.config?.isBaseMiniApp) {
        try {
          const manifestPath = `dapps/${activeDapp.slug}/.well-known/farcaster.json`;
          // @ts-ignore
          const manifestContent = await remixClient.call('fileManager', 'readFile', manifestPath);
          
          if (!manifestContent) {
              throw new Error("Manifest file is empty or missing!");
          }
          console.log('[Deploy] Uploading Manifest Content:', manifestContent);

          const manifestBlob = new Blob([manifestContent], { type: 'application/json' });
          formData.append('files', manifestBlob, '.well-known:::farcaster.json');
          console.log('[Deploy] Added farcaster.json to deployment payload');
          
        } catch (e: any) {
          console.error('[Deploy] Manifest Error:', e);
          throw new Error(`Failed to read Manifest file: ${e.message}`);
        }
      }

      const response = await fetch(`${REMIX_ENDPOINT_IPFS}/upload`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      setDeployResult({ cid: data.ipfsHash, gatewayUrl: data.gatewayUrl, error: '' });

      if (dappManager) {
        const newConfig = await dappManager.updateDappConfig(activeDapp.slug, {
          status: 'deployed',
          lastDeployedAt: Date.now(),
          deployment: { ...activeDapp.deployment, ipfsCid: data.ipfsHash, gatewayUrl: data.gatewayUrl }
        });
        if (newConfig) dispatch({ type: 'SET_ACTIVE_DAPP', payload: newConfig });
      }
      return data.ipfsHash;

    } catch (e: any) {
      console.error(e);
      setDeployResult({ cid: '', gatewayUrl: '', error: `Upload failed: ${e.message}` });
      return null;
    }
  };

  const handleRemoveLogo = () => {
    dispatch({ type: 'SET_INSTANCE', payload: { logo: null } });
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader: any = new FileReader()
      reader.onloadend = () => dispatch({ type: 'SET_INSTANCE', payload: { logo: reader.result } })
      reader.readAsArrayBuffer(e.target.files[0])
    }
  }

  if (activeDapp?.config?.isBaseMiniApp) {
    return (
      <div className="base-wizard-container">
        <Card className="mb-3 border-primary">
          <Card.Header className="bg-primary text-white fw-bold">
            <i className="fas fa-rocket me-2"></i>Base Mini App Wizard
          </Card.Header>
          <Card.Body>
            {/* Step Indicator */}
            <div className="d-flex justify-content-between mb-4 position-relative">
                {[1, 2, 3, 4].map(step => (
                  <div key={step} className={`text-center ${currentStep >= step ? 'text-primary' : 'text-muted'}`} style={{zIndex: 1, width: '25%'}}>
                    <div className={`rounded-circle d-flex align-items-center justify-content-center mx-auto mb-1 ${currentStep === step ? 'bg-primary text-white' : (currentStep > step ? 'bg-primary text-white' : 'bg-light border')}`} style={{width: 30, height: 30}}>
                      {currentStep > step ? <i className="fas fa-check"></i> : step}
                    </div>
                    <small className="d-block fw-bold" style={{fontSize: '0.7rem'}}>
                      {step === 1 ? 'Config' : step === 2 ? 'Deploy' : step === 3 ? 'Sign' : 'Finish'}
                    </small>
                  </div>
                ))}
                <div className="position-absolute top-0 start-0 w-100 bg-light" style={{height: 2, top: 15, zIndex: 0}}>
                    <div className="bg-primary h-100" style={{width: `${(currentStep - 1) * 33}%`, transition: 'width 0.3s'}}></div>
                </div>
            </div>

            {/* Step 1: Configuration */}
            {currentStep === 1 && (
              <div>
                <h6 className="fw-bold mb-3">Step 1: Configuration</h6>
                <Form.Group className="mb-3">
                  <Form.Label>1. Choose ENS Name (Subdomain)</Form.Label>
                  <div className="input-group">
                    <Form.Control 
                      type="text" 
                      placeholder="myapp" 
                      value={baseEnsName}
                      onChange={e => setBaseEnsName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} 
                    />
                    <span className="input-group-text">.remixdapp.eth</span>
                  </div>
                  <Form.Text className="text-muted">Target URL: <code>https://{baseEnsName || '...'}.remixdapp.eth.limo</code></Form.Text>
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>
                    2. Base App ID Meta Tag
                    <a href="https://www.base.dev" target="_blank" rel="noreferrer" className="ms-2 small text-decoration-none">
                      (Get it from base.dev <i className="fas fa-external-link-alt"></i>)
                    </a>
                  </Form.Label>
                  <Form.Control 
                    as="textarea" rows={2}
                    placeholder='<meta name="base:app_id" content="..." />'
                    value={baseAppIdMeta}
                    onChange={e => setBaseAppIdMeta(e.target.value)}
                    />
                  <Form.Text className="text-muted">Copy entire tag from base.dev</Form.Text>
                </Form.Group>

                <Button className="w-100" onClick={handleStep1Config} disabled={baseFlowLoading}>
                  {baseFlowLoading ? 'Processing...' : 'Save Config & Next'}
                </Button>
                <div className="mt-2 text-muted small text-center">
                  After saving, you will deploy (Step 2) and then verify on base.dev.
                </div>
              </div>
            )}

            {/* Step 2: First Deploy */}
            {currentStep === 2 && (
              <div>
                <h6 className="fw-bold mb-3">Step 2: Initial Deployment</h6>
                <Alert variant="info" className="small">
                  We will deploy your app to IPFS and link it to <strong>{baseEnsName}.remixdapp.eth</strong>.
                </Alert>
                <Button variant="primary" className="w-100" onClick={handleStep2Deploy} disabled={baseFlowLoading}>
                  {baseFlowLoading ? 'Deploying...' : 'Deploy to IPFS & Register ENS'}
                </Button>
              </div>
            )}

            {/* Step 3: Association */}
            {currentStep === 3 && (
              <div>
                <h6 className="fw-bold mb-3">Step 3: Verify Ownership</h6>
                <ol className="small ps-3 mb-3">
                  <li>Go to <a href="https://www.base.dev" target="_blank" rel="noreferrer">Base Dev</a>.</li>
                  <li>Verify URL: <code className="user-select-all">https://{baseEnsName}.remixdapp.eth.limo</code></li>
                  <li>Go to Mini App Tools tab.</li>
                  <li>Copy the JSON (Account Association).</li>
                </ol>
                <Form.Group className="mb-3">
                  <Form.Label>Paste JSON</Form.Label>
                  <Form.Control 
                    as="textarea" rows={4}
                    placeholder='{ "accountAssociation": { ... } }'
                    value={baseAssociationJson}
                    onChange={e => setBaseAssociationJson(e.target.value)}
                  />
                </Form.Group>
                <Button className="w-100" onClick={handleStep3Association} disabled={baseFlowLoading}>
                  {baseFlowLoading ? 'Updating...' : 'Update Manifest & Next'}
                </Button>
              </div>
            )}

            {/* Step 4: Finalize */}
            {currentStep === 4 && (
              <div>
                <h6 className="fw-bold mb-3">Step 4: Finalize</h6>
                <Alert variant="warning" className="small">
                  Manifest updated. We need to re-deploy so the new file is live on IPFS/ENS.
                </Alert>
                <Button variant="success" className="w-100 mb-3" onClick={handleStep4Finalize} disabled={baseFlowLoading}>
                  {baseFlowLoading ? 'Deploying...' : 'Re-Deploy & Update ENS'}
                </Button>
                <div className="text-center small text-muted">
                  After this, your Base verification should turn GREEN! 🟢
                </div>
              </div>
            )}
          </Card.Body>
        </Card>
      </div>
    );
  } 

  const displayCid = deployResult.cid || activeDapp?.deployment?.ipfsCid;
  const displayGateway = deployResult.gatewayUrl || activeDapp?.deployment?.gatewayUrl;
  const displayEnsSuccess = ensResult.success || (activeDapp?.deployment?.ensDomain ? `Linked: ${activeDapp.deployment.ensDomain}` : '');
  const ensButtonText = isEnsLoading ? (displayEnsSuccess ? 'Updating...' : 'Registering...') : (displayEnsSuccess ? 'Update Content Hash' : 'Register Subdomain');

  return (
    <div>
      <Card className="mb-2">
        <Card.Header onClick={() => setIsDetailsOpen(!isDetailsOpen)} style={{ cursor: 'pointer' }} className="d-flex justify-content-between bg-transparent border-0">
          Dapp details <i className={`fas ${isDetailsOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
        </Card.Header>
        <Collapse in={isDetailsOpen}>
          <Card.Body>
            <Form.Group className="mb-3">
              <Form.Label className="text-uppercase mb-0">Dapp logo</Form.Label>
              {logo && <span onClick={handleRemoveLogo} style={{cursor:'pointer'}} className="ms-2 text-danger"><i className="fas fa-trash"></i></span>}
              <Form.Control ref={logoInputRef} type="file" accept="image/*" onChange={handleImageChange} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="text-uppercase mb-0">Dapp Title</Form.Label>
              <Form.Control value={title} onChange={({ target: { value } }) => dispatch({ type: 'SET_INSTANCE', payload: { title: value } })} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label className="text-uppercase mb-0">Dapp Description</Form.Label>
              <Form.Control as="textarea" rows={3} value={details} onChange={({ target: { value } }) => dispatch({ type: 'SET_INSTANCE', payload: { details: value } })} />
            </Form.Group>
          </Card.Body>
        </Collapse>
      </Card>
      
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
                    if(dappManager) {
                      const newConfig = await dappManager.updateDappConfig(activeDapp.slug, {deployment:{...activeDapp.deployment, ensDomain: data.domain}});
                      if(newConfig) dispatch({type:'SET_ACTIVE_DAPP', payload:newConfig});
                    }
                  } catch(e:any) { setEnsResult(prev=>({...prev, error: e.message})) } 
                  finally { setIsEnsLoading(false) }
                })();
              }} disabled={isEnsLoading || !ensName}>{isEnsLoading ? 'Processing...' : ensButtonText}</Button>
              {displayEnsSuccess && <Alert variant="success" className="mt-3">{displayEnsSuccess}</Alert>}
              {ensResult.error && <Alert variant="danger" className="mt-3">{ensResult.error}</Alert>}
            </Card.Body>
          </Collapse>
        </Card>
      )}
    </div>
  );
}
export default DeployPanel;