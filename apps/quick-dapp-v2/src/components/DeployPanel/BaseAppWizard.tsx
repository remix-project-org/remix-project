import React, { useContext, useState, useEffect } from 'react';
import { Form, Button, Alert, Card, Spinner, Modal, ListGroup, Badge, InputGroup } from 'react-bootstrap';
import { ethers } from 'ethers';
import { AppContext } from '../../contexts';
import { readDappFiles } from '../EditHtmlTemplate';
import { InBrowserVite } from '../../InBrowserVite';
import remixClient from '../../remix-client';
import { trackMatomoEvent } from '@remix-api';

const REMIX_ENDPOINT_IPFS = 'https://quickdapp-ipfs.api.remix.live';
const REMIX_ENDPOINT_ENS = 'https://quickdapp-ens.api.remix.live';

interface DeploymentRecord {
  id: string;
  timestamp: number;
  action: string;
  cid: string;
  txHash?: string;
}

interface BaseAppWizardState {
  currentStep: number;
  ensName: string;
  appIdMeta: string;
  verificationJson: string;
  history: DeploymentRecord[];
}

const BaseAppWizard: React.FC = () => {
  const { appState, dispatch, dappManager } = useContext(AppContext);
  const { activeDapp } = appState;
  const { title, details, logo } = appState.instance;

  const [savedWizardState, setSavedWizardState] = useState<BaseAppWizardState>({
    currentStep: 1,
    ensName: '',
    appIdMeta: '',
    verificationJson: '',
    history: []
  });

  const [viewStep, setViewStep] = useState<number>(1);
  const [baseFlowLoading, setBaseFlowLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successModalContent, setSuccessModalContent] = useState({ title: '', body: '' });
  const [showResetWarning, setShowResetWarning] = useState(false);

  useEffect(() => {
    if (activeDapp?.config?.isBaseMiniApp) {
      // @ts-ignore
      const saved = activeDapp.config.baseAppConfig as BaseAppWizardState;

      if (saved) {
        setSavedWizardState({
          ...saved,
          history: saved.history || []
        });
        setViewStep(saved.currentStep);
      } else {
        const existingEns = activeDapp.deployment?.ensDomain?.split('.')[0] || '';
        setSavedWizardState(prev => ({ ...prev, ensName: existingEns }));
        setViewStep(1);
      }
    }
  }, [activeDapp?.id]);

  const isAppLive = savedWizardState.currentStep >= 5;

  const savePersistentState = async (updates: Partial<BaseAppWizardState>) => {
    const newState = { ...savedWizardState, ...updates };
    setSavedWizardState(newState);

    if (dappManager && activeDapp) {
      try {
        await dappManager.updateDappConfig(activeDapp.slug, {
          config: {
            ...activeDapp.config,
            // @ts-ignore
            baseAppConfig: newState
          }
        });
      } catch (e) {
        console.error('[BaseAppWizard] Save failed:', e);
      }
    }
  };

  const navigateToStep = (step: number) => {
    setViewStep(step);
  };

  const completeStepAndGoNext = async (nextStep: number) => {
    const newCurrentStep = Math.max(savedWizardState.currentStep, nextStep);
    await savePersistentState({ currentStep: newCurrentStep });
    setViewStep(nextStep);
  };

  const addHistoryRecord = async (action: string, cid: string, txHash?: string) => {
    const newRecord: DeploymentRecord = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      action,
      cid,
      txHash
    };

    const newHistory = [newRecord, ...savedWizardState.history];
    await savePersistentState({ history: newHistory });
  };

  const handleInputChange = (field: keyof BaseAppWizardState, value: string) => {
    setSavedWizardState(prev => ({ ...prev, [field]: value }));
  };

  const validateEnsName = (name: string) => {
    const regex = /^[a-z0-9-]+$/;
    if (!name) return '';
    if (name.length < 3) return 'Name must be at least 3 characters.';
    if (!regex.test(name)) return 'Only lowercase letters, numbers, and hyphens are allowed.';
    if (name.startsWith('-') || name.endsWith('-')) return 'Name cannot start or end with a hyphen.';
    return '';
  };

  const handleStep1Config = async () => {
    if (!savedWizardState.appIdMeta) {
      // @ts-ignore
      await remixClient.call('notification', 'toast', "Please enter the App ID Meta Tag.");
      return;
    }

    try {
      setBaseFlowLoading(true);

      const indexHtmlPath = 'index.html';
      // @ts-ignore
      let content = await remixClient.call('fileManager', 'readFile', indexHtmlPath);
      if (!content) throw new Error("index.html not found");

      content = content.replace(/<meta\s+name=["']base:app_id["'][^>]*>/gi, '');
      content = content.replace('</head>', `    ${savedWizardState.appIdMeta}\n  </head>`);

      // @ts-ignore
      await remixClient.call('fileManager', 'writeFile', indexHtmlPath, content);

      await savePersistentState({ appIdMeta: savedWizardState.appIdMeta });
      completeStepAndGoNext(2);

    } catch (e: any) {
      console.error(e);
      // @ts-ignore
      await remixClient.call('notification', 'toast', "Configuration failed: " + e.message);
    } finally {
      setBaseFlowLoading(false);
    }
  };

  const handleIpfsDeploy = async (): Promise<string | null> => {
    if (!activeDapp) return null;

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
      const dappRootPath = '/';
      const filesMap = new Map<string, string>();
      await readDappFiles(dappRootPath, filesMap, 0);

      if (filesMap.size === 0) throw new Error("No DApp files found");

      const jsResult = await builder.build(filesMap, '/src/main.jsx');
      if (!jsResult.success) throw new Error(`Build failed: ${jsResult.error}`);

      let indexHtmlContent = filesMap.get('/index.html') || '';

      let logoDataUrl = '';
      if (logo && typeof logo === 'string' && logo.startsWith('data:image')) {
        logoDataUrl = logo;
      }
      const injectionScript = `<script>window.__QUICK_DAPP_CONFIG__={logo:"${logoDataUrl}",title:${JSON.stringify(title || '')},details:${JSON.stringify(details || '')}};</script>`;

      let modifiedHtml = indexHtmlContent;
      if (modifiedHtml.includes('</head>')) modifiedHtml = modifiedHtml.replace('</head>', `${injectionScript}\n</head>`);
      else modifiedHtml = `<html><head>${injectionScript}</head>${modifiedHtml}</html>`;

      const inlineScript = `<script type="module">\n${jsResult.js}\n</script>`;
      modifiedHtml = modifiedHtml.replace(/<script type="module"[^>]*src="(?:\/|\.\/)?src\/main\.jsx"[^>]*><\/script>/, inlineScript);
      modifiedHtml = modifiedHtml.replace(/<link rel="stylesheet"[^>]*href="(?:\/|\.\/)?src\/index\.css"[^>]*>/, '');

      const formData = new FormData();
      const htmlBlob = new Blob([modifiedHtml], { type: 'text/html' });
      formData.append('files', htmlBlob, 'index.html');

      try {
        const manifestPath = '.well-known/farcaster.json';
        // @ts-ignore
        const manifestContent = await remixClient.call('fileManager', 'readFile', manifestPath);
        if (manifestContent) {
          const manifestBlob = new Blob([manifestContent], { type: 'application/json' });
          formData.append('files', manifestBlob, '.well-known:::farcaster.json');
        }
      } catch (e) { }

      const response = await fetch(`${REMIX_ENDPOINT_IPFS}/upload`, { method: 'POST', body: formData });
      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();

      if (dappManager) {
        await dappManager.updateDappConfig(activeDapp.slug, {
          status: 'deployed',
          lastDeployedAt: Date.now(),
          deployment: { ...activeDapp.deployment, ipfsCid: data.ipfsHash, gatewayUrl: data.gatewayUrl },
          config: { ...activeDapp.config, title: title || '', details: details || '', logo: logoDataUrl || undefined }
        });
      }
      return data.ipfsHash;

    } catch (e: any) {
      console.error('[BaseAppWizard] IPFS Deploy Error:', e);
      return null;
    }
  };

  const executeBaseAppAction = async (mode: 'initial' | 'finalize' | 'update') => {
    if (!savedWizardState.ensName) {
      // @ts-ignore
      await remixClient.call('notification', 'toast', 'ENS Name is required.');
      return;
    }

    if (mode === 'initial') {
      const nameError = validateEnsName(savedWizardState.ensName);
      if (nameError) {
        // @ts-ignore
        await remixClient.call('notification', 'toast', "Invalid ENS Name: " + nameError);
        return;
      }
    }

    try {
      setBaseFlowLoading(true);

      const newCid = await handleIpfsDeploy();
      if (!newCid) throw new Error("IPFS Deployment Failed.");

      if (typeof window.ethereum === 'undefined') throw new Error("MetaMask is required.");
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const accounts = await provider.send('eth_requestAccounts', []);
      const ownerAddress = accounts[0];

      const response = await fetch(`${REMIX_ENDPOINT_ENS}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: savedWizardState.ensName.toLowerCase(),
          owner: ownerAddress,
          contentHash: newCid
        })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'ENS Registration failed');
      }

      const resData = await response.json();

      if (dappManager) {
        const fullDomain = `${savedWizardState.ensName}.remixdapp.eth`;
        const updatedConfig = await dappManager.updateDappConfig(activeDapp.slug, {
          deployment: {
            ...activeDapp.deployment,
            ensDomain: fullDomain
          }
        });
        if (updatedConfig) dispatch({ type: 'SET_ACTIVE_DAPP', payload: updatedConfig });
      }

      let actionLabel = 'Update';
      if (mode === 'initial') actionLabel = 'Initial Deploy';
      else if (mode === 'finalize') actionLabel = 'Final Publish';
      else actionLabel = 'Code Update';

      await addHistoryRecord(actionLabel, newCid, resData.txHash);
      await savePersistentState({ ensName: savedWizardState.ensName });

      if (mode === 'initial') {
        completeStepAndGoNext(3);
      } else if (mode === 'finalize') {
        completeStepAndGoNext(5);
        setSuccessModalContent({
          title: 'Base Mini App is Ready!',
          body: `Verification complete and ENS linked.\nYour app is live at: https://${savedWizardState.ensName}.remixdapp.eth.limo`
        });
        setShowSuccessModal(true);
      } else if (mode === 'update') {
        setSuccessModalContent({
          title: 'Update Published!',
          body: `New code deployed to IPFS and ENS record updated.\nChanges should appear shortly at: https://${savedWizardState.ensName}.remixdapp.eth.limo`
        });
        setShowSuccessModal(true);
      }

    } catch (e: any) {
      // @ts-ignore
      await remixClient.call('notification', 'toast', `Error: ${e.message}`);
    } finally {
      setBaseFlowLoading(false);
    }
  };

  const handleManifestUpdate = async () => {
    if (!savedWizardState.verificationJson) {
      // @ts-ignore
      await remixClient.call('notification', 'toast', "Please paste the JSON signature.");
      return;
    }
    try {
      setBaseFlowLoading(true);
      let parsed;
      try { parsed = JSON.parse(savedWizardState.verificationJson); } catch (e) { throw new Error("Invalid JSON format."); }

      let associationData = parsed.accountAssociation || parsed;

      try {
        const payloadBase64 = associationData.payload;
        if (!payloadBase64) throw new Error("JSON is missing the 'payload' field.");

        const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
        const decodedPayload = atob(base64);

        const currentDomain = `${savedWizardState.ensName}.remixdapp.eth`;

        if (!decodedPayload.includes(currentDomain)) {
          throw new Error(
            `Domain Mismatch!\n\nThe provided JSON is NOT for "${currentDomain}".\nIt seems to be for a different domain.\nPlease re-verify on Base Portal with the correct URL.`
          );
        }
      } catch (validationError: any) {
        throw validationError;
      }

      const manifestPath = '.well-known/farcaster.json';
      // @ts-ignore
      const content = await remixClient.call('fileManager', 'readFile', manifestPath);
      const manifest = content ? JSON.parse(content) : {};

      manifest.accountAssociation = associationData;
      const limoUrl = `https://${savedWizardState.ensName}.remixdapp.eth.limo`;

      if (manifest.miniapp) {
        manifest.miniapp.homeUrl = limoUrl;
        delete manifest.miniapp.noindex;
      }

      // @ts-ignore
      await remixClient.call('fileManager', 'writeFile', manifestPath, JSON.stringify(manifest, null, 2));

      const indexHtmlPath = 'index.html';
      // @ts-ignore
      let indexContent = await remixClient.call('fileManager', 'readFile', indexHtmlPath);
      if (indexContent) {
        const fcMetaRegex = /(<meta\s+name=["']fc:miniapp["']\s+content=')([^']*)(')/;
        const match = indexContent.match(fcMetaRegex);
        if (match) {
          try {
            const jsonObj = JSON.parse(match[2]);
            if (jsonObj.button && jsonObj.button.action) {
              jsonObj.button.action.url = limoUrl;
            } else {
              jsonObj.url = limoUrl;
            }
            const newJsonStr = JSON.stringify(jsonObj);
            indexContent = indexContent.replace(fcMetaRegex, `$1${newJsonStr}$3`);
            // @ts-ignore
            await remixClient.call('fileManager', 'writeFile', indexHtmlPath, indexContent);
          } catch (err) { }
        }
      }

      await savePersistentState({ verificationJson: savedWizardState.verificationJson });
      completeStepAndGoNext(4);

    } catch (e: any) {
      // @ts-ignore
      await remixClient.call('notification', 'toast', "Update failed: " + e.message);
    } finally {
      setBaseFlowLoading(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // @ts-ignore
      await remixClient.call('notification', 'toast', `${label} copied to clipboard!`);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const renderEditForm = () => (
    <div className="mb-3">
      <Form.Group className="mb-3">
        <Form.Label className="text-uppercase mb-0 form-label">Dapp Title</Form.Label>
        <Form.Control value={title} onChange={({ target: { value } }) => dispatch({ type: 'SET_INSTANCE', payload: { title: value } })} />
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label className="text-uppercase mb-0 form-label">Dapp Description</Form.Label>
        <Form.Control as="textarea" rows={3} value={details} onChange={({ target: { value } }) => dispatch({ type: 'SET_INSTANCE', payload: { details: value } })} />
      </Form.Group>
    </div>
  );

  const confirmDomainReset = async () => {
    await savePersistentState({
      verificationJson: '',
      currentStep: 2,
    });

    setViewStep(2);

    setShowResetWarning(false);

  };

  const ensUrl = `https://${savedWizardState.ensName}.remixdapp.eth.limo`;
  const latestCid = savedWizardState.history[0]?.cid || activeDapp?.deployment?.ipfsCid;
  const ipfsUrl = latestCid ? `https://ipfs.io/ipfs/${latestCid}` : '';

  return (
    <div className="base-wizard-container">
      <Modal show={showSuccessModal} onHide={() => setShowSuccessModal(false)} centered>
        <Modal.Header closeButton className="bg-success text-white">
          <Modal.Title>{successModalContent.title}</Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center py-4">
          <div style={{ whiteSpace: 'pre-line' }}>{successModalContent.body}</div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="success" onClick={() => setShowSuccessModal(false)}>Close</Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showResetWarning}
        onHide={() => setShowResetWarning(false)}
        centered
        backdrop="static"
        keyboard={false}
      >
        <Modal.Header closeButton className="bg-warning text-dark">
          <Modal.Title>
            <i className="fas fa-exclamation-triangle me-2"></i>
            Change Domain Name?
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="fw-bold text-danger">
            Changing the domain will break your current Base App verification.
          </p>
          <div className="alert alert-secondary small">
            If you proceed:
            <ul className="mb-0 ps-3">
              <li>The existing <strong>JSON signature</strong> will be deleted.</li>
              <li>You must <strong>re-deploy</strong> the app.</li>
              <li>You must <strong>re-verify</strong> ownership on the Base Portal.</li>
            </ul>
          </div>
          <p className="mb-0">Do you really want to reset and change the domain?</p>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowResetWarning(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmDomainReset}>
            Yes, Reset & Change
          </Button>
        </Modal.Footer>
      </Modal>

      {viewStep >= 5 ? (
        <Card className="border-success mb-3 shadow-sm">
          <Card.Header className="bg-success text-white fw-bold d-flex justify-content-between align-items-center">
            <span><i className="fas fa-check-circle me-2"></i>Live App Dashboard</span>
            <span className="badge bg-white text-success">Active</span>
          </Card.Header>
          <Card.Body>
            <div className="text-center py-3 bg-light rounded mb-4 border">
              <h5 className="fw-bold mb-1 text-dark">{savedWizardState.ensName}.remixdapp.eth</h5>
              <a href={ensUrl} target="_blank" rel="noreferrer" className="small text-decoration-none fw-bold">
                Open Live App <i className="fas fa-external-link-alt ms-1"></i>
              </a>
            </div>
            <div className="d-grid gap-3 mb-4">
              <Button variant="primary" className="py-2" onClick={() => executeBaseAppAction('update')} disabled={baseFlowLoading}>
                {baseFlowLoading ? <><Spinner as="span" animation="border" size="sm" className="me-2" />Updating...</> : <><i className="fas fa-sync-alt me-2"></i>Publish Changes</>}
              </Button>
              <div className="alert border small text-muted mb-0">
                <div className="fw-bold mb-1"><i className="fas fa-tools me-1"></i>Maintenance Guide</div>
                <ul className="mb-0 ps-3">
                  <li className="mb-1">
                    <strong>Update Code:</strong> Edit files in File Explorer, then click <strong>Publish Changes</strong> above to re-deploy to IPFS & ENS.
                  </li>
                  <li className="mb-1">
                    <strong>Config:</strong> You can manually edit <code>.well-known/farcaster.json</code> to change button actions or metadata.
                  </li>
                  <li>
                    <strong>Docs:</strong> For advanced configuration, see <a href="https://www.base.org/build/mini-apps" target="_blank" rel="noreferrer" className="fw-bold text-decoration-underline">Base Mini Apps Documentation <i className="fas fa-external-link-alt small"></i></a>.
                  </li>
                </ul>
              </div>
            </div>
            <hr className="my-3" />
            <div className="d-grid">
              <Button variant="secondary" size="sm" onClick={() => navigateToStep(1)}>
                <i className="fas fa-cog me-2"></i>Re-configure Settings
              </Button>
            </div>
            {savedWizardState.history.length > 0 && (
              <div className="mt-4">
                <h6 className="fw-bold text-muted small mb-2"><i className="fas fa-history me-1"></i>Deployment History</h6>
                <ListGroup variant="flush" className="small border rounded">
                  {savedWizardState.history.slice(0, 5).map((record, idx) => (
                    <ListGroup.Item key={idx} className="d-flex justify-content-between align-items-center bg-light">
                      <div>
                        <Badge bg="secondary" className="me-2">{record.action}</Badge>
                        <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                          {new Date(record.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              </div>
            )}
          </Card.Body>
        </Card>
      ) : (
        <Card className="mb-3 border-primary">
          <Card.Header className="bg-primary text-white fw-bold d-flex justify-content-between align-items-center">
            <span><i className="fas fa-rocket me-2"></i>Setup Wizard</span>
            <div className="d-flex gap-2 align-items-center">
              {isAppLive && (
                <Button
                  variant="link"
                  className="text-white p-0 text-decoration-none small border border-white px-2 rounded"
                  style={{ fontSize: '0.8rem', opacity: 0.9 }}
                  onClick={() => navigateToStep(5)}
                  title="Cancel editing and return to dashboard"
                >
                  <i className="fas fa-times me-1"></i> Close
                </Button>
              )}
              {(!isAppLive && viewStep > 1) && (
                <Button variant="link" className="text-white p-0 text-decoration-none small"
                  onClick={() => navigateToStep(1)}>
                  Restart
                </Button>
              )}
            </div>
          </Card.Header>
          <Card.Body>
            <div className="d-flex justify-content-between mb-4 position-relative px-3">
              <div className="position-absolute w-100 bg-light" style={{ height: 4, top: 13, left: 0, zIndex: 0 }}></div>
              <div className="position-absolute bg-primary"
                style={{
                  height: 4, top: 13, left: 0, zIndex: 0,
                  width: viewStep === 1 ? '0%' : viewStep === 2 ? '33%' : viewStep === 3 ? '66%' : '100%',
                  transition: 'width 0.4s ease-in-out'
                }}></div>
              {[1, 2, 3, 4].map(step => (
                <div key={step} className={`text-center`} style={{ zIndex: 1, position: 'relative', cursor: 'pointer' }} onClick={() => navigateToStep(step)} title={`Go to Step ${step}`}>
                  <div className={`rounded-circle d-flex align-items-center justify-content-center mx-auto mb-1 ${viewStep >= step ? 'bg-primary text-white shadow-sm' : 'bg-white border'}`}
                    style={{ width: 30, height: 30, transition: 'background-color 0.3s' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{step}</span>
                  </div>
                  <small className="d-block fw-bold" style={{ fontSize: '0.7rem', color: viewStep >= step ? '#0d6efd' : '#6c757d' }}>
                    {step === 1 ? 'Config' : step === 2 ? 'Deploy' : step === 3 ? 'Verify' : 'Finalize'}
                  </small>
                </div>
              ))}
            </div>

            <div className="wizard-content">
              {viewStep === 1 && (
                <div className="fade-in">
                  <h6 className="fw-bold mb-2">Step 1: App Registration</h6>
                  <Card className="mb-3 bg-light border-0"><Card.Body>{renderEditForm()}</Card.Body></Card>
                  <Alert variant="info" className="small p-2 mb-3">
                    Register your app at <a href="https://base.dev/" target="_blank" rel="noreferrer" className="fw-bold text-decoration-underline">Base Portal</a>.
                    <br />
                    Copy the <b>App ID Meta Tag</b> from the verification screen.
                  </Alert>
                  <Form.Group className="mb-3">
                    <Form.Label>Base App ID Meta Tag</Form.Label>
                    <Form.Control
                      as="textarea" rows={2}
                      placeholder='<meta name="base:app_id" content="..." />'
                      value={savedWizardState.appIdMeta}
                      onChange={e => handleInputChange('appIdMeta', e.target.value)}
                    />
                  </Form.Group>

                  <Button className="w-100" onClick={handleStep1Config} disabled={baseFlowLoading}>
                    {baseFlowLoading ? 'Saving...' : 'Save & Next'}
                  </Button>
                </div>
              )}

              {viewStep === 2 && (
                <div className="fade-in">
                  <h6 className="fw-bold mb-2">Step 2: Deployment & ENS</h6>
                  <Alert variant="info" className="small p-2 mb-3">
                    Deploy your app to IPFS and register an ENS subdomain (`.remixdapp.eth`).
                  </Alert>

                  <Form.Group className="mb-3">
                    <Form.Label>Choose ENS Name (Subdomain)</Form.Label>
                    <InputGroup>
                      <Form.Control
                        type="text"
                        placeholder="myapp"
                        value={savedWizardState.ensName}
                        onChange={e => handleInputChange('ensName', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        disabled={savedWizardState.currentStep >= 5}
                      />
                      <InputGroup.Text>.remixdapp.eth</InputGroup.Text>
                      {savedWizardState.currentStep >= 5 && (
                        <Button
                          variant="warning"
                          onClick={() => setShowResetWarning(true)}
                          title="Change Domain"
                        >
                          <i className="fas fa-pen me-1"></i> Change
                        </Button>
                      )}
                    </InputGroup>
                    {savedWizardState.currentStep >= 5 && (
                      <div className="form-text text-warning">
                        <i className="fas fa-lock me-1"></i>
                        Domain is locked. Click <strong>Change</strong> to reset and verify a new domain.
                      </div>
                    )}
                  </Form.Group>

                  <div className="d-flex gap-2">
                    <Button variant="secondary" onClick={() => navigateToStep(1)}>Back</Button>
                    <Button variant="primary" className="flex-grow-1" onClick={() => executeBaseAppAction('initial')} disabled={baseFlowLoading}>
                      {baseFlowLoading ? 'Deploying & Registering...' : 'Deploy & Next'}
                    </Button>
                  </div>
                </div>
              )}

              {viewStep === 3 && (
                <div className="fade-in">
                  <h6 className="fw-bold mb-2">Step 3: Verification & Association</h6>
                  <Alert variant="info" className="border small p-2 mb-3">
                    <ol className="mb-0 ps-3">
                      <li>Copy the <b>ENS URL</b> below.</li>
                      <li>Go back to <a href="https://base.dev/" target="_blank" rel="noreferrer" className="fw-bold text-decoration-underline">Base Portal</a>. and verify ownership.</li>
                      <li>Then go to <b>Mini App Tools</b> and <b>Account Association</b>.</li>
                      <li>Copy the JSON signature and paste it here.</li>
                    </ol>
                  </Alert>

                  <div className="mb-3">
                    <label className="small fw-bold text-muted mb-1">ENS URL</label>
                    <div className="d-flex align-items-center justify-content-between bg-light border rounded p-2 mb-3">
                      <div className="text-truncate me-2 small font-monospace text-dark">
                        {ensUrl}
                      </div>
                      <div className="d-flex gap-2 flex-shrink-0">
                        <Button variant="light" size="sm" className="border text-muted" onClick={() => copyToClipboard(ensUrl, 'ENS URL')} title="Copy">
                          <i className="fas fa-copy"></i>
                        </Button>
                        <Button variant="light" size="sm" className="border text-muted" href={ensUrl} target="_blank" title="Open Link">
                          <i className="fas fa-external-link-alt"></i>
                        </Button>
                      </div>
                    </div>

                    <label className="small fw-bold text-muted mb-1">IPFS URL</label>
                    <div className="d-flex align-items-center justify-content-between bg-light border rounded p-2">
                      <div className="text-truncate me-2 small font-monospace text-dark">
                        {ipfsUrl}
                      </div>
                      <div className="d-flex gap-2 flex-shrink-0">
                        <Button variant="light" size="sm" className="border text-muted" onClick={() => copyToClipboard(ipfsUrl, 'IPFS URL')} title="Copy">
                          <i className="fas fa-copy"></i>
                        </Button>
                        <Button variant="light" size="sm" className="border text-muted" href={ipfsUrl} target="_blank" title="Open Link">
                          <i className="fas fa-external-link-alt"></i>
                        </Button>
                      </div>
                    </div>
                  </div>

                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">Paste Verification JSON</Form.Label>
                    <Form.Control
                      as="textarea" rows={3}
                      placeholder='{"accountAssociation": ...}'
                      value={savedWizardState.verificationJson}
                      onChange={e => handleInputChange('verificationJson', e.target.value)}
                    />
                  </Form.Group>

                  <div className="d-flex gap-2">
                    <Button variant="secondary" onClick={() => navigateToStep(2)}>Back</Button>
                    <Button variant="primary" className="flex-grow-1" onClick={handleManifestUpdate} disabled={baseFlowLoading}>
                      {baseFlowLoading ? 'Processing...' : 'Verify & Next'}
                    </Button>
                  </div>
                </div>
              )}

              {viewStep === 4 && (
                <div className="fade-in">
                  <h6 className="fw-bold mb-2">Step 4: Finalize</h6>
                  <Alert variant="success" className="small p-2 mb-3 bg-success bg-opacity-10 border-success">
                    Re-deploy your app with the association JSON to complete the verification.
                  </Alert>
                  <div className="d-flex gap-2">
                    <Button variant="secondary" onClick={() => navigateToStep(3)}>Back</Button>
                    <Button variant="success" className="flex-grow-1" onClick={() => executeBaseAppAction('finalize')} disabled={baseFlowLoading}>
                      {baseFlowLoading ? 'Finalizing...' : 'Final Publish'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card.Body>
        </Card>
      )}
    </div>
  );
};

export default BaseAppWizard;