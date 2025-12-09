import React, { useContext, useState, useEffect, useRef } from 'react';
import { Button, Row, Col, Card } from 'react-bootstrap';
import { FormattedMessage, useIntl } from 'react-intl';
import { toPng } from 'html-to-image'; // [추가] 썸네일 캡쳐용
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
  const { appState, dispatch } = useContext(AppContext);
  const { activeDapp } = appState;
  
  const [iframeError, setIframeError] = useState<string>('');
  const [showIframe, setShowIframe] = useState(true); 
  const [isBuilderReady, setIsBuilderReady] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const isAiUpdating = activeDapp ? (appState.dappProcessing[activeDapp.slug] || false) : false;

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const builderRef = useRef<InBrowserVite | null>(null);

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
      });

      const previewPath = `dapps/${activeDapp.slug}/preview.png`;
      await remixClient.call('fileManager', 'writeFile', previewPath, dataUrl);
      console.log('[Capture] Thumbnail updated.');
    } catch (error) {
      console.error('[Capture] Failed:', error);
    } finally {
      setIsCapturing(false);
    }
  };
  
  const runBuild = async (forceCapture: boolean = false) => {
    if (!iframeRef.current || !activeDapp) return;
    
    if (!isBuilderReady || !builderRef.current || !builderRef.current.isReady()) {
      setIframeError('Builder is initializing...');
      return;
    }

    setIsBuilding(true);
    setIframeError('');
    setShowIframe(true);

    const builder = builderRef.current;
    const mapFiles = new Map<string, string>();
    let hasBuildableFiles = false;
    let indexHtmlContent = '';

    try {
      const dappRootPath = `dapps/${activeDapp.slug}`;
      await readDappFiles(dappRootPath, mapFiles, dappRootPath.length);

      if (mapFiles.size === 0) {
        setIframeError(`No files found in ${dappRootPath}`);
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

    const { title, details, logo } = activeDapp.config;
    let logoDataUrl = logo || '';
    
    const injectionScript = `
      <script>
        window.__QUICK_DAPP_CONFIG__ = {
          logo: "${logoDataUrl}",
          title: ${JSON.stringify(title || '')},
          details: ${JSON.stringify(details || '')}
        };
      </script>
    `;

    // [유지] 지갑 연결용 스크립트 (중요!)
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
        // 정규식 개선 (원본 유지하되 안정성 확보)
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

      // [추가] 캡쳐 로직 (3초 후 실행)
      if (forceCapture) {
        setTimeout(() => {
          captureAndSaveThumbnail();
        }, 3000);
      }

    } catch (e: any) {
      setIframeError(`Preview Error: ${e.message}`);
      setShowIframe(false);
    }

    setIsBuilding(false);
  }

  const handleChatMessage = async (message: string) => {
    if (!activeDapp) return;
    
    // [수정] 전역 상태 업데이트 (Processing Start)
    dispatch({ 
      type: 'SET_DAPP_PROCESSING', 
      payload: { slug: activeDapp.slug, isProcessing: true } 
    });

    try {
      const mapFiles = new Map<string, string>();
      // [수정] 경로 activeDapp 기준
      const dappRootPath = `dapps/${activeDapp.slug}`;
      await readDappFiles(dappRootPath, mapFiles, dappRootPath.length);

      const currentFilesObject: Pages = Object.fromEntries(mapFiles);
      
      const pages: Record<string, string> = await remixClient.call(
      // @ts-ignore
        'ai-dapp-generator',
        'updateDapp',
        activeDapp.contract.address,
        message,
        currentFilesObject
      );
      
      // [수정] 폴더 삭제 로직 제거 (덮어쓰기 방식으로 변경하여 안전성 확보)
      // dapps/{slug} 폴더 내에 파일 덮어쓰기
      for (const [rawFilename, content] of Object.entries(pages)) {
        const fullPath = `${dappRootPath}/${rawFilename}`;
        await remixClient.call('fileManager', 'writeFile', fullPath, content);
      }

    } catch (error: any) {
      console.error('Update failed:', error);
      setIframeError('Failed to update: ' + error.message);
    } finally {
      // [수정] 전역 상태 업데이트 (Processing End) -> useEffect가 감지하여 runBuild 실행
      dispatch({ 
        type: 'SET_DAPP_PROCESSING', 
        payload: { slug: activeDapp.slug, isProcessing: false } 
      });
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
        if (mounted) {
          setIframeError(`Failed to initialize builder: ${err.message}`);
        }
      }
    }

    initBuilder();

    return () => {
      mounted = false;
    };
  }, []);

  // [수정] 자동 리프레시 로직 복원 (Reactive Pattern)
  useEffect(() => {
    // 빌더가 준비되었고, 댑이 있고, AI 작업이 끝났을 때만 실행
    if (isBuilderReady && activeDapp && !isAiUpdating) {
      // 썸네일이 없으면 캡쳐하도록 플래그 설정
      const shouldCapture = !activeDapp.thumbnailPath;
      
      setTimeout(() => {
        runBuild(shouldCapture);
      }, 0);
    }
  }, [isBuilderReady, isAiUpdating, activeDapp?.slug]);

  if (!activeDapp) return <div className="p-3">No active dapp selected.</div>;

  return (
    <Row className="m-0 h-100">
      <Col xs={12} lg={8} className="pe-3 d-flex flex-column h-100">
        <Row>
          <div className="flex-grow-1 mb-3" style={{ minHeight: '30px' }}>
            <ChatBox onSendMessage={handleChatMessage} />
          </div>
        </Row>
        <Row className="flex-grow-1 mb-3">
          <Col xs={12} className="d-flex flex-column h-100">
            <div className="d-flex justify-content-between align-items-center mb-2 flex-shrink-0">
              <h5 className="mb-0">
                <FormattedMessage id="quickDapp.preview" defaultMessage="Preview" />
              </h5>
              <div className="d-flex gap-2">
                 {/* 수동 캡쳐/리프레시 버튼 추가 */}
                 <Button 
                    variant="primary" 
                    size="sm" 
                    onClick={() => runBuild(true)} 
                    disabled={isBuilding || isAiUpdating}
                    data-id="quick-dapp-apply-changes"
                  >
                    {isBuilding ? <><i className="fas fa-spinner fa-spin me-1"></i> Building...</> : <><i className="fas fa-play me-1"></i> Refresh Preview</>}
                  </Button>
              </div>
            </div>
            
            {/* [핵심] Overlay 방식 적용: Iframe을 항상 렌더링 상태로 유지 */}
            <Card className="border flex-grow-1 d-flex position-relative">
              <Card.Body className="p-0 d-flex flex-column position-relative">
                
                {/* Loading Overlay */}
                {isAiUpdating && (
                  <div 
                    className="position-absolute w-100 h-100 d-flex flex-column align-items-center justify-content-center bg-white" 
                    style={{ zIndex: 10, opacity: 0.9 }}
                  >
                    <i className="fas fa-spinner fa-spin fa-2x mb-3 text-primary"></i>
                    <h6 className="text-muted">
                      Your dapp is being created by RemixAI Assistant.
                    </h6>
                  </div>
                )}

                {/* Iframe: Error가 없고 showIframe일 때만 보이지만, 
                    Overlay 뒤에 숨겨서 Unmount를 방지함 */}
                <iframe
                  ref={iframeRef}
                  style={{
                    width: '100%',
                    // [유지] 원본 코드의 높이 설정 유지 (사용자 요청)
                    minHeight: '800px',
                    border: 'none',
                    backgroundColor: 'white',
                    display: iframeError ? 'none' : 'block'
                  }}
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
  );
}

export default EditHtmlTemplate;