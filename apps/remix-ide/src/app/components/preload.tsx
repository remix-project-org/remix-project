import { RemixApp } from '@remix-ui/app'
import axios from 'axios'
import React, { useState, useEffect, useRef } from 'react'
import { useTracking, TrackingProvider } from '../contexts/TrackingContext'
import { TrackingFunction } from '../utils/TrackingFunction'
import * as packageJson from '../../../../../package.json'
import * as remixDesktopPackageJson from '../../../../../apps/remixdesktop/package.json'
import { fileSystem, fileSystems } from '../files/fileSystem'
import { indexedDBFileSystem } from '../files/filesystems/indexedDB'
import { localStorageFS } from '../files/filesystems/localStorage'
import { fileSystemUtility, migrationTestData } from '../files/filesystems/fileSystemUtility'
import './styles/preload.css'
import isElectron from 'is-electron'
import { initEndpoints } from '@remix-endpoints-helper'

// _paq.push(['trackEvent', 'App', 'Preload', 'start'])

interface PreloadProps {
  root: any;
  trackingFunction: TrackingFunction;
}

function isProbablyMobile() {
  const userAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const screenWidth = window.innerWidth <= 768;
  const touchSupport = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return userAgent || (screenWidth && touchSupport);
}

const NO_MOBILE_REDIRECT_KEY = 'remix.nomobileredirect'

/**
 * Check whether the user has opted out of the mobile redirect.
 *
 * When the `nomobileredirect` flag is found in the URL (search or hash),
 * persist that decision to localStorage and strip the flag from the URL so
 * subsequent reloads stay clean. On later visits we just read the persisted
 * value instead of relying on the URL.
 *
 * Returns the source of the opt-out so the caller can track it:
 *  - 'url'      : flag came from the current URL (first time / explicit override)
 *  - 'storage'  : flag was persisted from a previous visit
 *  - 'none'     : no opt-out, mobile redirect should run
 */
function checkAndPersistNoMobileRedirect(): 'url' | 'storage' | 'none' {
  try {
    if (!window.location) return 'none'

    const FLAG = 'nomobileredirect'
    const search = window.location.search || ''
    const hash = window.location.hash || ''
    const inSearch = search.indexOf(FLAG) !== -1
    const inHash = hash.indexOf(FLAG) !== -1

    if (inSearch || inHash) {
      try { window.localStorage.setItem(NO_MOBILE_REDIRECT_KEY, 'true') } catch (_) { /* storage may be blocked */ }

      // Strip the flag from the URL without reloading the page.
      try {
        const stripFromQuery = (q: string) => {
          if (!q) return q
          const prefix = q.startsWith('?') ? '?' : ''
          const params = new URLSearchParams(prefix ? q.slice(1) : q)
          params.delete(FLAG)
          const next = params.toString()
          return next ? `${prefix}${next}` : ''
        }
        const stripFromHash = (h: string) => {
          if (!h) return h
          // Hash may contain a query-like segment ("#/path?foo=1") or just "#foo=1".
          const hashBody = h.startsWith('#') ? h.slice(1) : h
          const qIdx = hashBody.indexOf('?')
          if (qIdx !== -1) {
            const path = hashBody.slice(0, qIdx)
            const query = stripFromQuery(hashBody.slice(qIdx))
            return `#${path}${query}`
          }
          // Treat the whole hash body as an &-separated key list.
          const parts = hashBody.split('&').filter(p => p && p !== FLAG && !p.startsWith(`${FLAG}=`))
          return parts.length ? `#${parts.join('&')}` : ''
        }

        const newSearch = stripFromQuery(search)
        const newHash = stripFromHash(hash)
        if (newSearch !== search || newHash !== hash) {
          const newUrl = window.location.pathname + newSearch + newHash
          window.history.replaceState(null, '', newUrl)
        }
      } catch (_) { /* history API may not be available */ }

      return 'url'
    }

    try {
      return window.localStorage.getItem(NO_MOBILE_REDIRECT_KEY) === 'true' ? 'storage' : 'none'
    } catch (_) {
      return 'none'
    }
  } catch (_) {
    return 'none'
  }
}

