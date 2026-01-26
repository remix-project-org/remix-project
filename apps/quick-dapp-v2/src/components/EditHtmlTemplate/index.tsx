import React, { useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Button, Row, Col, Card, Modal } from 'react-bootstrap';
import { FormattedMessage, useIntl } from 'react-intl';
import { toPng } from 'html-to-image';
import { AppContext } from '../../contexts';
import ChatBox from '../ChatBox';
import DeployPanel from '../DeployPanel';
import remixClient from '../../remix-client';
import { InBrowserVite } from '../../InBrowserVite';

interface Pages {
  [key: string]: string
}

export const readDappFiles = async (
  currentPath: string,
  map: Map<string, string>,
  rootPathLength: number
) => {
  try {
    const files = await remixClient.call('fileManager', 'readdir', currentPath);

    for (const [filePath, fileData] of Object.entries(files)) {
      // @ts-ignore
      if (fileData.isDirectory) {
        await readDappFiles(filePath, map, rootPathLength);
      } else {
        const content = await remixClient.call('fileManager', 'readFile', filePath);
        let virtualPath = filePath.substring(rootPathLength);
        if (!virtualPath.startsWith('/')) virtualPath = '/' + virtualPath;
        map.set(virtualPath, content);
      }
    }
  } catch (e) {
    console.error(`[QuickDapp-LOG] Error reading '${currentPath}':`, e);
  }
}

