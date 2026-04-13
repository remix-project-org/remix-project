/* eslint-disable @typescript-eslint/no-non-null-assertion */
import React, { useContext, useState, useRef, useEffect } from 'react';
import { Form, Button, Alert, Card, Collapse, Spinner } from 'react-bootstrap';
import { FormattedMessage, useIntl } from 'react-intl';
import { toPng } from 'html-to-image';
import { AppContext } from '../../contexts';
import { readDappFiles } from '../EditHtmlTemplate';
import { InBrowserVite } from '../../InBrowserVite';
import { generateWalletSelectionScript } from '../../utils/wallet-selection-script';
import { validateEnsName } from '../../utils/ens-utils';
// remixClient removed - using plugin from context instead
import { trackMatomoEvent } from '@remix-api';

import BaseAppWizard from './BaseAppWizard';
import EnsRegistrationModal from './EnsRegistrationModal';

const REMIX_ENDPOINT_IPFS = 'https://quickdapp-ipfs.api.remix.live';

function DeployPanel(): JSX.Element {
  const intl = useIntl();
  const { appState, dispatch, dappManager, plugin } = useContext(AppContext);
  const { activeDapp } = appState;
  const { title, details, logo } = appState.instance;

  const [deployResult, setDeployResult] = useState({
    cid: activeDapp?.deployment?.ipfsCid || '',
    gatewayUrl: activeDapp?.deployment?.gatewayUrl || '',
    error: ''
  });

  const [ensName, setEnsName] = useState('');
  const [ensNameError, setEnsNameError] = useState('');
  const [ensResult, setEnsResult] = useState({
    success: activeDapp?.deployment?.ensDomain ? `Linked: ${activeDapp.deployment.ensDomain}` : '',
    error: '',
    txHash: '',
    domain: activeDapp?.deployment?.ensDomain || ''
  });

  const [isDeploying, setIsDeploying] = useState(false);

  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(true);
  const [isEnsOpen, setIsEnsOpen] = useState(true);
  const [isShareOpen, setIsShareOpen] = useState(true);
  const [copiedField, setCopiedField] = useState('');
  const [showEnsModal, setShowEnsModal] = useState(false);

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
        await plugin.call('notification', 'toast', 'Configuration saved successfully!');
      }
    } catch (e: any) {
      console.error("Save failed", e);
      // @ts-ignore
      await plugin.call('notification', 'toast', 'Failed to save configuration: ' + e.message);
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

      const ogUrl = activeDapp?.deployment?.ensDomain
        ? `https://${activeDapp.deployment.ensDomain}.limo`
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
        ogUrl ? `<meta property="og:url" content="${ogUrl}" />` : '',
        `<meta name="twitter:card" content="${twitterCardType}" />`,
        `<meta name="twitter:title" content="${escapeHtmlAttr(title || 'DApp')}" />`,
        `<meta name="twitter:description" content="${escapeHtmlAttr(details || 'Built with Remix QuickDApp')}" />`,
        `<meta property="og:image" content="${ogImageUrl}" />`,
        `<meta name="twitter:image" content="${ogImageUrl}" />`,
      ].filter(Boolean).join('\n    ');

      let modifiedHtml = indexHtmlContent;
      if (modifiedHtml.includes('</head>')) modifiedHtml = modifiedHtml.replace('</head>', `${walletScript}\n${injectionScript}\n    ${ogTags}\n</head>`);
      else modifiedHtml = `<html><head>${injectionScript}\n${ogTags}</head>${modifiedHtml}</html>`;

      console.log("[IPFS Deploy] indexHtml length:", indexHtmlContent.length, "scriptRegexTest:", /<script type="module"[^>]*src="(?:\/|\.\/)?src\/main\.jsx"[^>]*><\/script>/.test(indexHtmlContent));
      if (!/<script type="module"[^>]*src="(?:\/|\.\/)?src\/main\.jsx"[^>]*><\/script>/.test(indexHtmlContent)) { console.log("[IPFS Deploy] Script tags:", indexHtmlContent.match(/<script[^>]*>/g)); console.log("[IPFS Deploy] HTML head:", indexHtmlContent.substring(0, 500)); }
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

      const uploadHeaders: Record<string, string> = {};
      const authToken = typeof localStorage !== 'undefined' ? localStorage.getItem('remix_access_token') : null;
      if (authToken) uploadHeaders['Authorization'] = `Bearer ${authToken}`;
      const response = await fetch(`${REMIX_ENDPOINT_IPFS}/upload`, { method: 'POST', body: formData, headers: uploadHeaders });
      if (!response.ok) throw new Error(await response.text());

      const data = await response.json();
      setDeployResult({ cid: data.ipfsHash, gatewayUrl: data.gatewayUrl, error: '' });

      trackMatomoEvent(plugin as any, {
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

  const renderEditForm = () => (
    <div className="mb-3">
      <Form.Group className="mb-3">
        <Form.Label className="text-uppercase mb-0 form-label">Dapp logo</Form.Label>
        <input ref={logoInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
        {logo && typeof logo === 'string' ? (
          <div className="mt-2 mb-2 position-relative d-inline-block border bg-white rounded p-1">
            <img src={logo} alt="Preview" style={{ height: '60px', maxWidth: '100%', objectFit: 'contain' }} onError={(e) => e.currentTarget.style.display = 'none'} />
            <span onClick={handleRemoveLogo} style={{ cursor: 'pointer', position: 'absolute', top: -10, right: -10 }} className="badge bg-danger rounded-circle"><i className="fas fa-times"></i></span>
          </div>
        ) : (
          <div className="mt-1">
            <Button variant="outline-secondary" size="sm" onClick={() => logoInputRef.current?.click()}>
              <i className="fas fa-upload me-1"></i> Choose Image
            </Button>
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
  const ensButtonText = displayEnsSuccess ? 'Update Content Hash' : 'Register Subdomain';
  const currentEnsDomain = ensResult.domain || activeDapp?.deployment?.ensDomain;

  return (
    <div data-id="deploy-panel">
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

      <Card className="mb-2">
        <Card.Header onClick={() => setIsPublishOpen(!isPublishOpen)} style={{ cursor: 'pointer' }} className="d-flex justify-content-between bg-transparent border-0">
          Publish to IPFS <i className={`fas ${isPublishOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
        </Card.Header>
        <Collapse in={isPublishOpen}>
          <Card.Body>
            <Button variant="primary" className="w-100" onClick={() => handleIpfsDeploy()} disabled={isDeploying} data-id="deploy-ipfs-btn">
              {isDeploying ? <><i className="fas fa-spinner fa-spin me-1"></i> Uploading...</> : <FormattedMessage id="quickDapp.deployToIPFS" defaultMessage="Deploy to IPFS" />}
            </Button>
            {displayCid && (
              <Alert variant="success" className="mt-3" style={{ wordBreak: 'break-all' }} data-id="deploy-ipfs-success">
                <div className="fw-bold">Deployed Successfully!</div>
                <div><strong>CID:</strong> {displayCid}</div>
                {displayGateway && <div className="mt-1"><a href={displayGateway} target="_blank" rel="noopener noreferrer" className="text-primary fw-bold text-decoration-underline">View DApp</a></div>}
              </Alert>
            )}
            {deployResult.error && <Alert variant="danger" className="mt-3 small">{deployResult.error}</Alert>}
          </Card.Body>
        </Collapse>
      </Card>

      {displayCid && (
        <Card className="mb-2">
          <Card.Header onClick={() => setIsEnsOpen(!isEnsOpen)} style={{ cursor: 'pointer' }} className="d-flex justify-content-between bg-transparent border-0" data-id="ens-section-header">
            Register ENS (Arbitrum) <i className={`fas ${isEnsOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
          </Card.Header>
          <Collapse in={isEnsOpen}>
            <Card.Body>
              <Alert variant="info">Register <strong>.remixdapp.eth</strong> on Arbitrum.</Alert>
              <Form.Group className="mb-2">
                <div className="input-group">
                  <Form.Control type="text" placeholder="myapp" value={ensName} onChange={(e) => {
                    const val = e.target.value.toLowerCase();
                    setEnsName(val);
                    setEnsResult({ ...ensResult, success: '' });
                    setEnsNameError(validateEnsName(val));
                  }} />
                  <span className="input-group-text">.remixdapp.eth</span>
                </div>
                {ensNameError && <small className="text-danger mt-1 d-block">{ensNameError}</small>}
              </Form.Group>
              <Button variant="secondary" className="w-100" onClick={() => {
                setEnsResult({ success: '', error: '', txHash: '', domain: '' });
                trackMatomoEvent(plugin as any, {
                  category: 'quick-dapp-v2',
                  action: 'register_ens',
                  name: 'start',
                  isClick: true
                });
                setShowEnsModal(true);
              }} disabled={!ensName || !!ensNameError}>{ensButtonText}</Button>
              <EnsRegistrationModal
                show={showEnsModal}
                onHide={() => setShowEnsModal(false)}
                ensName={ensName}
                contentHash={deployResult.cid || activeDapp?.deployment?.ipfsCid || ''}
                onSuccess={async (result) => {
                  setShowEnsModal(false);
                  setEnsResult({ success: 'Success!', error: '', txHash: result.txHash, domain: result.domain });
                  trackMatomoEvent(plugin as any, {
                    category: 'quick-dapp-v2',
                    action: 'register_ens',
                    name: 'success',
                    isClick: false
                  });
                  if (dappManager) {
                    const newConfig = await dappManager.updateDappConfig(activeDapp.slug, { deployment: { ...activeDapp.deployment, ensDomain: result.domain } });
                    if (newConfig) dispatch({ type: 'SET_ACTIVE_DAPP', payload: newConfig });
                  }
                }}
              />
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
                  <small className="d-block mt-2 text-muted">
                    <i className="fas fa-info-circle me-1"></i>
                    It may take a few minutes for the ENS link to become accessible. If not available yet, try the IPFS gateway link above.
                  </small>
                </Alert>
              )}

            </Card.Body>
          </Collapse>
        </Card>
      )}

      {currentEnsDomain && (
        <Card className="mb-2">
          <Card.Header onClick={() => setIsShareOpen(!isShareOpen)} style={{ cursor: 'pointer' }} className="d-flex justify-content-between bg-transparent border-0">
            <span><i className="fas fa-share-alt me-2"></i>Share</span>
            <i className={`fas ${isShareOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
          </Card.Header>
          <Collapse in={isShareOpen}>
            <Card.Body>
              <div className="d-flex align-items-center bg-light border rounded p-2 mb-3">
                <code className="text-truncate flex-grow-1 small" style={{ color: '#0d6efd' }}>
                  https://{currentEnsDomain}.limo
                </code>
                <Button
                  variant="link"
                  size="sm"
                  className="flex-shrink-0 p-0 ms-2"
                  onClick={() => {
                    navigator.clipboard.writeText(`https://${currentEnsDomain}.limo`);
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
                  onClick={() => window.open(`https://x.com/intent/post?text=${encodeURIComponent(`AI-generated DApp, powered by @EthereumRemix QuickDapp ⚡\n\nhttps://${currentEnsDomain}.limo`)}`, '_blank')}
                >
                  <i className="fab fa-x-twitter me-1"></i> Post on X
                </Button>
              </div>
            </Card.Body>
          </Collapse>
        </Card>
      )}
    </div>
  );
}

export default DeployPanel;
