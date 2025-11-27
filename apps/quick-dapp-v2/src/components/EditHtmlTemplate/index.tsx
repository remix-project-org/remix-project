import React, { useContext, useState, useEffect, useRef } from 'react';
import { Button, Form, Row, Col, Card } from 'react-bootstrap';
import { FormattedMessage, useIntl } from 'react-intl';
import { AppContext } from '../../contexts';
import ChatBox from '../ChatBox';
import ImageUpload from '../ImageUpload';
import DeployPanel from '../DeployPanel';
import remixClient from '../../remix-client';
import { InBrowserVite } from '../../InBrowserVite';

interface Pages {
    [key: string]: string
}
export interface ParsedPagesResult {
  updatedLines: number[][];
  pages: Pages
}

export const readDappFiles = async (path: string, map: Map<string, string>) => {
  try {
    const files = await remixClient.call('fileManager', 'readdir', path);
    
    for (const [filePath, fileData] of Object.entries(files)) {
      // @ts-ignore
      if (fileData.isDirectory) {
        await readDappFiles(filePath, map);
      } else {
        const content = await remixClient.call('fileManager', 'readFile', filePath);
        const relativePath = '/' + filePath.replace(/^(dapp\/)/, '');
        map.set(relativePath, content);
      }
    }
  } catch (e) {
    console.error(`[QuickDapp-LOG] '${path}'`, e);
  }
}