export const Preload = (props: PreloadProps) => {
  const { trackMatomoEvent } = useTracking()
  const [tip, setTip] = useState<string>('')
  const [supported, setSupported] = useState<boolean>(true)
  const [error, setError] = useState<boolean>(false)
  const [showDownloader, setShowDownloader] = useState<boolean>(false)
  const remixFileSystems = useRef<fileSystems>(new fileSystems())
  const remixIndexedDB = useRef<fileSystem>(new indexedDBFileSystem())
  const localStorageFileSystem = useRef<fileSystem>(new localStorageFS())
  const version = isElectron() ? remixDesktopPackageJson.version : packageJson.version
  // url parameters to e2e test the fallbacks and error warnings
  const testmigrationFallback = useRef<boolean>(
    window.location.hash.includes('e2e_testmigration_fallback=true') && window.location.host === '127.0.0.1:8080' && window.location.protocol === 'http:'
  )
  const testmigrationResult = useRef<boolean>(
    window.location.hash.includes('e2e_testmigration=true') && window.location.host === '127.0.0.1:8080' && window.location.protocol === 'http:'
  )
  const testBlockStorage = useRef<boolean>(
    window.location.hash.includes('e2e_testblock_storage=true') && window.location.host === '127.0.0.1:8080' && window.location.protocol === 'http:'
  )

  function loadAppComponent() {
    try {
      const noMobileRedirectSource = checkAndPersistNoMobileRedirect()
      const noMobileRedirect = noMobileRedirectSource !== 'none'
      if (noMobileRedirect && isProbablyMobile()) {
        // Track that the redirect was overridden so we can tell the difference
        // between an explicit URL override ('url') and a persisted opt-out
        // from a previous visit ('storage').
        trackMatomoEvent?.({ category: 'App', action: 'MobileRedirectOverride', name: noMobileRedirectSource, isClick: false })
      }
      if (!noMobileRedirect && isProbablyMobile()) {
        // Make sure the tracking beacon actually leaves the page before we
        // navigate away. Matomo's trackEvent only enqueues the request on
        // window._paq; the HTTP request would otherwise be cancelled by the
        // immediate window.location.replace below.
        const paq = (window as any)._paq
        const useBeacon = Array.isArray(paq)
        if (useBeacon) {
          // Ensure the request survives the navigation.
          paq.push(['alwaysUseSendBeacon'])
        }
        trackMatomoEvent?.({ category: 'App', action: 'MobileRedirect', name: '', isClick: false })

        const doRedirect = (() => {
          let done = false
          return () => {
            if (done) return
            done = true
            window.location.replace('https://mobile.remix.live')
          }
        })()

        if (useBeacon) {
          // Matomo runs functions pushed to _paq after the preceding tracking
          // commands have been dispatched, so this fires once the beacon is on
          // its way. We still cap the wait so a failing tracker can't block.
          paq.push([doRedirect])
        }
        // Safety timeout in case the tracker never processes the queue
        // (blocked, not loaded, opted out, etc.).
        setTimeout(doRedirect, 600)
        return
      }
    } catch (e) {
      console.error('Error detecting mobile device:', e)
    }

    initEndpoints().then(() => import('../../app'))
      .then((AppComponent) => {
        const appComponent = new AppComponent.default()
        appComponent.run().then(() => {
          props.root.render(
            <TrackingProvider trackingFunction={props.trackingFunction}>
              <RemixApp app={appComponent} />
            </TrackingProvider>
          )
        })
      })
      .catch((err) => {
        trackMatomoEvent?.({ category: 'App', action: 'PreloadError', name: err && err.message, isClick: false })
        console.error('Error loading Remix:', err)
        setError(true)
      })
  }

  const downloadBackup = async () => {
    setShowDownloader(false)
    const fsUtility = new fileSystemUtility()
    await fsUtility.downloadBackup(remixFileSystems.current.fileSystems['localstorage'])
    await migrateAndLoad()
  }

  const migrateAndLoad = async () => {
    setShowDownloader(false)
    const fsUtility = new fileSystemUtility()
    const migrationResult = await fsUtility.migrate(localStorageFileSystem.current, remixIndexedDB.current)
    trackMatomoEvent?.({ category: 'Migrate', action: 'result', name: migrationResult ? 'success' : 'fail', isClick: false })
    await setFileSystems()
  }

  const setFileSystems = async () => {
    const fsLoaded = await remixFileSystems.current.setFileSystem([
      testmigrationFallback.current || testBlockStorage.current ? null : remixIndexedDB.current,
      testBlockStorage.current ? null : localStorageFileSystem.current
    ])
    if (fsLoaded) {
      console.log(fsLoaded.name + ' activated')
      trackMatomoEvent?.({ category: 'Storage', action: 'activate', name: fsLoaded.name, isClick: false })
      loadAppComponent()
    } else {
      trackMatomoEvent?.({ category: 'Storage', action: 'error', name: 'no supported storage', isClick: false })
      setSupported(false)
    }
  }

  const testmigration = async () => {
    if (testmigrationResult.current) {
      const fsUtility = new fileSystemUtility()
      fsUtility.populateWorkspace(migrationTestData, remixFileSystems.current.fileSystems['localstorage'].fs)
    }
  }

  useEffect(() => {
    // Remove pre-splash as soon as React preloader mounts
    try {
      const splash = document.getElementById('pre-splash')
      if (splash && splash.parentNode) splash.parentNode.removeChild(splash)
    } catch (_) { /* noop */ }

    if (isElectron()) {
      loadAppComponent()
      return
    }
    async function loadStorage() {
      ; (await remixFileSystems.current.addFileSystem(remixIndexedDB.current)) || trackMatomoEvent?.({ category: 'Storage', action: 'error', name: 'indexedDB not supported', isClick: false })
      ; (await remixFileSystems.current.addFileSystem(localStorageFileSystem.current)) || trackMatomoEvent?.({ category: 'Storage', action: 'error', name: 'localstorage not supported', isClick: false })
      await testmigration()
      remixIndexedDB.current.loaded && (await remixIndexedDB.current.checkWorkspaces())
      localStorageFileSystem.current.loaded && (await localStorageFileSystem.current.checkWorkspaces())
      remixIndexedDB.current.loaded && (remixIndexedDB.current.hasWorkSpaces || !localStorageFileSystem.current.hasWorkSpaces ? await setFileSystems() : setShowDownloader(true))
      !remixIndexedDB.current.loaded && (await setFileSystems())
    }
    loadStorage()

    const abortController = new AbortController()
    const signal = abortController.signal
    async function showRemixTips() {
      const response = await axios.get('https://raw.githubusercontent.com/remix-project-org/remix-dynamics/main/ide/tips.json', { signal })
      if (signal.aborted) return
      const tips = response.data
      const index = Math.floor(Math.random() * (tips.length - 1))
      setTip(tips[index])
    }
    try {
      showRemixTips()
    } catch (e) {
      console.log(e)
    }

    return () => {
      abortController.abort();
    };
  }, [])

  return (
    <>
      <div className="preload-container" >
        <div className="preload-main">
          <div className="preload-logo text-center">
            <img src="assets/img/remix-logo-blue.png" alt="Remix logo" width="64" height="64" />
            <div className="preload-title">REMIX IDE</div>
            <div className="preload-sub"><span className="version">v{version}</span></div>
          </div>
          {!supported ? (
            <div className="preload-info-container alert alert-warning">
              Your browser does not support any of the filesystems required by Remix. Either change the settings in your browser or use a supported browser.
            </div>
          ) : null}
          {error ? (
            <div className="preload-info-container alert alert-danger text-start">
              An unknown error has occurred while loading the application.
              <br></br>
              Doing a hard refresh might fix this issue:<br></br>
              <div className="pt-2">
                Windows:<br></br>- Chrome: CTRL + F5 or CTRL + Reload Button
                <br></br>- Firefox: CTRL + SHIFT + R or CTRL + F5<br></br>
              </div>
              <div className="pt-2">
                MacOS:<br></br>- Chrome & FireFox: CMD + SHIFT + R or SHIFT + Reload Button<br></br>
              </div>
              <div className="pt-2">
                Linux:<br></br>- Chrome & FireFox: CTRL + SHIFT + R<br></br>
              </div>
            </div>
          ) : null}
          {showDownloader ? (
            <div className="preload-info-container alert alert-info">
              This app will be updated now. Please download a backup of your files now to make sure you don't lose your work.
              <br></br>
              You don't need to do anything else, your files will be available when the app loads.
              <div
                onClick={async () => {
                  await downloadBackup()
                }}
                data-id="downloadbackup-btn"
                className="btn btn-primary mt-1"
              >
                download backup
              </div>
              <div
                onClick={async () => {
                  await migrateAndLoad()
                }}
                data-id="skipbackup-btn"
                className="btn btn-primary mt-1"
              >
                skip backup
              </div>
            </div>
          ) : null}
          {supported && !error && !showDownloader ? (
            <div className='text-center' style={{ marginTop: '16px' }}>
              <div className="pre-splash-spinner" role="progressbar" aria-label="Loading"></div>
            </div>
          ) : null}
        </div>
        <div className="preload-bottom opt-out">
          { tip && <div className='remix_tips text-center mt-3'>
            <div><b>DID YOU KNOW</b></div>
            <span>{tip}</span>
          </div> }
        </div>
      </div>
    </>
  )
}

