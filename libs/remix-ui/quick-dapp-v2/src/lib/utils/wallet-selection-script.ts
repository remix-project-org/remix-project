/**
 * Generates the wallet-selection injection script for IPFS-deployed DApps.
 *
 * This script is injected into the <head> of the deployed HTML file and provides:
 *  1. EIP-6963 provider discovery
 *  2. A Proxy on window.ethereum that intercepts eth_requestAccounts
 *  3. A minimal wallet selection modal (inline HTML/CSS)
 *  4. localStorage-based auto-reconnect on page refresh
 *
 * It is NOT injected in the IDE preview (VM Bridge or parent.ethereum are used there).
 */
export function generateWalletSelectionScript(): string {
  return `<script>
(function() {
  'use strict';

  // ── 1. EIP-6963 Provider Discovery ──────────────────────────
  var _providers = [];
  var _providersReady = false;

  window.addEventListener('eip6963:announceProvider', function(event) {
    var detail = event.detail;
    // Avoid duplicates (by rdns)
    if (!_providers.some(function(p) { return p.info.rdns === detail.info.rdns; })) {
      _providers.push(detail);
    }
  });

  // Request providers — wallets that support EIP-6963 will respond
  window.dispatchEvent(new Event('eip6963:requestProvider'));

  // Give wallets 300ms to respond before marking ready
  setTimeout(function() { _providersReady = true; }, 300);

  // ── 2. Modal CSS ────────────────────────────────────────────
  var MODAL_CSS = [
    '.qdw-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
    '.qdw-modal{background:#fff;border-radius:16px;padding:24px;width:360px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:qdw-fadeIn .2s ease}',
    '.qdw-modal.dark{background:#1a1b1f;color:#e0e0e0}',
    '.qdw-title{font-size:18px;font-weight:700;margin:0 0 4px 0;text-align:center}',
    '.qdw-sub{font-size:13px;color:#888;margin:0 0 16px 0;text-align:center}',
    '.qdw-list{list-style:none;margin:0;padding:0}',
    '.qdw-item{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:12px;cursor:pointer;border:1px solid #e5e5e5;margin-bottom:8px;transition:background .15s,border-color .15s}',
    '.qdw-modal.dark .qdw-item{border-color:#333}',
    '.qdw-item:hover{background:#f5f5f5;border-color:#ccc}',
    '.qdw-modal.dark .qdw-item:hover{background:#2a2b30;border-color:#555}',
    '.qdw-icon{width:36px;height:36px;border-radius:8px;object-fit:contain;flex-shrink:0}',
    '.qdw-name{font-size:15px;font-weight:600}',
    '.qdw-rdns{font-size:11px;color:#999;margin-top:2px}',
    '.qdw-empty{text-align:center;color:#999;padding:24px 0;font-size:14px}',
    '.qdw-close{position:absolute;top:12px;right:16px;background:none;border:none;font-size:20px;cursor:pointer;color:#999;line-height:1}',
    '.qdw-close:hover{color:#333}',
    '.qdw-modal.dark .qdw-close:hover{color:#eee}',
    '@keyframes qdw-fadeIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}'
  ].join('\\n');

  // ── 3. Create & Show Modal ──────────────────────────────────
  var _modalPromise = null; // Singleton: only one modal at a time

  function showWalletModal() {
    if (_modalPromise) return _modalPromise;

    _modalPromise = new Promise(function(resolve, reject) {
      // Wait for providers if not ready
      function proceed() {
        // Check localStorage for previously selected wallet
        var savedRdns = null;
        try { savedRdns = localStorage.getItem('__qdapp_wallet_rdns'); } catch(e) {}
        if (savedRdns) {
          var found = _providers.find(function(p) { return p.info.rdns === savedRdns; });
          if (found) {
            _modalPromise = null;
            return resolve(found.provider);
          }
          // Saved wallet no longer available — clear and show modal
          try { localStorage.removeItem('__qdapp_wallet_rdns'); } catch(e) {}
        }

        // Single provider? Auto-select
        if (_providers.length === 1) {
          try { localStorage.setItem('__qdapp_wallet_rdns', _providers[0].info.rdns); } catch(e) {}
          _modalPromise = null;
          return resolve(_providers[0].provider);
        }

        // No providers? Fall back to legacy window.ethereum if captured
        if (_providers.length === 0) {
          if (window.__qdapp_legacy_ethereum) {
            _modalPromise = null;
            return resolve(window.__qdapp_legacy_ethereum);
          }
          _modalPromise = null;
          return reject(new Error('No Ethereum wallet detected. Please install a wallet extension.'));
        }

        // Multiple providers → show modal
        var isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

        // Inject CSS (once)
        if (!document.getElementById('qdw-style')) {
          var style = document.createElement('style');
          style.id = 'qdw-style';
          style.textContent = MODAL_CSS;
          document.head.appendChild(style);
        }

        var overlay = document.createElement('div');
        overlay.className = 'qdw-overlay';
        overlay.innerHTML = [
          '<div class="qdw-modal' + (isDark ? ' dark' : '') + '" style="position:relative">',
          '  <button class="qdw-close" data-action="close">&times;</button>',
          '  <p class="qdw-title">Connect Wallet</p>',
          '  <p class="qdw-sub">Choose a wallet to connect</p>',
          '  <ul class="qdw-list">',
          _providers.map(function(p, i) {
            return [
              '<li class="qdw-item" data-idx="' + i + '">',
              '  <img class="qdw-icon" src="' + (p.info.icon || '') + '" alt="" onerror="this.style.display=\\'none\\'">',
              '  <div>',
              '    <div class="qdw-name">' + escapeHtml(p.info.name) + '</div>',
              '    <div class="qdw-rdns">' + escapeHtml(p.info.rdns) + '</div>',
              '  </div>',
              '</li>'
            ].join('');
          }).join(''),
          '  </ul>',
          '</div>'
        ].join('\\n');

        // Event delegation
        overlay.addEventListener('click', function(e) {
          var target = e.target;

          // Close button
          if (target.getAttribute('data-action') === 'close') {
            document.body.removeChild(overlay);
            _modalPromise = null;
            return reject(new Error('User rejected wallet connection.'));
          }

          // Click on overlay background
          if (target === overlay) {
            document.body.removeChild(overlay);
            _modalPromise = null;
            return reject(new Error('User rejected wallet connection.'));
          }

          // Find the clicked item
          var item = target.closest('.qdw-item');
          if (item) {
            var idx = parseInt(item.getAttribute('data-idx'), 10);
            var selected = _providers[idx];
            if (selected) {
              try { localStorage.setItem('__qdapp_wallet_rdns', selected.info.rdns); } catch(e) {}
              document.body.removeChild(overlay);
              _modalPromise = null;
              resolve(selected.provider);
            }
          }
        });

        document.body.appendChild(overlay);
      }

      if (_providersReady) {
        proceed();
      } else {
        setTimeout(proceed, 350);
      }
    });

    return _modalPromise;
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // ── 4. Proxy window.ethereum ────────────────────────────────
  // Capture any existing window.ethereum (e.g. from legacy injection)
  if (window.ethereum) {
    window.__qdapp_legacy_ethereum = window.ethereum;
  }

  var _resolved = false;
  var _selectedProvider = null;
  var _eventListeners = {};

  function getProviderOrProxy() {
    if (_resolved && _selectedProvider) return _selectedProvider;

    return new Proxy({
      isMetaMask: true,  // Some DApps check this
      _isQuickDappProxy: true,

      request: function(args) {
        if (_resolved && _selectedProvider) {
          return _selectedProvider.request(args);
        }
        return showWalletModal().then(function(provider) {
          _selectedProvider = provider;
          _resolved = true;
          // Object.defineProperty getter will now return _selectedProvider
          // Replay any buffered event listeners
          Object.keys(_eventListeners).forEach(function(evt) {
            _eventListeners[evt].forEach(function(cb) {
              try { provider.on(evt, cb); } catch(e) {}
            });
          });
          return provider.request(args);
        });
      },

      on: function(event, cb) {
        if (_resolved && _selectedProvider) {
          return _selectedProvider.on(event, cb);
        }
        // Buffer listeners for later replay
        if (!_eventListeners[event]) _eventListeners[event] = [];
        _eventListeners[event].push(cb);
        return this;
      },

      removeListener: function(event, cb) {
        if (_resolved && _selectedProvider) {
          return _selectedProvider.removeListener(event, cb);
        }
        if (_eventListeners[event]) {
          _eventListeners[event] = _eventListeners[event].filter(function(l) { return l !== cb; });
        }
        return this;
      },

      removeAllListeners: function() {
        if (_resolved && _selectedProvider) {
          return _selectedProvider.removeAllListeners();
        }
        _eventListeners = {};
        return this;
      }
    }, {
      get: function(target, prop) {
        // If we already resolved, delegate everything
        if (_resolved && _selectedProvider) {
          var val = _selectedProvider[prop];
          if (typeof val === 'function') return val.bind(_selectedProvider);
          return val;
        }
        // Return target's own methods
        if (prop in target) {
          var v = target[prop];
          if (typeof v === 'function') return v.bind(target);
          return v;
        }
        return undefined;
      }
    });
  }

  // Use Object.defineProperty to prevent wallet extensions from overwriting our Proxy.
  // When MetaMask/Coinbase content scripts try to set window.ethereum, we capture
  // their provider but keep our Proxy in control until the user selects a wallet.
  var _proxyProvider = getProviderOrProxy();

  try {
    Object.defineProperty(window, 'ethereum', {
      get: function() {
        if (_resolved && _selectedProvider) return _selectedProvider;
        return _proxyProvider;
      },
      set: function(val) {
        if (val && !val._isQuickDappProxy) {
          window.__qdapp_legacy_ethereum = val;
        }
        if (_resolved) {
          _selectedProvider = val;
        }
      },
      configurable: true,
      enumerable: true
    });
  } catch (e) {
    // MetaMask (Chrome) may define window.ethereum as non-configurable before us.
    // Fall back to using the existing provider directly.
    console.warn('[QuickDapp] Cannot override window.ethereum:', e.message);
    if (window.ethereum) {
      window.__qdapp_legacy_ethereum = window.ethereum;
    }
  }

  console.log('[QuickDapp] Wallet selection script loaded. Detected', _providers.length, 'EIP-6963 providers.');
})();
</script>`;
}
