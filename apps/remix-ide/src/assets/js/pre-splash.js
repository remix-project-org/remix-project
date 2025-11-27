(function(){
  try {
    // 1) Determine theme from Remix config stored in localStorage
    var raw = localStorage.getItem('config-v0.8:.remix.config');
    var theme = '';
    if (raw) {
      try {
        var cfg = JSON.parse(raw);
        theme = String((cfg && (cfg['settings/theme'] || (cfg.settings && (cfg.settings.theme || '')))) || '').toLowerCase();
      } catch (_) { theme = ''; }
    }

    var isLight = theme.indexOf('light') !== -1;
    document.documentElement.setAttribute('data-pre-theme', isLight ? 'light' : 'dark');

    // 2) Ensure the actual theme stylesheet is loaded ASAP (two themes supported)
    var existing = document.getElementById('pre-theme-css');
    if (!existing) {
      var href = isLight
        ? 'assets/css/themes/remix-light_powaqg.css'
        : 'assets/css/themes/remix-dark_tvx1s2.css';
      var link = document.createElement('link');
      link.id = 'pre-theme-css';
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }

    // 3) Refine splash content for Electron + OS without waiting for bundles
    var ua = navigator.userAgent || '';
    var low = ua.toLowerCase();
    var isElectron = low.indexOf('electron') !== -1;
    var title = document.getElementById('pre-splash-title');
    var sub = document.getElementById('pre-splash-sub');
    if (isElectron) {
      if (title) title.textContent = 'Remix Desktop';
      if (sub) {
        var os = low.indexOf('mac') !== -1 ? 'macOS' : (low.indexOf('win') !== -1 ? 'Windows' : (low.indexOf('linux') !== -1 ? 'Linux' : ''));
        sub.textContent = os ? ('Loading… ' + os) : 'Loading…';
      }
    } else {
      // Web: match Preload case for consistency
      if (title) title.textContent = 'REMIX IDE';
    }
  } catch (e) {
    // Last-resort fallback theme
    try { document.documentElement.setAttribute('data-pre-theme','dark'); } catch(_) {}
  }
})();
