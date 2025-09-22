const domains = {
  'alpha.remix.live': 27,
  'beta.remix.live': 25,
  'remix.ethereum.org': 23,
  'localhost': 35 // remix desktop
}
const domainsOnPrem = {
  'alpha.remix.live': 1,
  'beta.remix.live': 2,
  'remix.ethereum.org': 3,
  'localhost': 4 // remix desktop
}

let cloudDomainToTrack = domains[window.location.hostname]
let domainOnPremToTrack = domainsOnPrem[window.location.hostname]


function trackDomain(domainToTrack, u, paqName) {
  var _paq = window[paqName] = window[paqName] || []

  /* tracker methods like "setCustomDimension" should be called before "trackPageView" */
  _paq.push(["setExcludedQueryParams", ["code", "gist"]]);
  _paq.push(["setExcludedReferrers", ["etherscan.io"]]);
  _paq.push(['enableJSErrorTracking']);
  _paq.push(['trackPageView']);
  _paq.push(['enableLinkTracking']);
  _paq.push(['enableHeartBeatTimer']);
  _paq.push(['setConsentGiven']);
  _paq.push(['requireCookieConsent']);
  _paq.push(['trackEvent', 'loader', 'load']);
  (function () {
    _paq.push(['setTrackerUrl', u + 'matomo.php']);
    _paq.push(['setSiteId', domainToTrack]);

    if (cloudDomainToTrack) {
      const secondaryTrackerUrl = 'https://ethereumfoundation.matomo.cloud/matomo.php'
      const secondaryWebsiteId = cloudDomainToTrack
      _paq.push(['addTracker', secondaryTrackerUrl, secondaryWebsiteId])
    }

    var d = document, g = d.createElement('script'), s = d.getElementsByTagName('script')[0];
    g.async = true; g.src = u + 'matomo.js'; s.parentNode.insertBefore(g, s);
  })();
}

if (window.electronAPI) {
  // desktop
  window.electronAPI.canTrackMatomo().then((canTrack) => {
    if (!canTrack) {
      console.log('Matomo tracking is disabled on Dev mode')
      return
    }
    window._paq = {
      push: function (...data) {
        if (!window.localStorage.getItem('config-v0.8:.remix.config') ||
          (window.localStorage.getItem('config-v0.8:.remix.config') && !window.localStorage.getItem('config-v0.8:.remix.config').includes('settings/matomo-analytics'))) {
            // require user tracking consent before processing data
        } else {
          if (JSON.parse(window.localStorage.getItem('config-v0.8:.remix.config'))['settings/matomo-analytics']) {
            window.electronAPI.trackEvent(...data)
          }
        }
      }
    }
  })
} else {
  // live site but we don't track localhost
  if (domainOnPremToTrack && window.location.hostname !== 'localhost') {
    trackDomain(domainOnPremToTrack, 'https://matomo.remix.live/matomo/', '_paq')    
  }
}
function isElectron() {
  // Renderer process
  if (typeof window !== 'undefined' && typeof window.process === 'object' && window.process.type === 'renderer') {
    return true
  }

  // Main process
  if (typeof process !== 'undefined' && typeof process.versions === 'object' && !!process.versions.electron) {
    return true
  }

  // Detect the user agent when the `nodeIntegration` option is set to false
  if (typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') >= 0) {
    return true
  }

  return false
}

const versionUrl = 'assets/version.json'
fetch(versionUrl, { cache: "no-store" }).then(response => {
  response.text().then(function (data) {
    const version = JSON.parse(data);
    console.log(`Loading Remix ${version.version}`);
  });
});
