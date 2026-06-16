/* eslint-disable @typescript-eslint/no-non-null-assertion */
import React, { useEffect, useRef, useState } from 'react'
import { InBrowserVite } from '../InBrowserVite'

/** Recursively read a dapp's files into a virtual-path → content map. */
const readDappFiles = async (
  plugin: any,
  currentPath: string,
  map: Map<string, string>,
  rootPathLength: number
) => {
  try {
    const files = await plugin.call('fileManager', 'readdir', currentPath)
    for (const [filePath, fileData] of Object.entries(files)) {
      // @ts-ignore - fileData shape comes from fileManager
      if (fileData.isDirectory) {
        await readDappFiles(plugin, filePath, map, rootPathLength)
      } else {
        const content = await plugin.call('fileManager', 'readFile', filePath)
        let virtualPath = filePath.substring(rootPathLength)
        if (!virtualPath.startsWith('/')) virtualPath = '/' + virtualPath
        map.set(virtualPath, content)
      }
    }
  } catch (e) {
    console.error(`[DappPreview] Error reading '${currentPath}':`, e)
  }
}

interface DappPreviewProps {
  /** The remix plugin used to read files and reach the blockchain/VM. */
  plugin: any
  /** Workspace of the dapp to preview (e.g. "dapp-storage-abc123"). */
  workspaceName: string
}

/**
 * Self-contained live preview of a QuickDapp, suitable for embedding outside
 * the QuickDapp plugin view (e.g. the RemixAI right panel split-screen).
 *
 * It reuses the same pipeline as the QuickDapp editor: read the dapp's files
 * from its workspace, bundle them with InBrowserVite, inject the result into a
 * sandboxed iframe, and bridge wallet calls to the Remix VM when applicable.
 */
