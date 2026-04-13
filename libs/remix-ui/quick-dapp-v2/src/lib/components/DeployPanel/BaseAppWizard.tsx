import React, { useContext, useState, useEffect } from 'react';
import { Form, Button, Alert, Card, Spinner, Modal, ListGroup, Badge, InputGroup } from 'react-bootstrap';

import { toPng } from 'html-to-image';
import { AppContext } from '../../contexts';
import { readDappFiles } from '../EditHtmlTemplate';
import { InBrowserVite } from '../../InBrowserVite';
import { generateWalletSelectionScript } from '../../utils/wallet-selection-script';
import { validateEnsName } from '../../utils/ens-utils';
// remixClient removed - using plugin from context instead
import { trackMatomoEvent } from '@remix-api';
import EnsRegistrationModal from './EnsRegistrationModal';

const REMIX_ENDPOINT_IPFS = 'https://quickdapp-ipfs.api.remix.live';

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
  history: DeploymentRecord[];
}

const BaseAppWizard: React.FC = () => {
  const { appState, dispatch, dappManager, plugin } = useContext(AppContext);
  const { activeDapp } = appState;
  const { title, details, logo } = appState.instance;

  const [savedWizardState, setSavedWizardState] = useState<BaseAppWizardState>({
    currentStep: 1,
    ensName: '',
    appIdMeta: '',
    history: []
  });

  const [viewStep, setViewStep] = useState<number>(1);
  const [baseFlowLoading, setBaseFlowLoading] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successModalContent, setSuccessModalContent] = useState({ title: '', body: '' });
  const [showResetWarning, setShowResetWarning] = useState(false);
  const [copiedField, setCopiedField] = useState('');
  const [showEnsModal, setShowEnsModal] = useState(false);
  const [pendingEnsData, setPendingEnsData] = useState<{ cid: string; mode: 'initial' | 'update' } | null>(null);

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

  const isAppLive = savedWizardState.currentStep >= 4;

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

  // validateEnsName is now imported from ens-utils.ts

  const extractAppId = (raw: string): string | null => {
    const input = raw.trim();
    if (!input) return null;

    const quoteChars = `"'\u201C\u201D\u2018\u2019`;
    const contentRegex = new RegExp(
      `content\\s*=\\s*[${quoteChars}]([^${quoteChars}]+)[${quoteChars}]`, 'i'
    );
    const contentMatch = input.match(contentRegex);
    if (contentMatch && contentMatch[1].trim()) {
      return contentMatch[1].trim();
    }

    const unquotedMatch = input.match(/content\s*=\s*([^\s/>'"]+)/i);
    if (unquotedMatch && unquotedMatch[1].trim()) {
      return unquotedMatch[1].trim();
    }

    if (!input.startsWith('<')) {
      const stripped = input.replace(/<[^>]*>/g, '').trim();
      if (stripped && /^[\w.:-]+$/.test(stripped)) {
        return stripped;
      }
    }

    return null;
  };

  const handleStep1Config = async () => {
    if (!savedWizardState.appIdMeta) {
      // @ts-ignore
      await plugin.call('notification', 'toast', "Please enter the App ID Meta Tag.");
      return;
    }

    const appIdValue = extractAppId(savedWizardState.appIdMeta);
    if (!appIdValue) {
      // @ts-ignore
      await plugin.call('notification', 'toast',
        'Could not extract App ID. Expected format: <meta name="base:app_id" content="your-app-id" />');
      return;
    }

    const safeAppId = appIdValue.replace(/[<>"'&]/g, '');
    if (!safeAppId) {
      // @ts-ignore
      await plugin.call('notification', 'toast', 'The App ID value contains only invalid characters.');
      return;
    }

    const cleanMetaTag = `<meta name="base:app_id" content="${safeAppId}" />`;

    try {
      setBaseFlowLoading(true);

      const indexHtmlPath = 'index.html';
      // @ts-ignore
      let content = await plugin.call('fileManager', 'readFile', indexHtmlPath);
      if (!content) throw new Error("index.html not found");

      content = content.replace(/<meta\s+[^>]*base:app_id[^>]*\/?>/gi, '');
      content = content.replace(/<meta\s+[^>]*base:app_id[^>]*/gi, '');
      content = content.replace('</head>', `    ${cleanMetaTag}\n  </head>`);

      // @ts-ignore
      await plugin.call('fileManager', 'writeFile', indexHtmlPath, content);

      await savePersistentState({ appIdMeta: savedWizardState.appIdMeta });
      completeStepAndGoNext(2);

    } catch (e: any) {
      console.error(e);
      // @ts-ignore
      await plugin.call('notification', 'toast', "Configuration failed: " + e.message);
    } finally {
      setBaseFlowLoading(false);
    }
  };

  const handleIpfsDeploy = async (): Promise<string | null> => {
    if (!activeDapp) return null;

    trackMatomoEvent(plugin as any, {
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
      await readDappFiles(plugin, dappRootPath, filesMap, 0);

      if (filesMap.size === 0) throw new Error("No DApp files found");

      const jsResult = await builder.build(filesMap, '/src/main.jsx');
      if (!jsResult.success) throw new Error(`Build failed: ${jsResult.error}`);

      const indexHtmlContent = filesMap.get('/index.html') || '';

      let logoDataUrl = '';
      if (logo && typeof logo === 'string' && logo.startsWith('data:image')) {
        logoDataUrl = logo;
      }
      // Escape </  to <\/ inside JSON strings to prevent HTML parser from
      // seeing </script> in user text as the closing tag for this script element.
      const safeJson = (val: string) => JSON.stringify(val).replace(/<\//g, '<\\/');
      const injectionScript = `<script>window.__QUICK_DAPP_CONFIG__={logo:${safeJson(logoDataUrl || '')},title:${safeJson(title || '')},details:${safeJson(details || '')}};</script>`;
      const walletScript = generateWalletSelectionScript();

      // Escape text for safe use in HTML attribute values (OG/Twitter meta tags)
      const escapeHtmlAttr = (str: string) => str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      const ensUrlForOG = savedWizardState.ensName
        ? `https://${savedWizardState.ensName}.remixdapp.eth.limo`
        : '';

      // Step 1: Capture screenshot & upload to IPFS to get a stable URL
      let screenshotBlob: Blob | null = null;
      let screenshotIpfsUrl = '';
      try {
        const iframe = document.querySelector('[data-id="dapp-preview-iframe"]') as HTMLIFrameElement;
        if (iframe?.contentDocument?.body) {
          const dataUrl = await toPng(iframe.contentDocument.body, {
            quality: 0.8, width: 1200, height: 630, backgroundColor: '#ffffff',
            cacheBust: true, skipAutoScale: true, pixelRatio: 1,
            style: { width: '1200px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'flex-start' },
          });
          const res = await fetch(dataUrl);
          screenshotBlob = await res.blob();

          // Upload screenshot to IPFS first
          const ssFormData = new FormData();
          ssFormData.append('files', screenshotBlob, 'screenshot.png');
          const ssHeaders: Record<string, string> = {};
          const ssToken = typeof localStorage !== 'undefined' ? localStorage.getItem('remix_access_token') : null;
          if (ssToken) ssHeaders['Authorization'] = `Bearer ${ssToken}`;
          const ssResponse = await fetch(`${REMIX_ENDPOINT_IPFS}/upload`, { method: 'POST', body: ssFormData, headers: ssHeaders });
          if (ssResponse.ok) {
            const ssData = await ssResponse.json();
            screenshotIpfsUrl = `https://ipfs.io/ipfs/${ssData.ipfsHash}/screenshot.png`;
          }
        }
      } catch (e) {
        console.warn('[IPFS Deploy] Screenshot upload failed, using fallback', e);
      }

      // Step 2: Build OG tags with screenshot IPFS URL
      const ogImageUrl = screenshotIpfsUrl || 'https://remix.ethereum.org/assets/img/remix-logo-blue.png';
      const twitterCardType = screenshotIpfsUrl ? 'summary_large_image' : 'summary';

      const ogTags = [
        `<meta property="og:title" content="${escapeHtmlAttr(title || 'DApp')}" />`,
        `<meta property="og:description" content="${escapeHtmlAttr(details || 'Built with Remix QuickDApp')}" />`,
        `<meta property="og:type" content="website" />`,
        ensUrlForOG ? `<meta property="og:url" content="${ensUrlForOG}" />` : '',
        `<meta name="twitter:card" content="${twitterCardType}" />`,
        `<meta name="twitter:title" content="${escapeHtmlAttr(title || 'DApp')}" />`,
        `<meta name="twitter:description" content="${escapeHtmlAttr(details || 'Built with Remix QuickDApp')}" />`,
        `<meta property="og:image" content="${ogImageUrl}" />`,
        `<meta name="twitter:image" content="${ogImageUrl}" />`,
      ].filter(Boolean).join('\n    ');

      let modifiedHtml = indexHtmlContent;
      if (modifiedHtml.includes('</head>')) modifiedHtml = modifiedHtml.replace('</head>', `${walletScript}\n${injectionScript}\n    ${ogTags}\n</head>`);
      else modifiedHtml = `<html><head>${injectionScript}\n${ogTags}</head>${modifiedHtml}</html>`;

      const inlineScript = `<script type="module">\n${jsResult.js}\n</script>`;
      modifiedHtml = modifiedHtml.replace(/<script type="module"[^>]*src="(?:\/|\.\/)?src\/main\.jsx"[^>]*><\/script>/, inlineScript);
      modifiedHtml = modifiedHtml.replace(/<link rel="stylesheet"[^>]*href="(?:\/|\.\/)?src\/index\.css"[^>]*>/, '');

      // Step 3: Final IPFS deploy with HTML + screenshot
      const formData = new FormData();
      const htmlBlob = new Blob([modifiedHtml], { type: 'text/html' });
      formData.append('files', htmlBlob, 'index.html');
      if (screenshotBlob) {
        formData.append('files', screenshotBlob, 'screenshot.png');
      }

      // Farcaster manifest no longer bundled — Base App uses standard web app model (April 2026)

      const uploadHeaders: Record<string, string> = {};
      const authToken = typeof localStorage !== 'undefined' ? localStorage.getItem('remix_access_token') : null;
      if (authToken) uploadHeaders['Authorization'] = `Bearer ${authToken}`;
      const response = await fetch(`${REMIX_ENDPOINT_IPFS}/upload`, { method: 'POST', body: formData, headers: uploadHeaders });
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

      trackMatomoEvent(plugin as any, {
        category: 'quick-dapp-v2',
        action: 'deploy_ipfs',
        name: 'success',
        isClick: false
      });

      return data.ipfsHash;

    } catch (e: any) {
      console.error('[BaseAppWizard] IPFS Deploy Error:', e);
      return null;
    }
  };

  const executeBaseAppAction = async (mode: 'initial' | 'update') => {
    if (!savedWizardState.ensName) {
      // @ts-ignore
      await plugin.call('notification', 'toast', 'ENS Name is required.');
      return;
    }

    if (mode === 'initial') {
      const nameError = validateEnsName(savedWizardState.ensName);
      if (nameError) {
        // @ts-ignore
        await plugin.call('notification', 'toast', "Invalid ENS Name: " + nameError);
        return;
      }
    }

    try {
      setBaseFlowLoading(true);

      const newCid = await handleIpfsDeploy();
      if (!newCid) throw new Error("IPFS Deployment Failed.");

      // Store pending data and show ENS modal
      setPendingEnsData({ cid: newCid, mode });
      trackMatomoEvent(plugin as any, {
        category: 'quick-dapp-v2',
        action: 'register_ens',
        name: 'start',
        isClick: true
      });
      setShowEnsModal(true);

    } catch (e: any) {
      // @ts-ignore
      await plugin.call('notification', 'toast', `Error: ${e.message}`);
      setBaseFlowLoading(false);
    }
  };

  const handleEnsRegistrationSuccess = async (result: { txHash: string; domain: string; owner: string }) => {
    setShowEnsModal(false);
    const mode = pendingEnsData?.mode || 'initial';
    const newCid = pendingEnsData?.cid || '';

    try {
      trackMatomoEvent(plugin as any, {
        category: 'quick-dapp-v2',
        action: 'register_ens',
        name: 'success',
        isClick: false
      });

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

      const actionLabel = mode === 'initial' ? 'Initial Deploy' : 'Code Update';

      await addHistoryRecord(actionLabel, newCid, result.txHash);
      await savePersistentState({ ensName: savedWizardState.ensName });

      if (mode === 'initial') {
        completeStepAndGoNext(3);
        setSuccessModalContent({
          title: 'Deploy Complete',
          body: `Your app is deployed to IPFS and ENS linked.\n\nNext: Go to Base.dev and verify your URL to complete the setup.`
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
      await plugin.call('notification', 'toast', `Error: ${e.message}`);
    } finally {
      setBaseFlowLoading(false);
      setPendingEnsData(null);
    }
  };

  // handleManifestUpdate removed — Farcaster Account Association no longer needed (April 2026)

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // @ts-ignore
      await plugin.call('notification', 'toast', `${label} copied to clipboard!`);
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
      currentStep: 2,
    });

    setViewStep(2);
    setShowResetWarning(false);
  };

  const ensUrl = `https://${savedWizardState.ensName}.remixdapp.eth.limo`;
  const latestCid = savedWizardState.history[0]?.cid || activeDapp?.deployment?.ipfsCid;
  const ipfsUrl = latestCid ? `https://ipfs.io/ipfs/${latestCid}` : '';

  return (
    <>
      <div className="base-wizard-container" data-id="base-app-wizard">
        <Modal show={showSuccessModal} onHide={() => setShowSuccessModal(false)} centered>
          <Modal.Header closeButton className="bg-success text-white">
            <Modal.Title>{successModalContent.title}</Modal.Title>
          </Modal.Header>
          <Modal.Body className="text-center py-4">
            <div style={{ whiteSpace: 'pre-line', fontSize: '1rem', lineHeight: '1.6' }}>{successModalContent.body}</div>
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
            <Modal.Title style={{ fontSize: '1.1rem' }}>
              <i className="fas fa-exclamation-triangle me-2"></i>
              Change Domain Name?
            </Modal.Title>
          </Modal.Header>
          <Modal.Body style={{ fontSize: '1rem', lineHeight: '1.6' }}>
            <p className="fw-bold text-danger">
              Changing the domain will require re-deployment and re-verification.
            </p>
            <div className="alert alert-secondary" style={{ fontSize: '0.95rem' }}>
              If you proceed:
              <ul className="mb-0 ps-3 mt-1">
                <li>You must <strong>re-deploy</strong> the app.</li>
                <li>You must <strong>re-verify</strong> the URL on <strong>Base.dev</strong>.</li>
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

        {viewStep >= 4 ? (
          <Card className="border-success mb-3 shadow-sm" data-id="live-app-dashboard">
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
                    <li>
                      <strong>Docs:</strong> For advanced configuration, see <a href="https://docs.base.org/mini-apps" target="_blank" rel="noreferrer" className="fw-bold text-decoration-underline">Base Apps Documentation <i className="fas fa-external-link-alt small"></i></a>.
                    </li>
                  </ul>
                </div>
              </div>
              <hr className="my-3" />
              <div className="mb-3">
                <h6 className="fw-bold text-muted small mb-2"><i className="fas fa-share-alt me-1"></i>Share</h6>
                <div className="d-flex align-items-center bg-light border rounded p-2 mb-2">
                  <code className="text-truncate flex-grow-1 small" style={{ color: '#0d6efd' }}>
                    {ensUrl}
                  </code>
                  <Button
                    variant="link"
                    size="sm"
                    className="flex-shrink-0 p-0 ms-2"
                    onClick={() => {
                      navigator.clipboard.writeText(ensUrl);
                      setCopiedField('url');
                      setTimeout(() => setCopiedField(''), 2000);
                    }}
                  >
                    {copiedField === 'url' ? <i className="fas fa-check text-success"></i> : <i className="fas fa-copy text-muted"></i>}
                  </Button>
                </div>
                <div className="d-grid">
                  <Button
                    variant="dark"
                    size="sm"
                    onClick={() => window.open(`https://x.com/intent/post?text=${encodeURIComponent(`AI-generated DApp, powered by @EthereumRemix QuickDapp ⚡\n\n${ensUrl}`)}`, '_blank')}
                  >
                    <i className="fab fa-x-twitter me-1"></i> Post on X
                  </Button>
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
          <Card className="mb-3 border-primary" data-id="base-wizard-card">
            <Card.Header className="bg-primary text-white fw-bold d-flex justify-content-between align-items-center">
              <span><i className="fas fa-rocket me-2"></i>Setup Wizard</span>
              <div className="d-flex gap-2 align-items-center">
                {isAppLive && (
                  <Button
                    variant="link"
                    className="text-white p-0 text-decoration-none small border border-white px-2 rounded"
                    style={{ fontSize: '0.8rem', opacity: 0.9 }}
                    onClick={() => navigateToStep(4)}
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
                    width: viewStep === 1 ? '0%' : viewStep === 2 ? '50%' : '100%',
                    transition: 'width 0.4s ease-in-out'
                  }}></div>
                {[1, 2, 3].map(step => (
                  <div key={step} className={`text-center`} style={{ zIndex: 1, position: 'relative', cursor: 'pointer' }} onClick={() => navigateToStep(step)} title={`Go to Step ${step}`}>
                    <div className={`rounded-circle d-flex align-items-center justify-content-center mx-auto mb-1 ${viewStep >= step ? 'bg-primary text-white shadow-sm' : 'bg-white border'}`}
                      style={{ width: 30, height: 30, transition: 'background-color 0.3s' }}>
                      <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{step}</span>
                    </div>
                    <small className="d-block fw-bold" style={{ fontSize: '0.7rem', color: viewStep >= step ? '#0d6efd' : '#6c757d' }}>
                      {step === 1 ? 'Config' : step === 2 ? 'Deploy' : 'Verify'}
                    </small>
                  </div>
                ))}
              </div>

              <div className="wizard-content">
                {viewStep === 1 && (
                  <div className="fade-in" data-id="wizard-step-1-config">
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

                    <Button className="w-100" onClick={handleStep1Config} disabled={baseFlowLoading} data-id="wizard-step1-next-btn">
                      {baseFlowLoading ? 'Saving...' : 'Save & Next'}
                    </Button>
                  </div>
                )}

                {viewStep === 2 && (
                  <div className="fade-in" data-id="wizard-step-2-deploy">
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
                          disabled={savedWizardState.currentStep >= 4}
                        />
                        <InputGroup.Text>.remixdapp.eth</InputGroup.Text>
                        {savedWizardState.currentStep >= 4 && (
                          <Button
                            variant="warning"
                            onClick={() => setShowResetWarning(true)}
                            title="Change Domain"
                          >
                            <i className="fas fa-pen me-1"></i> Change
                          </Button>
                        )}
                      </InputGroup>
                      {savedWizardState.currentStep >= 4 && (
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
                  <div className="fade-in" data-id="wizard-step-3-verify">
                    <h6 className="fw-bold mb-2">Step 3: Verify URL on Base.dev</h6>
                    <Alert variant="success" className="small p-2 mb-3 bg-success bg-opacity-10 border-success">
                      <i className="fas fa-check-circle me-2"></i>
                      Your app has been deployed to IPFS and linked to ENS!
                    </Alert>

                    <Alert variant="info" className="border small p-2 mb-3">
                      <div className="fw-bold mb-2">Complete your Base.dev registration:</div>
                      <ol className="mb-0 ps-3">
                        <li className="mb-1">Go to your app's settings on <a href="https://base.dev/" target="_blank" rel="noreferrer" className="fw-bold text-decoration-underline">Base.dev</a>.</li>
                        <li className="mb-1">Navigate to <strong>"Verify & Add URL"</strong>.</li>
                        <li className="mb-1">Paste your ENS URL below into the <strong>App URL</strong> field.</li>
                        <li>Click <strong>"Verify & Add"</strong> to confirm ownership.</li>
                      </ol>
                    </Alert>

                    <div className="mb-3">
                      <label className="small fw-bold text-muted mb-1">Your ENS URL (paste this into Base.dev)</label>
                      <div className="d-flex align-items-center bg-light border rounded p-2">
                        <code className="text-truncate flex-grow-1 small" style={{ color: '#0d6efd' }}>
                          {ensUrl}
                        </code>
                        <Button
                          variant="link"
                          size="sm"
                          className="flex-shrink-0 p-0 ms-2"
                          onClick={() => {
                            navigator.clipboard.writeText(ensUrl);
                            setCopiedField('verify-url');
                            setTimeout(() => setCopiedField(''), 2000);
                          }}
                        >
                          {copiedField === 'verify-url' ? <i className="fas fa-check text-success"></i> : <i className="fas fa-copy text-muted"></i>}
                        </Button>
                      </div>
                    </div>

                    <div className="d-flex gap-2">
                      <Button variant="secondary" onClick={() => navigateToStep(2)}>Back</Button>
                      <Button
                        variant="success"
                        className="flex-grow-1"
                        onClick={() => {
                          trackMatomoEvent(plugin as any, {
                            category: 'quick-dapp-v2',
                            action: 'base_app_setup_complete',
                            name: 'success',
                            isClick: true
                          });
                          completeStepAndGoNext(4);
                        }}
                      >
                        <i className="fas fa-check-circle me-2"></i>I've Verified on Base.dev
                      </Button>
                    </div>
                  </div>
                )}

              </div>
            </Card.Body>
          </Card>
        )}
      </div>

      <EnsRegistrationModal
        show={showEnsModal}
        onHide={() => {
          setShowEnsModal(false);
          setBaseFlowLoading(false);
          setPendingEnsData(null);
        }}
        ensName={savedWizardState.ensName}
        contentHash={pendingEnsData?.cid || ''}
        onSuccess={handleEnsRegistrationSuccess}
      />
    </>
  );
};

export default BaseAppWizard;