function EditHtmlTemplate(): JSX.Element {
  const intl = useIntl();
  const { appState, dispatch } = useContext(AppContext);
  const { title, details } = appState.instance; 
  const [iframeError, setIframeError] = useState<string>('');
  const [showIframe, setShowIframe] = useState(true);
  const [isBuilderReady, setIsBuilderReady] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isAiUpdating, setIsAiUpdating] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const builderRef = useRef<InBrowserVite | null>(null);
  const { htmlTemplate } = appState.instance;
  
  const runBuild = async () => {
    if (!iframeRef.current) {
      return;
    }
    if (!isBuilderReady) {
      setIframeError('Builder is not initialized. Please wait...');
      return;
    }

    setIsBuilding(true);
    setIframeError('');
    setShowIframe(true);

    const builder = builderRef.current;
    if (!builder || !builder.isReady()) {
      const errorMsg = 'Builder not ready. Please wait for initialization to complete.';
      setIframeError(errorMsg);
      setIsBuilding(false);
      return;
    }

    const mapFiles = new Map<string, string>();
    let hasBuildableFiles = false;
    let indexHtmlContent = '';

    try {
      await readDappFiles('dapp', mapFiles);

      if (mapFiles.size === 0) {
        setIsBuilding(false);
        return;
      }

      for (const [path] of mapFiles.entries()) {
        if (path.endsWith('.js') || path.endsWith('.jsx') || path.endsWith('.ts') || path.endsWith('.tsx')) {
          hasBuildableFiles = true;
        }
        if (path === '/index.html') {
          indexHtmlContent = mapFiles.get(path);
        }
      }

    } catch (e) {
      console.error('Error reading DApp files:', e);
      setIframeError(`Failed to read DApp files: ${e.message}`);
      setIsBuilding(false);
      return;
    }

    const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document;
    if (!doc) {
      setIsBuilding(false);
      return;
    }

    const { logo, title, details } = appState.instance;
    let logoDataUrl = '';
    let injectionScript = '';

    if (logo && logo.byteLength > 0) {
      try {
        const base64data = btoa(
          new Uint8Array(logo).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        logoDataUrl = 'data:image/jpeg;base64,' + base64data;
      } catch (err) {
        console.error('Failed to convert logo to Base64:', err);
        setIframeError('Failed to process uploaded logo. Preview will continue without it.');
      }
    }

    try {
      injectionScript = `
        <script>
          window.__QUICK_DAPP_CONFIG__ = {
            logo: "${logoDataUrl}",
            title: ${JSON.stringify(title || '')},
            details: ${JSON.stringify(details || '')}
          };
        </script>
      `;
    } catch (err) {
      console.error('Failed to stringify DApp config:', err);
      setIframeError(`Failed to prepare DApp config: ${err.message}`);
      setIsBuilding(false);
      return;
    }

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

        let finalHtml = indexHtmlContent;
        if (!finalHtml) {
          setIframeError('index.html content not found.');
          setIsBuilding(false);
          return;
        }
        
        finalHtml = finalHtml.replace('</head>', `${injectionScript}\n${ext}\n</head>`);

        const scriptTag = `\n<script type="module">${result.js}</script>\n`;
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
    } catch (e) {
      setIframeError(`Preview Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
      setShowIframe(false);
    }

    setIsBuilding(false);
  }

  const handleChatMessage = async (message: string) => {
    setIsAiUpdating(true);

    try {
    const currentFiles = new Map<string, string>();
    await readDappFiles('dapp', currentFiles);

    const currentFilesObject: Pages = Object.fromEntries(currentFiles);
    
    const pages: Record<string, string> = await remixClient.call(
      'ai-dapp-generator' as any,
      'updateDapp',
      appState.instance.address,
      message,
      currentFilesObject
    );
    
    try {
      await remixClient.call('fileManager', 'remove', 'dapp');
    } catch (e) {}
    
    await remixClient.call('fileManager', 'mkdir', 'dapp');

    const writePromises = [];
    const createdFolders = new Set<string>(['dapp']);

    for (const [rawFilename, content] of Object.entries(pages)) {
      const safeParts = rawFilename.replace(/\\/g, '/')
                        .split('/')
                        .filter(part => part !== '..' && part !== '.' && part !== '');
    
      if (safeParts.length === 0) {
        continue;
      }
      const safeFilename = safeParts.join('/');
      const fullPath = 'dapp/' + safeFilename;
    
      writePromises.push(
      (async () => {
        if (safeParts.length > 1) {
          const subFolders = safeParts.slice(0, -1);
          let currentPath = 'dapp';
          for (const folder of subFolders) {
            currentPath = `${currentPath}/${folder}`;
            if (!createdFolders.has(currentPath)) {
            try {
              await remixClient.call('fileManager', 'mkdir', currentPath);
              createdFolders.add(currentPath);
            } catch (e) {}
            }
          }
        }
        await remixClient.call('fileManager', 'writeFile', fullPath, content);
      })()
      );
    }

    await Promise.all(writePromises);

    } catch (error) {
      const errorMsg = (error instanceof Error) ? error.message : String(error);
      console.error('[DEBUG-LOG E] (ERROR) handleChatMessage:', errorMsg);
      setIframeError('Failed to update DApp via AI: ' + errorMsg);
    } finally {
      setIsAiUpdating(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    async function initBuilder() {
      if (builderRef.current) return;

      try {
        const builder = new InBrowserVite();
        await builder.initialize();
        builderRef.current = builder;

        if (mounted) {
          setIsBuilderReady(true);
        }
      } catch (err) {
        console.error('Failed to initialize InBrowserVite:', err);
        if (mounted) {
          setIframeError(`Failed to initialize builder: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }
    }

    initBuilder();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (isBuilderReady) {
      if (htmlTemplate) { 
        runBuild();
      }
    }
  }, [isBuilderReady, htmlTemplate]);

  useEffect(() => {
    if (isBuilderReady && !isAiUpdating && htmlTemplate) {
      setTimeout(() => {
        runBuild();
      }, 0);
    }
  }, [isBuilderReady, isAiUpdating, htmlTemplate]);

  return (
    <Row className="m-0 h-100">
      <Col xs={12} lg={8} className="pe-3 d-flex flex-column h-100">
        <Row>
          {/* Chat Section */}
          <div className="flex-grow-1 mb-3" style={{ minHeight: '30px' }}>
            <ChatBox
              onSendMessage={handleChatMessage}
            />
          </div>
        </Row>
        {/* Preview Section */}
        <Row className="flex-grow-1 mb-3">
          <Col xs={12} className="d-flex flex-column h-100">
            <div className="d-flex justify-content-between align-items-center mb-2 flex-shrink-0">
              <h5 className="mb-0">
                <FormattedMessage id="quickDapp.preview" defaultMessage="Preview" />
              </h5>
              <Button 
                variant="primary" 
                size="sm" 
                onClick={runBuild} 
                disabled={isBuilding}
                data-id="quick-dapp-apply-changes"
              >
                {isBuilding ? (
                  <><i className="fas fa-spinner fa-spin me-1"></i> Building...</>
                ) : (
                  <><i className="fas fa-play me-1"></i> Apply Code Changes</>
                )}
              </Button>
            </div>
            <Card className="border flex-grow-1 d-flex">
              <Card.Body className="p-0 d-flex flex-column">
                {isAiUpdating ? (
                  <div className="d-flex flex-column align-items-center justify-content-center h-100 text-center p-4" style={{ minHeight: '400px' }}>
                    <i className="fas fa-spinner fa-spin fa-2x mb-3 text-primary"></i>
                    <h6 className="text-muted">
                      Your dapp is being created by RemixAI Assistant.
                    </h6>
                  </div>
                ) : showIframe ? (
                  <iframe
                    ref={iframeRef}
                    style={{
                      width: '100%',
                      height: '100%',
                      minHeight: '800px',
                      border: 'none',
                      backgroundColor: 'white',
                      flex: '1'
                    }}
                    title="dApp Preview"
                    sandbox="allow-popups allow-scripts allow-same-origin allow-forms allow-top-navigation"
                  />
                ) : (
                  <div className="d-flex align-items-center justify-content-center h-100 text-center p-4">
                    <div>
                      <i className="fas fa-exclamation-triangle text-warning mb-2" style={{ fontSize: '2rem' }}></i>
                      <h6 className="text-muted mb-2">Preview Error</h6>
                      <p className="text-muted small">{iframeError}</p>
                    </div>
                  </div>
                )}
                {iframeError && showIframe && (
                  <div className="alert alert-warning alert-sm m-2 mb-0">
                    <small>
                      <i className="fas fa-exclamation-triangle me-1"></i>
                      {iframeError}
                    </small>
                  </div>
                )}
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Col>

      {/* Second Column: Deploy Panel */}
      <Col xs={12} lg={4} className="d-flex flex-column h-100">
        <div className="flex-shrink-0">
          <DeployPanel />
        </div>
      </Col>
    </Row>
  );
}

export default EditHtmlTemplate;