function EditHtmlTemplate(): JSX.Element {
  const intl = useIntl();
  const { appState, dispatch, dappManager } = useContext(AppContext);
  const { activeDapp } = appState;

  const [iframeError, setIframeError] = useState<string>('');
  const [showIframe, setShowIframe] = useState(true);
  const [isBuilderReady, setIsBuilderReady] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const isAiUpdating = activeDapp ? (appState.dappProcessing[activeDapp.slug] || false) : false;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const builderRef = useRef<InBrowserVite | null>(null);
  const [isExperimental, setIsExperimental] = useState(false);

  const [notificationModal, setNotificationModal] = useState({
    show: false,
    title: '',
    message: '' as React.ReactNode,
    variant: 'primary'
  });

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showTips, setShowTips] = useState(false);

  useEffect(() => {
    const onDappUpdated = (data: any) => {
      if (activeDapp && data.slug === activeDapp.slug) {
        dispatch({
          type: 'SET_DAPP_PROCESSING',
          payload: { slug: activeDapp.slug, isProcessing: false }
        });

        if (activeDapp.status === 'deployed') {
          setNotificationModal({
            show: true,
            title: 'Code Updated',
            message: (
              <div>
                <p>The AI has successfully updated your dapp code.</p>
                <div className="alert alert-warning mb-0">
                  <i className="fas fa-exclamation-triangle me-2"></i>
                  <strong>Action Required:</strong> The live IPFS deployment is outdated.
                  Please <strong>"Deploy to IPFS"</strong> again.
                </div>
              </div>
            ),
            variant: 'warning'
          });
        } else {
          setNotificationModal({
            show: true,
            title: 'Update Successful',
            message: 'The AI has successfully updated your dapp code.',
            variant: 'success'
          });
        }

        setTimeout(() => runBuild(true), 500);
      }
    };

    const onDappError = (errorData: any) => {
      const errorMessage = errorData?.error || errorData || 'Unknown Error';
      if (activeDapp) {
        dispatch({
          type: 'SET_DAPP_PROCESSING',
          payload: { slug: activeDapp.slug, isProcessing: false }
        });
      }
      setNotificationModal({
        show: true,
        title: 'Update Failed',
        message: (
          <div>
            <p>An error occurred while generating the code:</p>
            <div className="alert alert-danger mb-0" style={{maxHeight: '200px', overflowY: 'auto'}}>
              {errorMessage}
            </div>
          </div>
        ),
        variant: 'danger'
      });
    };

    remixClient.internalEvents.on('dappUpdated', onDappUpdated);
    remixClient.internalEvents.on('creatingDappError', onDappError);

    return () => {
      remixClient.internalEvents.off('dappUpdated', onDappUpdated);
      remixClient.internalEvents.off('creatingDappError', onDappError);
    };
  }, [activeDapp, dispatch]);

  const handleDeleteDapp = async () => {
    if (!activeDapp || !dappManager) return;
    try {
      await dappManager.deleteDapp(activeDapp.slug);
      let updatedDapps = await dappManager.getDapps();
      if (!updatedDapps) updatedDapps = [];

      dispatch({ type: 'SET_DAPPS', payload: updatedDapps });
      dispatch({ type: 'SET_ACTIVE_DAPP', payload: null });
      setShowDeleteModal(false);

      if (updatedDapps.length === 0) {
        dispatch({ type: 'SET_VIEW', payload: 'create' });
      } else {
        dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
      }

    } catch (e: any) {
      console.error('Delete failed:', e);
      setShowDeleteModal(false);
    }
  };

  const closeNotificationModal = () => {
    setNotificationModal(prev => ({ ...prev, show: false }));
  };

  const checkUrlParams = useCallback(() => {
    const targetFlag = 'experimental';
    let hasFlag = false;
    if (window.location.href.includes(targetFlag)) hasFlag = true;
    if (!hasFlag && document.referrer && document.referrer.includes(targetFlag)) hasFlag = true;
    try {
      if (window.parent && window.parent.location.href.includes(targetFlag)) hasFlag = true;
    } catch (e) {}
    setIsExperimental(prev => (prev !== hasFlag ? hasFlag : prev));
  }, []);

  useEffect(() => {
    checkUrlParams();
    window.addEventListener('hashchange', checkUrlParams);
    return () => window.removeEventListener('hashchange', checkUrlParams);
  }, [checkUrlParams]);

  const handleBack = async () => {
    if (!isAiUpdating && !isBuilding) {
      await captureAndSaveThumbnail();
    }
    if (dappManager) {
      const updatedDapps = await dappManager.getDapps();
      dispatch({ type: 'SET_DAPPS', payload: updatedDapps });
    }
    dispatch({ type: 'SET_ACTIVE_DAPP', payload: null });
    dispatch({ type: 'SET_VIEW', payload: 'dashboard' });
  };

  const TRANSPARENT_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  const captureAndSaveThumbnail = async () => {
    if (!activeDapp || !iframeRef.current) return;
    const iframe = iframeRef.current;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;

    if (!doc || !doc.body || doc.body.innerHTML === '') return;

    try {
      setIsCapturing(true);
      const dataUrl = await toPng(doc.body, {
        quality: 0.8,
        width: 640,
        height: 360,
        backgroundColor: '#ffffff',
        cacheBust: true,
        skipAutoScale: true,
        pixelRatio: 1,
        imagePlaceholder: TRANSPARENT_PIXEL,
        fetchRequestInit: {
          cache: 'no-cache',
        }
      });

      const previewPath = 'preview.png';
      await remixClient.call('fileManager', 'writeFile', previewPath, dataUrl);
    } catch (error) {
      console.error('[Capture] Failed:', error);
    } finally {
      setIsCapturing(false);
    }
  };

  const runBuild = async (showNotification: boolean = false) => {
    if (!iframeRef.current || !activeDapp) return;
    if (isBuilding) return;

    if (!builderRef.current || !builderRef.current.isReady()) {
      setIframeError('Builder is initializing...');
      return;
    }

    setIsBuilding(true);
    setIframeError('');
    setShowIframe(true);

    const { title, details, logo } = appState.instance;

    const builder = builderRef.current;
    const mapFiles = new Map<string, string>();
    let hasBuildableFiles = false;
    let indexHtmlContent = '';

    try {
      const dappRootPath = '/';
      await readDappFiles(dappRootPath, mapFiles, 0);

      if (mapFiles.size === 0) {
        setIframeError(`No files found in workspace root`);
        setIsBuilding(false);
        return;
      }

      for (const [path] of mapFiles.entries()) {
        if (path.match(/\.(js|jsx|ts|tsx)$/)) {
          hasBuildableFiles = true;
        }
        if (path === '/index.html' || path === 'index.html') {
          indexHtmlContent = mapFiles.get(path)!;
        }
      }

    } catch (e: any) {
      setIframeError(`Failed to read DApp files: ${e.message}`);
      setIsBuilding(false);
      return;
    }

    const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
    if (!doc) {
      setIsBuilding(false);
      return;
    }

    let logoDataUrl = '';
    if (logo && typeof logo === 'string' && logo.startsWith('data:image')) {
      logoDataUrl = logo;
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
    const ext = `<script>window.ethereum = parent.window.ethereum</script>`;

    try {
      if (hasBuildableFiles) {
        const result = await builder.build(mapFiles, '/src/main.jsx');
        if (!result.success) {
          doc.open();
          doc.write(`<pre style="color: red; white-space: pre-wrap;">${result.error || 'Unknown build error'}</pre>`);
          doc.close();
          setIsBuilding(false);
          return;
        }

        let finalHtml = indexHtmlContent || '<html><body><div id="root"></div></body></html>';

        if (finalHtml.includes('</head>')) {
          finalHtml = finalHtml.replace('</head>', `${injectionScript}\n${ext}\n</head>`);
        } else {
          finalHtml = `<html><head>${injectionScript}${ext}</head>${finalHtml}</html>`;
        }

        const scriptTag = `\n<script type="module">\n${result.js}\n</script>\n`;
        finalHtml = finalHtml.replace(
          /<script type="module"[^>]*src="(?:\/|\.\/)?src\/main\.jsx"[^>]*><\/script>/,
          scriptTag
        );
        finalHtml = finalHtml.replace(
          /<link rel="stylesheet"[^>]*href="(?:\/|\.\/)?src\/index\.css"[^>]*>/,
          ''
        );

        doc.open();
        doc.write(finalHtml);
        doc.close();

      } else {
        let finalHtml = indexHtmlContent;
        finalHtml = finalHtml.replace('</head>', `${injectionScript}\n${ext}\n</head>`);
        doc.open();
        doc.write(finalHtml);
        doc.close();
      }

      if (showNotification) {
        setNotificationModal({
          show: true,
          title: 'Preview Updated',
          message: 'Preview refreshed successfully.',
          variant: 'success'
        });
      }

    } catch (e: any) {
      setIframeError(`Preview Error: ${e.message}`);
      setShowIframe(false);
    }

    setIsBuilding(false);
  }

  const handleChatMessage = async (message: string, imageBase64?: string) => {
    if (!activeDapp) return;
    if (!isExperimental) {
      setNotificationModal({
        show: true,
        title: 'Feature Locked',
        message: (
          <div>
            <p>AI updates are only available in <strong>experimental mode</strong>.</p>
            <p>Please add <code>?experimental</code> to the URL and <strong>refresh</strong> the page.</p>
          </div>
        ),
        variant: 'danger'
      });
      return;
    }

    dispatch({
      type: 'SET_DAPP_PROCESSING',
      payload: { slug: activeDapp.slug, isProcessing: true }
    });

    try {
      const mapFiles = new Map<string, string>();
      const dappRootPath = '/';
      await readDappFiles(dappRootPath, mapFiles, 0);

      const currentFilesObject: Pages = {};
      for (const [path, content] of mapFiles.entries()) {
        if (!path.match(/\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i)) {
          currentFilesObject[path] = content;
        }
      }

      let userPrompt: any = message;
      if (imageBase64) {
        userPrompt = [ { type: 'text', text: message }, { type: 'image_url', image_url: { url: imageBase64 } } ];
      }

      await remixClient.updateDapp(
        activeDapp.slug,
        activeDapp.contract.address,
        userPrompt,
        currentFilesObject,
        imageBase64 || null
      );

    } catch (error: any) {
      console.error('Update setup failed:', error);
      dispatch({ type: 'SET_DAPP_PROCESSING', payload: { slug: activeDapp.slug, isProcessing: false } });
    }
  };

  useEffect(() => {
    let mounted = true;
    async function initBuilder() {
      if (builderRef.current) return;
      try {
        const builder = new InBrowserVite();
        await builder.initialize();
        if (mounted) {
          builderRef.current = builder;
          setIsBuilderReady(true);
        }
      } catch (err: any) {
        console.error('Failed to initialize InBrowserVite:', err);
        if (mounted) setIframeError(`Failed to initialize builder: ${err.message}`);
      }
    }
    initBuilder();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (isBuilderReady && activeDapp && !isAiUpdating) {
      setTimeout(() => {
        runBuild(false);
      }, 100);
    }
  }, [isBuilderReady, isAiUpdating, activeDapp?.slug]);

  if (!activeDapp) return <div className="p-3">No active dapp selected.</div>;

  return (
    <div className="d-flex flex-column h-100">
      <div className="py-2 px-3 border-bottom d-flex align-items-center flex-shrink-0">
        <button
          className="btn btn-sm btn-secondary me-3"
          onClick={handleBack}
          disabled={isCapturing}
        >
          {isCapturing ? <><i className="fas fa-spinner fa-spin me-1"></i> Saving...</> : <><i className="fas fa-arrow-left me-1"></i> Back</>}
        </button>
        <div className="d-flex align-items-center flex-wrap gap-2">
          <span className="fw-bold text-body" style={{fontSize: '1.1rem'}}>
            {activeDapp.config.title || activeDapp.name}
          </span>
          <span className="badge bg-secondary opacity-75">
            {activeDapp.contract.networkName}
          </span>
          <div className="vr mx-1 text-secondary opacity-50" style={{ height: '1.2rem' }}></div>
          <div className="d-flex align-items-center text-muted" title="Location in File Explorer">
            <i className="far fa-folder-open me-2 opacity-75"></i>
            <span className="font-monospace small opacity-75">
              {activeDapp.workspaceName}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-grow-1 position-relative" style={{ overflow: 'hidden' }}>
        <div className="container-fluid pt-3 h-100">
          <Row className="m-0 h-100">
            <Col xs={12} lg={8} className="pe-3 d-flex flex-column h-100">
              <Row>
                <div className="flex-grow-1 mb-3" style={{ minHeight: '30px' }}>
                  <ChatBox onSendMessage={handleChatMessage} isLoading={isAiUpdating}/>
                </div>
              </Row>
              <Row className="flex-grow-1 mb-3">
                <Col xs={12} className="d-flex flex-column h-100">
                  <div className="d-flex justify-content-between align-items-center mb-2 flex-shrink-0">
                    <h5 className="mb-0 text-body">
                      <FormattedMessage id="quickDapp.preview" defaultMessage="Preview" />
                      <button
                        className="btn btn-link text-muted p-0 ms-2 text-decoration-none"
                        onClick={() => setShowTips(!showTips)}
                        style={{ fontSize: '0.85rem' }}
                      >
                        <i className="far fa-question-circle me-1"></i>
                        {showTips ? 'Hide Tips' : 'Help & Tips'}
                      </button>
                    </h5>
                    <div className="d-flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => runBuild(true)}
                        disabled={isBuilding || isAiUpdating}
                      >
                        {isBuilding ? <><i className="fas fa-spinner fa-spin me-1"></i> Building...</> : <><i className="fas fa-play me-1"></i> Refresh Preview</>}
                      </Button>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => setShowDeleteModal(true)}
                        disabled={isBuilding || isCapturing}
                      >
                        <i className="fas fa-trash me-1"></i> Delete Dapp
                      </Button>
                    </div>
                  </div>

                  {showTips && (
                    <div className="alert alert-info py-2 px-3 mb-2 small shadow-sm fade-in border-info bg-opacity-10">
                      <div className="fw-bold mb-1"><i className="fas fa-robot me-1"></i>AI Code Generation Tips</div>
                      <ul className="mb-0 ps-3">
                        <li>AI code might not be perfect. If the preview is broken:</li>
                        <li><strong>Option 1:</strong> Edit code manually in the <strong>File Explorer</strong> (left panel), then click <strong>Refresh Preview</strong>.</li>
                        <li><strong>Option 2:</strong> Ask the AI to fix it in the <strong>Chat Box</strong> above.</li>
                      </ul>
                    </div>
                  )}

                  <Card className="border flex-grow-1 d-flex position-relative">
                    <Card.Body className="p-0 d-flex flex-column position-relative" style={{ overflow: 'hidden' }}>
                      {isAiUpdating && (
                        <div className="position-absolute w-100 h-100 d-flex flex-column align-items-center justify-content-center bg-white" style={{ zIndex: 10, opacity: 0.9 }}>
                          <i className="fas fa-spinner fa-spin fa-2x mb-3 text-primary"></i>
                          <h6 className="text-muted">Your dapp is being updated by RemixAI Assistant.</h6>
                        </div>
                      )}
                      <iframe
                        ref={iframeRef}
                        style={{ width: '100%', height: '100%', minHeight: '800px', border: 'none', backgroundColor: 'white', display: iframeError ? 'none' : 'block' }}
                        title="dApp Preview"
                        sandbox="allow-popups allow-scripts allow-same-origin allow-forms allow-top-navigation"
                      />
                      {iframeError && (
                        <div className="d-flex align-items-center justify-content-center h-100 text-center p-4">
                          <div>
                            <i className="fas fa-exclamation-triangle text-warning mb-2" style={{ fontSize: '2rem' }}></i>
                            <h6 className="text-muted mb-2">Preview Error</h6>
                            <p className="text-muted small">{iframeError}</p>
                          </div>
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            </Col>
            <Col xs={12} lg={4} className="d-flex flex-column h-100">
              <div className="flex-shrink-0">
                <DeployPanel />
              </div>
            </Col>
          </Row>
        </div>
      </div>

      <Modal show={notificationModal.show} onHide={closeNotificationModal} centered>
        <Modal.Header closeButton>
          <Modal.Title className={notificationModal.variant === 'danger' ? 'text-danger' : notificationModal.variant === 'warning' ? 'text-warning' : 'text-success'}>
            {notificationModal.title}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>{notificationModal.message}</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeNotificationModal}>Close</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)} centered>
        <Modal.Header closeButton><Modal.Title>Delete Dapp?</Modal.Title></Modal.Header>
        <Modal.Body>Are you sure you want to delete this dapp? This action cannot be undone.</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDeleteDapp}>Yes, Delete</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default EditHtmlTemplate;