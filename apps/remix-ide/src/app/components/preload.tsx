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
import isElectron from 'is-electron'
import { initEndpoints } from '@remix-endpoints-helper'

// _paq.push(['trackEvent', 'App', 'Preload', 'start'])

interface PreloadProps {
  root: any;
  trackingFunction: TrackingFunction;
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
      <div className="min-h-screen bg-body flex flex-col justify-center items-center p-8" >
        <div className="flex flex-col items-center max-w-md w-full">
          <div className="text-center mb-8">
            <img src="assets/img/remix-logo-blue.png" alt="Remix logo" width="64" height="64" />
            <div className="text-3xl font-bold text-body-text mt-4 mb-2">REMIX IDE</div>
            <div className="text-sm text-gray-400"><span className="cursor-pointer text-xs font-normal max-w-xs">v{version}</span></div>
          </div>
          {!supported ? (
            <div className="bg-warning/10 border border-warning text-warning-800 p-4 rounded-lg mb-4 w-full">
              Your browser does not support any of the filesystems required by Remix. Either change the settings in your browser or use a supported browser.
            </div>
          ) : null}
          {error ? (
            <div className="bg-danger/10 border border-danger text-danger-800 p-4 rounded-lg mb-4 w-full text-left">
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
            <div className="bg-info/10 border border-info text-info-800 p-4 rounded-lg mb-4 w-full">
              This app will be updated now. Please download a backup of your files now to make sure you don't lose your work.
              <br></br>
              You don't need to do anything else, your files will be available when the app loads.
              <div
                onClick={async () => {
                  await downloadBackup()
                }}
                data-id="downloadbackup-btn"
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-primary border-0 rounded hover:bg-primary/90 transition-colors cursor-pointer mt-2 mr-2"
              >
                download backup
              </div>
              <div
                onClick={async () => {
                  await migrateAndLoad()
                }}
                data-id="skipbackup-btn"
                className="inline-flex items-center px-3 py-2 text-sm font-medium text-white bg-primary border-0 rounded hover:bg-primary/90 transition-colors cursor-pointer mt-2"
              >
                skip backup
              </div>
            </div>
          ) : null}
          {supported && !error && !showDownloader ? (
            <div className='text-center mt-4'>
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" role="progressbar" aria-label="Loading"></div>
            </div>
          ) : null}
        </div>
        <div className="mt-8 text-center max-w-md">
          { tip && <div className='text-center mt-3 p-4 bg-surface-1 rounded-lg'>
            <div className="font-bold text-emphasis mb-2">DID YOU KNOW</div>
            <span className="text-body-text text-sm">{tip}</span>
          </div> }
        </div>
      </div>
    </>
  )
}

