/**
 * Generates the wallet-selection injection script for IPFS-deployed DApps.
 *
 * This script is injected into the <head> of the deployed HTML file and provides:
 *  1. EIP-6963 provider discovery
 *  2. A wallet selection modal (inline HTML/CSS)
 *  3. A global `window.__qdapp_getProvider()` function for DApp code to call
 *  4. localStorage-based auto-reconnect on page refresh
 *  5. Coinbase Smart Wallet as fallback (no extension needed — passkey-based)
 *
 * It does NOT override `window.ethereum` — avoids conflicts with MetaMask/Coinbase.
 * It is NOT injected in the IDE preview (VM Bridge or parent.ethereum are used there).
 */
export function generateWalletSelectionScript(): string {
  return `<script>
(function() {
  'use strict';

  var LOG = '[QuickDapp:Wallet]';
  var LOG_SW = '[QuickDapp:SmartWallet]';

  // ── 1. EIP-6963 Provider Discovery ──────────────────────────
  var _providers = [];
  var _providersReady = false;

  window.addEventListener('eip6963:announceProvider', function(event) {
    var detail = event.detail;
    // Avoid duplicates (by rdns)
    if (!_providers.some(function(p) { return p.info.rdns === detail.info.rdns; })) {
      _providers.push(detail);
      console.log(LOG, 'Discovered wallet:', detail.info.name, '(' + detail.info.rdns + ')');
    }
  });

  // Request providers — wallets that support EIP-6963 will respond
  window.dispatchEvent(new Event('eip6963:requestProvider'));

  // Give wallets 300ms to respond before marking ready
  setTimeout(function() {
    _providersReady = true;
    console.log(LOG, 'Provider discovery complete. Found', _providers.length, 'wallet(s).');
  }, 300);

  // ── 2. Coinbase Smart Wallet SDK (lazy-loaded) ──────────────
  var _smartWalletProvider = null;
  var _smartWalletLoading = false;
  var SMART_WALLET_RDNS = 'com.coinbase.smartwallet';
  var CB_SDK_URL = 'https://esm.sh/@coinbase/wallet-sdk@4.3.0';

  function createSmartWalletProvider() {
    if (_smartWalletProvider) {
      console.log(LOG_SW, 'Returning cached provider.');
      return Promise.resolve(_smartWalletProvider);
    }
    if (_smartWalletLoading) {
      console.log(LOG_SW, 'SDK is already loading, waiting...');
      return new Promise(function(resolve, reject) {
        var check = setInterval(function() {
          if (_smartWalletProvider) {
            clearInterval(check);
            resolve(_smartWalletProvider);
          }
        }, 100);
        setTimeout(function() {
          clearInterval(check);
          if (!_smartWalletProvider) {
            reject(new Error('Smart Wallet SDK load timeout'));
          }
        }, 15000);
      });
    }

    _smartWalletLoading = true;
    console.log(LOG_SW, 'Step 1/3: Loading SDK from', CB_SDK_URL);

    return import(CB_SDK_URL)
      .then(function(module) {
        console.log(LOG_SW, 'Step 2/3: SDK loaded. Module keys:', Object.keys(module).join(', '));

        var SDK = module.CoinbaseWalletSDK || module.default;
        if (!SDK) {
          throw new Error('CoinbaseWalletSDK constructor not found in module. Available exports: ' + Object.keys(module).join(', '));
        }

        console.log(LOG_SW, 'Step 2/3: Initializing CoinbaseWalletSDK...');
        var sdk = new SDK({
          appName: document.title || 'Quick DApp',
          appChainIds: [8453, 84532],
        });

        console.log(LOG_SW, 'Step 3/3: Creating Web3 provider (smartWalletOnly mode)...');
        var provider = sdk.makeWeb3Provider({ options: 'smartWalletOnly' });

        if (!provider) {
          throw new Error('makeWeb3Provider() returned null/undefined');
        }

        _smartWalletProvider = provider;
        _smartWalletLoading = false;

        console.log(LOG_SW, 'Provider created. Requesting account authorization...');

        // Smart Wallet requires explicit eth_requestAccounts before any other call
        return provider.request({ method: 'eth_requestAccounts' })
          .then(function(accounts) {
            console.log(LOG_SW, 'Connected! Accounts:', accounts);
            return provider;
          })
          .catch(function(authErr) {
            console.error(LOG_SW, 'Authorization failed:', authErr.message);
            _smartWalletProvider = null; // Reset so user can retry
            throw authErr;
          });
      })
      .catch(function(err) {
        _smartWalletLoading = false;
        console.error(LOG_SW, 'Failed to create provider:', err.message);
        console.error(LOG_SW, 'Full error:', err);
        throw err;
      });
  }

  // ── 3. Modal CSS ────────────────────────────────────────────
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
    '.qdw-badge{display:inline-block;font-size:10px;font-weight:700;background:#0052FF;color:#fff;padding:2px 6px;border-radius:4px;margin-left:8px;vertical-align:middle}',
    '@keyframes qdw-fadeIn{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}'
  ].join('\\n');

  // Coinbase Smart Wallet SVG icon (inline, no external dependency)
  var CB_ICON_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'%3E%3Crect width='36' height='36' rx='8' fill='%230052FF'/%3E%3Cpath d='M18 6C11.373 6 6 11.373 6 18s5.373 12 12 12 12-5.373 12-12S24.627 6 18 6zm-2.4 8.4h4.8c.663 0 1.2.537 1.2 1.2v4.8c0 .663-.537 1.2-1.2 1.2h-4.8c-.663 0-1.2-.537-1.2-1.2v-4.8c0-.663.537-1.2 1.2-1.2z' fill='%23fff'/%3E%3C/svg%3E";

  // ── 4. Create & Show Modal ──────────────────────────────────
  var _modalPromise = null; // Singleton: only one modal at a time

  function showWalletModal() {
    if (_modalPromise) return _modalPromise;

    _modalPromise = new Promise(function(resolve, reject) {
      // Wait for providers if not ready
      function proceed() {
        console.log(LOG, 'Proceeding with', _providers.length, 'EIP-6963 provider(s), window.ethereum:', !!window.ethereum);

        // Check localStorage for previously selected wallet
        var savedRdns = null;
        try { savedRdns = localStorage.getItem('__qdapp_wallet_rdns'); } catch(e) {}
        if (savedRdns) {
          // Check if saved wallet is Smart Wallet
          if (savedRdns === SMART_WALLET_RDNS) {
            console.log(LOG_SW, 'Auto-reconnecting to Smart Wallet (saved preference).');
            _modalPromise = null;
            return createSmartWalletProvider().then(resolve).catch(function(err) {
              console.warn(LOG_SW, 'Auto-reconnect failed, clearing saved preference:', err.message);
              try { localStorage.removeItem('__qdapp_wallet_rdns'); } catch(e) {}
              // Retry without saved preference
              _modalPromise = null;
              showWalletModal().then(resolve).catch(reject);
            });
          }

          var found = _providers.find(function(p) { return p.info.rdns === savedRdns; });
          if (found) {
            console.log(LOG, 'Auto-reconnecting to saved wallet:', found.info.name);
            _modalPromise = null;
            return resolve(found.provider);
          }
          // Saved wallet no longer available — clear and show modal
          try { localStorage.removeItem('__qdapp_wallet_rdns'); } catch(e) {}
        }

        // No wallets at all → create Coinbase Smart Wallet directly
        if (_providers.length === 0 && !window.ethereum) {
          console.log(LOG_SW, 'No wallet detected. Creating Coinbase Smart Wallet as fallback...');
          _modalPromise = null;
          return createSmartWalletProvider()
            .then(function(provider) {
              try { localStorage.setItem('__qdapp_wallet_rdns', SMART_WALLET_RDNS); } catch(e) {}
              resolve(provider);
            })
            .catch(function(err) {
              console.error(LOG_SW, 'Fallback failed:', err.message);
              reject(new Error('No wallet detected and Smart Wallet creation failed: ' + err.message));
            });
        }

        // Multiple providers → show modal (with Smart Wallet as extra option)
        var isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

        // Inject CSS (once)
        if (!document.getElementById('qdw-style')) {
          var style = document.createElement('style');
          style.id = 'qdw-style';
          style.textContent = MODAL_CSS;
          document.head.appendChild(style);
        }

        // Build provider list HTML (EIP-6963 wallets + Smart Wallet)
        var providerListHtml = _providers.map(function(p, i) {
          return [
            '<li class="qdw-item" data-idx="' + i + '">',
            '  <img class="qdw-icon" src="' + (p.info.icon || '') + '" alt="" onerror="this.hidden=true">',
            '  <div>',
            '    <div class="qdw-name">' + escapeHtml(p.info.name) + '</div>',
            '    <div class="qdw-rdns">' + escapeHtml(p.info.rdns) + '</div>',
            '  </div>',
            '</li>'
          ].join('');
        }).join('');

        // Add Smart Wallet option (always shown in multi-wallet modal)
        var smartWalletHtml = [
          '<li class="qdw-item" data-smartwallet="true">',
          '  <img class="qdw-icon" src="' + CB_ICON_SVG + '" alt="">',
          '  <div>',
          '    <div class="qdw-name">Coinbase Smart Wallet <span class="qdw-badge">NEW</span></div>',
          '    <div class="qdw-rdns">No extension needed · Passkey</div>',
          '  </div>',
          '</li>'
        ].join('');

        var overlay = document.createElement('div');
        overlay.className = 'qdw-overlay';
        overlay.innerHTML = [
          '<div class="qdw-modal' + (isDark ? ' dark' : '') + '" style="position:relative">',
          '  <button class="qdw-close" data-action="close">&times;</button>',
          '  <p class="qdw-title">Connect Wallet</p>',
          '  <p class="qdw-sub">Choose a wallet to connect</p>',
          '  <ul class="qdw-list">',
          providerListHtml,
          smartWalletHtml,
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
          if (!item) return;

          // Smart Wallet option clicked
          if (item.getAttribute('data-smartwallet') === 'true') {
            console.log(LOG_SW, 'User selected Smart Wallet from modal.');
            document.body.removeChild(overlay);
            _modalPromise = null;
            createSmartWalletProvider()
              .then(function(provider) {
                try { localStorage.setItem('__qdapp_wallet_rdns', SMART_WALLET_RDNS); } catch(e) {}
                resolve(provider);
              })
              .catch(function(err) {
                console.error(LOG_SW, 'Smart Wallet creation failed after user selection:', err.message);
                reject(err);
              });
            return;
          }

          // Regular EIP-6963 wallet clicked
          var idx = parseInt(item.getAttribute('data-idx'), 10);
          var selected = _providers[idx];
          if (selected) {
            try { localStorage.setItem('__qdapp_wallet_rdns', selected.info.rdns); } catch(e) {}
            document.body.removeChild(overlay);
            _modalPromise = null;
            resolve(selected.provider);
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

  // ── 5. Expose global provider getter ────────────────────────
  // DApp code calls: window.__qdapp_getProvider()
  // Returns a Promise<EIP1193Provider> — either auto-selected or user-picked.
  window.__qdapp_getProvider = function() {
    return showWalletModal();
  };

  console.log(LOG, 'Wallet selection script loaded. Smart Wallet SDK URL:', CB_SDK_URL);
})();
</script>`;
}