export function DappPreview({ plugin, workspaceName }: DappPreviewProps): JSX.Element {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const builderRef = useRef<InBrowserVite | null>(null)
  const runBuildRef = useRef<(() => void) | null>(null)
  const fileChangeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const vmContextDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [config, setConfig] = useState<any>(null)
  const [isBuilderReady, setIsBuilderReady] = useState(false)
  const [isBuilding, setIsBuilding] = useState(false)
  const [error, setError] = useState('')
  const [isCurrentProviderVM, setIsCurrentProviderVM] = useState(false)

  const chainId = config?.contract?.chainId
  const isVM = !!chainId && chainId.toString().startsWith('vm')

  // --- Load the dapp config (mode + title/details/logo + chainId) ---
  useEffect(() => {
    let cancelled = false
    setConfig(null)
    setError('')
    ;(async () => {
      try {
        const content = await plugin.call('filePanel', 'readFileFromWorkspace', workspaceName, 'dapp.config.json')
        if (!cancelled && content) setConfig(JSON.parse(content))
      } catch (e) {
        if (!cancelled) setError('Could not read dapp configuration.')
      }
    })()
    return () => { cancelled = true }
  }, [plugin, workspaceName])

  // --- Initialize the in-browser bundler once ---
  useEffect(() => {
    let mounted = true
    async function initBuilder() {
      if (builderRef.current) { setIsBuilderReady(true); return }
      try {
        const builder = new InBrowserVite()
        await builder.initialize()
        if (mounted) {
          builderRef.current = builder
          setIsBuilderReady(true)
        }
      } catch (err: any) {
        if (mounted) setError(`Failed to initialize builder: ${err.message}`)
      }
    }
    initBuilder()
    return () => { mounted = false }
  }, [])

  // --- Build + render into the iframe ---
  const runBuild = async () => {
    if (!iframeRef.current || !config) return
    if (isBuilding) return
    if (!builderRef.current || !builderRef.current.isReady()) return

    setIsBuilding(true)
    setError('')

    try {
      const currentWs = await plugin.call('filePanel', 'getCurrentWorkspace')
      if (currentWs?.name && currentWs.name !== workspaceName) {
        await plugin.call('filePanel', 'switchToWorkspace', { name: workspaceName, isLocalhost: false })
        await new Promise((r) => setTimeout(r, 800))
      }
    } catch (e) { /* best-effort workspace switch */ }

    const builder = builderRef.current
    const mapFiles = new Map<string, string>()
    let hasBuildableFiles = false
    let indexHtmlContent = ''

    try {
      const isInlineMode = config.mode === 'inline'
      const dappRootPath = isInlineMode ? '/frontend' : '/'
      const rootPathLength = isInlineMode ? '/frontend'.length : 0
      await readDappFiles(plugin, dappRootPath, mapFiles, rootPathLength)

      if (mapFiles.size === 0) {
        setError(`No files found for "${workspaceName}".`)
        setIsBuilding(false)
        return
      }

      for (const [path] of mapFiles.entries()) {
        if (path.match(/\.(js|jsx|ts|tsx)$/)) hasBuildableFiles = true
        if (path === '/index.html' || path === 'index.html') indexHtmlContent = mapFiles.get(path)!
      }
    } catch (e: any) {
      setError(`Failed to read dapp files: ${e.message}`)
      setIsBuilding(false)
      return
    }

    const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow?.document
    if (!doc) { setIsBuilding(false); return }

    const { title, details, logo } = config.config || {}
    const logoDataUrl = (logo && typeof logo === 'string' && logo.startsWith('data:image')) ? logo : ''

    const injectionScript = `
      <script>
        window.__QUICK_DAPP_CONFIG__ = {
          logo: ${JSON.stringify(logoDataUrl || '')},
          title: ${JSON.stringify(title || '')},
          details: ${JSON.stringify(details || '')}
        };
      </script>
    `
    const debugScript = `<script>
window.onerror = function(msg, url, line, col, error) {
  try { parent.console.error('[DApp-iframe] Error:', msg, 'at', url, 'line', line); } catch(e) {}
};
window.addEventListener('unhandledrejection', function(e) {
  try { parent.console.error('[DApp-iframe] Unhandled rejection:', e.reason); } catch(e2) {}
});
</script>`
    const ext = `<script>
(function() {
  if (parent.__remixVMBridge) {
    var _listeners = {};
    function emit(event, payload) {
      (_listeners[event] || []).slice().forEach(function(cb) {
        try { cb(payload); } catch (e) { setTimeout(function() { throw e; }, 0); }
      });
    }
    function setAccounts(accounts, emitChange) {
      window.ethereum.selectedAddress = accounts && accounts[0] ? accounts[0] : null;
      if (emitChange) { emit('accountsChanged', accounts || []); }
      return accounts;
    }
    function syncSelectedAddress(method, result) {
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
        return setAccounts(result, false);
      }
      return result;
    }
    window.ethereum = {
      isMetaMask: false,
      isRemixVM: true,
      _events: {},
      request: function(args) {
        return parent.__remixVMBridge.request(args).then(function(result) {
          return syncSelectedAddress(args && args.method, result);
        });
      },
      send: function(method, params) {
        var requestArgs = typeof method === 'object' ? method : { method: method, params: params || [] };
        return parent.__remixVMBridge.request(requestArgs).then(function(result) {
          return syncSelectedAddress(requestArgs && requestArgs.method, result);
        });
      },
      on: function(event, cb) {
        if (!_listeners[event]) _listeners[event] = [];
        _listeners[event].push(cb);
        return this;
      },
      removeListener: function(event, cb) {
        if (_listeners[event]) {
          _listeners[event] = _listeners[event].filter(function(l) { return l !== cb; });
        }
        return this;
      },
      removeAllListeners: function() { _listeners = {}; return this; }
    };
    window.ethereum.chainId = '0x539';
    window.ethereum.selectedAddress = null;
    window.__remixVMUpdateAccounts = function(accounts) {
      return setAccounts(accounts, true);
    };
  } else if (parent.window && parent.window.ethereum) {
    window.ethereum = parent.window.ethereum;
  }
})();
</script>`

    try {
      if (hasBuildableFiles) {
        const result = await builder.build(mapFiles, '/src/main.jsx')
        if (!result.success) {
          doc.open()
          doc.write(`<pre style="color: red; white-space: pre-wrap;">${result.error || 'Unknown build error'}</pre>`)
          doc.close()
          setIsBuilding(false)
          return
        }

        let finalHtml = indexHtmlContent || '<html><body><div id="root"></div></body></html>'
        if (finalHtml.includes('</head>')) {
          finalHtml = finalHtml.replace('</head>', `${debugScript}\n${injectionScript}\n${ext}\n</head>`)
        } else {
          finalHtml = `<html><head>${debugScript}${injectionScript}${ext}</head>${finalHtml}</html>`
        }
        const scriptTag = `\n<script type="module">\n${result.js}\n</script>\n`
        finalHtml = finalHtml.replace(
          /<script type="module"[^>]*src="(?:\/|\.\/)?src\/main\.jsx"[^>]*><\/script>/,
          scriptTag
        )
        finalHtml = finalHtml.replace(
          /<link rel="stylesheet"[^>]*href="(?:\/|\.\/)?src\/index\.css"[^>]*>/,
          ''
        )
        doc.open()
        doc.write(finalHtml)
        doc.close()
      } else {
        let finalHtml = indexHtmlContent
        finalHtml = finalHtml.replace('</head>', `${debugScript}\n${injectionScript}\n${ext}\n</head>`)
        doc.open()
        doc.write(finalHtml)
        doc.close()
      }
    } catch (e: any) {
      setError(`Preview error: ${e.message}`)
    }

    setIsBuilding(false)
  }
  runBuildRef.current = runBuild

  // --- Trigger a build once everything is ready (VM dapps wait for VM) ---
  useEffect(() => {
    if (isBuilderReady && config) {
      if (isVM && !isCurrentProviderVM) return
      setTimeout(() => runBuildRef.current?.(), 100)
    }
  }, [isBuilderReady, config?.slug, isCurrentProviderVM])

  // --- Auto-refresh the preview when dapp files are saved ---
  useEffect(() => {
    if (!plugin || !config || !isBuilderReady) return
    const onFileChanged = (filePath: string) => {
      if (!filePath.match(/\.(jsx?|tsx?|html|css)$/)) return
      if (fileChangeDebounceRef.current) clearTimeout(fileChangeDebounceRef.current)
      fileChangeDebounceRef.current = setTimeout(() => { runBuildRef.current?.() }, 800)
    }
    plugin.on('fileManager', 'fileSaved', onFileChanged)
    return () => {
      if (fileChangeDebounceRef.current) clearTimeout(fileChangeDebounceRef.current)
      try { plugin.off('fileManager', 'fileSaved', onFileChanged) } catch (e) { /* noop */ }
    }
  }, [plugin, workspaceName, isBuilderReady])

  // --- Detect when the VM provider is ready (debounced) ---
  useEffect(() => {
    if (!plugin || !isVM) return
    const onContextChanged = (context: string) => {
      if (!context || !context.startsWith('vm')) return
      if (vmContextDebounceRef.current) clearTimeout(vmContextDebounceRef.current)
      vmContextDebounceRef.current = setTimeout(() => setIsCurrentProviderVM(true), 1500)
    }
    plugin.on('blockchain', 'contextChanged', onContextChanged)
    // also assume current provider may already be VM
    plugin.call('blockchain', 'getProvider').then((p: string) => {
      if (p && p.startsWith('vm')) setIsCurrentProviderVM(true)
    }).catch(() => { /* noop */ })
    return () => {
      if (vmContextDebounceRef.current) clearTimeout(vmContextDebounceRef.current)
      try { plugin.off('blockchain', 'contextChanged', onContextChanged) } catch (e) { /* noop */ }
    }
  }, [plugin, isVM])

  // --- Bridge: expose window.__remixVMBridge so the iframe can reach the VM ---
  useEffect(() => {
    let isMounted = true
    if (!isVM || !plugin) {
      delete (window as any).__remixVMBridge
      return
    }

    const getSelectedVMAccount = async (): Promise<string | null> => {
      const selected = await plugin.call('udappEnv', 'getSelectedAccount').catch(() => null)
      return typeof selected === 'string' ? selected : null
    }
    const orderAccountsBySelected = (accounts: string[], selected: string | null) => {
      if (!selected) return accounts
      const selectedLower = selected.toLowerCase()
      const match = accounts.find((a) => a.toLowerCase() === selectedLower)
      if (!match) return accounts
      return [match, ...accounts.filter((a) => a.toLowerCase() !== selectedLower)]
    }
    const getOrderedVMAccounts = async (web3: any, method = 'eth_accounts', params: any[] = []) => {
      const accounts: string[] = await web3.send(method, params)
      return orderAccountsBySelected(accounts, await getSelectedVMAccount())
    }

    const bridge = {
      request: async ({ method, params }: { method: string; params?: any[] }) => {
        if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null
        const web3 = (window as any).__remixVM_web3
        if (!web3) throw new Error('VM not ready')
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
          const accounts = await getOrderedVMAccounts(web3, method, params || [])
          if (!isMounted) return
          return accounts
        }
        const nextParams = Array.isArray(params) ? [...params] : []
        if ((method === 'eth_sendTransaction' || method === 'eth_call') && nextParams[0] && !nextParams[0].from) {
          const selected = await getSelectedVMAccount()
          if (selected) nextParams[0] = { ...nextParams[0], from: selected }
        }
        const result = await web3.send(method, nextParams)
        if (!isMounted) return
        if (method === 'eth_sendTransaction') plugin.call('blockchain', 'dumpState').catch(() => { /* noop */ })
        return result
      }
    }
    ;(window as any).__remixVMBridge = bridge

    let selectedAccount: string | null = null
    let isCheckingAccount = false
    const emitIframeAccountsChanged = (accounts: string[]) => {
      const updateAccounts = (iframeRef.current?.contentWindow as any)?.__remixVMUpdateAccounts
      if (typeof updateAccounts === 'function') updateAccounts(accounts)
    }
    const checkSelectedAccount = async () => {
      if (!isMounted || isCheckingAccount) return
      isCheckingAccount = true
      try {
        const next = await getSelectedVMAccount()
        if (!next) return
        if (selectedAccount === null) { selectedAccount = next; return }
        if (selectedAccount.toLowerCase() === next.toLowerCase()) return
        const web3 = (window as any).__remixVM_web3
        if (!web3) return
        selectedAccount = next
        const accounts = await getOrderedVMAccounts(web3)
        if (!isMounted) return
        emitIframeAccountsChanged(accounts)
      } catch (e) { /* best-effort */ } finally {
        isCheckingAccount = false
      }
    }
    checkSelectedAccount()
    const interval = window.setInterval(checkSelectedAccount, 1000)
    return () => {
      isMounted = false
      window.clearInterval(interval)
      delete (window as any).__remixVMBridge
    }
  }, [isVM, plugin])

  const showBuildingOverlay = !error && (!isBuilderReady || !config || isBuilding)

  return (
    <div className="d-flex flex-column h-100 w-100 position-relative" style={{ backgroundColor: '#fff' }}>
      {error && (
        <div className="p-2 text-danger small" style={{ flexShrink: 0 }}>{error}</div>
      )}
      {showBuildingOverlay && (
        <div
          className="position-absolute top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center"
          style={{ backgroundColor: '#fff', zIndex: 1, color: '#555', fontSize: '13px', gap: '8px' }}
          data-id="ai-dapp-preview-loading"
        >
          <i className="fas fa-spinner fa-spin fa-lg"></i>
          <span>Building preview…</span>
        </div>
      )}
      <iframe
        ref={iframeRef}
        style={{ width: '100%', height: '100%', border: 'none', backgroundColor: 'white', flex: 1 }}
        title="dApp Preview"
        data-id="ai-dapp-preview-iframe"
        sandbox="allow-popups allow-scripts allow-same-origin allow-forms allow-top-navigation"
      />
    </div>
  )
}
