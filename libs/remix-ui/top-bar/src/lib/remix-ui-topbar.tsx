/* eslint-disable @nrwl/nx/enforce-module-boundaries */
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import BasicLogo from '../components/BasicLogo'
//@ts-ignore
import '../css/topbar.css'
import { Dropdown } from 'react-bootstrap'
import { CustomToggle } from 'libs/remix-ui/helper/src/lib/components/custom-dropdown'
import { WorkspaceMetadata } from 'libs/remix-ui/workspace/src/lib/types'
import { CloudToggle } from 'libs/remix-ui/workspace/src/lib/cloud/cloud-sync-status-icon'
import { enableCloud, disableCloud } from 'libs/remix-ui/workspace/src/lib/cloud/cloud-workspace-actions'
import { cloudStore } from 'libs/remix-ui/workspace/src/lib/cloud/cloud-store'
import { AppContext, platformContext } from 'libs/remix-ui/app/src/lib/remix-app/context/context'
import { useAuth } from 'libs/remix-ui/app/src/lib/remix-app/context/auth-context'
import { FormattedMessage, useIntl } from 'react-intl'
import { TopbarContext } from '../context/topbarContext'
import { WorkspacesDropdown } from '../components/WorkspaceDropdown'
import { useOnClickOutside } from 'libs/remix-ui/remix-ai-assistant/src/components/onClickOutsideHook'
import { deleteWorkspace, fetchWorkspaceDirectory, deleteAllWorkspaces as deleteAllWorkspacesAction, handleDownloadFiles, handleDownloadWorkspace, handleExpandPath, publishToGist, renameWorkspace, restoreBackupZip, switchToWorkspace } from 'libs/remix-ui/workspace/src/lib/actions'
import { GitHubUser } from 'libs/remix-api/src/lib/types/git'
import { GitHubCallback } from '../topbarUtils/gitOauthHandler'
import { CustomTooltip } from 'libs/remix-ui/helper/src/lib/components/custom-tooltip'
import { useCloneRepositoryModal } from '../components/CloneRepositoryModal'
import { TrackingContext } from '@remix-ide/tracking'
import { MatomoEvent, TopbarEvent, WorkspaceEvent, LoginMode, LoginModeResponse, Features } from '@remix-api'
import { LoginButton } from '@remix-ui/login'
import { parseMigrationConfig, shouldPromptMigration } from '@remix-ui/domain-migration'
import { LoginModal } from 'libs/remix-ui/login/src/lib/modals/login-modal'
import { appActionTypes } from 'libs/remix-ui/app/src/lib/remix-app/actions/app'
import { NotificationBell } from '../components/NotificationBell'
import { CartButton } from '../components/CartButton'
import { FeedbackPanel } from '../components/FeedbackPanel'
import { BetaPromoPill } from '../components/BetaPromoPill'

export function RemixUiTopbar() {
  const intl = useIntl()
  const [showDropdown, setShowDropdown] = useState(false)
  const platform = useContext(platformContext)
  const global = useContext(TopbarContext)
  const appContext = useContext(AppContext)
  const { trackMatomoEvent: baseTrackEvent } = useContext(TrackingContext)
  const trackMatomoEvent = <T extends MatomoEvent = TopbarEvent>(event: T) => {
    baseTrackEvent?.<T>(event)
  }
  const plugin = global.plugin
  const LOCALHOST = ' - connect to localhost - '
  const NO_WORKSPACE = ' - none - '
  const ROOT_PATH = '/'

  const [currentWorkspace, setCurrentWorkspace] = useState<string>(NO_WORKSPACE)
  //@ts-ignore
  const [currentMenuItemName, setCurrentMenuItemName] = useState<string>(null)
  const [currentTheme, setCurrentTheme] = useState<any>(null)
  const [latestReleaseNotesUrl, setLatestReleaseNotesUrl] = useState<string>('')
  const [currentReleaseVersion, setCurrentReleaseVersion] = useState<string>('')
  const [menuItems, setMenuItems] = useState<any[]>([])
  const subMenuIconRef = useRef<any>(null)
  const [showSubMenuFlyOut, setShowSubMenuFlyOut] = useState<boolean>(false)
  useOnClickOutside([subMenuIconRef], () => setShowSubMenuFlyOut(false))
  const workspaceRenameInput: any = useRef<HTMLInputElement>()
  const [leftPanelHidden, setLeftPanelHidden] = useState<boolean>(false)
  const [bottomPanelHidden, setBottomPanelHidden] = useState<boolean>(false)
  const [rightPanelHidden, setRightPanelHidden] = useState<boolean>(false)

  const [user, setUser] = useState<GitHubUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loginMode, setLoginMode] = useState<LoginMode | null>(null);
  const [loginModeMessage, setLoginModeMessage] = useState<string>('');
  const [adminOverride, setAdminOverride] = useState<boolean>(false);
  const [cloudEnabled, setCloudEnabled] = useState<boolean>(true); // default true until config loaded
  const [feedbackFormUrl, setFeedbackFormUrl] = useState<string | null>(null);
  const [feedbackPanelOpen, setFeedbackPanelOpen] = useState<boolean>(false);
  const [showCloudLoginModal, setShowCloudLoginModal] = useState<boolean>(false);
  const [isNonMaximizedWindow, setIsNonMaximizedWindow] = useState(false)
  const [compactRightLabels, setCompactRightLabels] = useState(false)
  const [compactPanelControl, setCompactPanelControl] = useState(false)
  const [panelControlMenuOpen, setPanelControlMenuOpen] = useState(false)
  const [aiPanelActive, setAiPanelActive] = useState<boolean>(false)
  const sectionRef = useRef<HTMLElement>(null)
  const panelControlRef = useRef<HTMLDivElement>(null)
  const rightSideRef = useRef<HTMLDivElement>(null)
  const labelsCompactRef = useRef(false)
  const panelCompactRef = useRef(false)
  // Selenium/Nightwatch sets navigator.webdriver; same signal BotDetector uses.
  // E2E tests target data-ids on the inline panel toggles, so never collapse them under e2e.
  const isE2E = typeof navigator !== 'undefined' && (navigator as any).webdriver === true

  // Auth state for cloud backup/restore and support link
  const { isAuthenticated, token, features } = useAuth()

  // Use the clone repository modal hook
  const { showCloneModal } = useCloneRepositoryModal({
    intl,
    platform,
    plugin: global.plugin
  });

  // Check if we're on the callback page
  if (window.location.pathname === '/auth/github/callback') {
    return <GitHubCallback />;
  }

  // Derive whether login UI should be shown based on ACL login mode
  // 'open' or 'feature_group' => show normally
  // 'admins_only' => hidden unless admin override
  // 'closed' => hidden entirely
  // null (not yet fetched) => hidden (safe default)
  const showLoginUI = (() => {
    if (!loginMode) return false
    if (loginMode === 'closed') return false
    if (loginMode === 'admins_only') return adminOverride
    return true // 'open' or 'feature_group'
  })()

  const cloudEnabledByConfig = appContext?.appConfig?.['cloud.enabled'] !== false
  const cloudVisibilityMode = appContext?.appConfig?.['cloud.button_visibility'] || 'authenticated_users'
  const notificationMode = appContext?.appConfig?.['notifications.mode'] || 'all_users'
  const supportEnabled = appContext?.appConfig?.['app.supportenabled'] !== false
  const showJoinBetaTopButton = appContext?.appConfig?.['show_join_beta_top_button'] !== false

  // Destination host when this origin is being retired, otherwise null so the
  // menu entry stays hidden.
  const migrationTarget = (() => {
    const config = parseMigrationConfig((key) => appContext?.appConfig?.[key])
    return shouldPromptMigration(config) ? config.toDomain : null
  })()

  const isVisibleByAudience = (mode: 'off' | 'authenticated_users' | 'all_users', authenticated: boolean): boolean => {
    if (mode === 'off') return false
    if (mode === 'authenticated_users') return authenticated
    return true
  }

  const hasCloudStoragePermission = features[Features.STORAGE_S3]?.is_enabled === true
  const showCloudToggle = showLoginUI && cloudEnabledByConfig && cloudEnabled && hasCloudStoragePermission && isVisibleByAudience(cloudVisibilityMode, isAuthenticated)
  const showNotificationBell = isVisibleByAudience(notificationMode, isAuthenticated)

  const measureTopbarLayout = () => {
    const maximizedViewportWidth = window.screen?.availWidth || window.innerWidth
    const nonMaximizedTolerance = 120
    const shouldUseCompactLayout = window.innerWidth < maximizedViewportWidth - nonMaximizedTolerance

    setIsNonMaximizedWindow(shouldUseCompactLayout)
  }

  useEffect(() => {
    measureTopbarLayout()
    window.addEventListener('resize', measureTopbarLayout)

    return () => {
      window.removeEventListener('resize', measureTopbarLayout)
    }
  }, [])

  useEffect(() => { labelsCompactRef.current = compactRightLabels }, [compactRightLabels])
  useEffect(() => { panelCompactRef.current = compactPanelControl }, [compactPanelControl])

  const measure = useCallback(() => {
    if (!panelControlRef.current || !rightSideRef.current) return
    const gap =
      rightSideRef.current.getBoundingClientRect().left -
      panelControlRef.current.getBoundingClientRect().right

    const labelsCompact = labelsCompactRef.current
    const panelCompact = panelCompactRef.current

    if (!labelsCompact && gap < 24) return setCompactRightLabels(true)
    if (labelsCompact && !panelCompact && gap < 24) return setCompactPanelControl(true)
    if (panelCompact && gap > 100) return setCompactPanelControl(false)
    if (labelsCompact && !panelCompact && gap > 90) return setCompactRightLabels(false)
  }, [])

  useEffect(() => {
    if (!sectionRef.current) return
    let frameId: number

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(measure)
    })
    observer.observe(sectionRef.current)
    measure()

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frameId)
    }
  }, [measure])

  // Re-measure when our own compact state changes.
  useEffect(() => {
    const id = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(id)
  }, [measure, compactRightLabels, compactPanelControl])

  useEffect(() => {
    // Fetch login mode from auth plugin
    const fetchLoginMode = async () => {
      try {
        const result: LoginModeResponse = await plugin.call('auth', 'getLoginMode')
        setLoginMode(result.mode)
        setLoginModeMessage(result.message || '')
      } catch (e) {
        console.warn('[Topbar] Failed to fetch login mode:', e)
        // Fallback: check legacy localStorage flag
        const legacyEnabled = localStorage.getItem('enableLogin') === 'true'
        setLoginMode(legacyEnabled ? 'open' : null)
      }
    }
    fetchLoginMode()

    // Listen for login mode changes
    const handleLoginModeChanged = (result: LoginModeResponse) => {
      setLoginMode(result.mode)
      setLoginModeMessage(result.message || '')
    }
    plugin.on('auth', 'loginModeChanged', handleLoginModeChanged)

    // Admin backdoor: Ctrl+Shift+Alt+L to toggle admin override
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.altKey && e.key === 'L') {
        e.preventDefault()
        setAdminOverride(prev => {
          const next = !prev
          console.log(`[Topbar] Admin login override ${next ? 'enabled' : 'disabled'}`)
          return next
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      plugin.off('auth', 'loginModeChanged')
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, []);

  useEffect(() => {
    const enabled = appContext?.appConfig?.['cloud.enabled']
    if (enabled !== undefined) {
      setCloudEnabled(enabled as boolean)
    }
  }, [appContext?.appConfig])

  // Listen to feedback plugin for form URL
  useEffect(() => {
    const initFeedback = async () => {
      try {
        const isActive = await plugin.call('manager', 'isActive', 'feedback')
        if (isActive) {
          const form = await plugin.call('feedback', 'getFeedbackForm')
          if (form && form.url) setFeedbackFormUrl(form.url)
        }
      } catch (e) {
        console.debug('[Topbar] Feedback plugin not ready yet')
      }
    }
    initFeedback()

    plugin.on('feedback', 'feedbackFormChanged', (form: any) => {
      setFeedbackFormUrl(form?.url || null)
    })

    plugin.on('feedback', 'openFeedbackForm', (url: string) => {
      if (url) {
        setFeedbackFormUrl(url)
        setFeedbackPanelOpen(true)
      }
    })
    return () => {
      plugin.off('feedback', 'feedbackFormChanged')
      plugin.off('feedback', 'openFeedbackForm')
    }
  }, [])

  const handleLoginSuccess = (user: GitHubUser, token: string) => {
    setUser(user);
    setError(null);
  };

  async function openTemplateExplorer(): Promise<void> {
    await global.plugin.call('templateexplorermodal', 'updateTemplateExplorerInFileMode', false)
    appContext.appStateDispatch({
      type: appActionTypes.showGenericModal,
      payload: true
    })
  }

  const toggleDropdown = (isOpen: boolean) => {
    setShowDropdown(isOpen)
    if (isOpen) {
      updateMenuItems()
    }
  }

  useEffect(() => {
    const current = localStorage.getItem('currentWorkspace')
    setCurrentWorkspace(current as any)
  }, [plugin.filePanel.workspaces])

  // Keep the top-right AI icon in sync with whether the AI assistant panel is open
  const refreshAiPanelState = useCallback(async () => {
    try {
      const pState = await plugin.call('menuicons', 'getPluginState', 'remixaiassistant')
      if (!pState) return setAiPanelActive(false)
      if (pState.pinned) {
        const hidden = await plugin.call('rightSidePanel', 'isPanelHidden')
        const focus = await plugin.call('rightSidePanel', 'currentFocus')
        setAiPanelActive(!hidden && focus === 'remixaiassistant')
      } else {
        setAiPanelActive(!!pState.active)
      }
    } catch (e) {
      setAiPanelActive(false)
    }
  }, [plugin])

  useEffect(() => {
    // Note: rightSidePanelShown/Hidden are already subscribed elsewhere (see rightPanelHidden),
    // and the engine keeps only one callback per (listener, event) pair, so we react to
    // rightPanelHidden below instead of re-subscribing to those events here.
    plugin.on('rightSidePanel', 'pinnedPlugin', refreshAiPanelState)
    plugin.on('rightSidePanel', 'unPinnedPlugin', refreshAiPanelState)
    plugin.on('menuicons', 'showContent', refreshAiPanelState)
    plugin.on('menuicons', 'toggleContent', refreshAiPanelState)
    return () => {
      plugin.off('rightSidePanel', 'pinnedPlugin')
      plugin.off('rightSidePanel', 'unPinnedPlugin')
      plugin.off('menuicons', 'showContent')
      plugin.off('menuicons', 'toggleContent')
    }
  }, [refreshAiPanelState])

  // rightPanelHidden is driven by the rightSidePanelShown/Hidden events subscribed above;
  // re-derive the AI icon state whenever it (or the current workspace) changes.
  useEffect(() => {
    refreshAiPanelState()
  }, [rightPanelHidden, refreshAiPanelState])

  useEffect(() => {
    const run = async () => {
      const [url, currentReleaseVersion] = await plugin.getLatestReleaseNotesUrl()
      setLatestReleaseNotesUrl(url as any)
      setCurrentReleaseVersion(currentReleaseVersion as any)
    }
    run()
  }, [])

  useEffect(() => {
    // Listen to left side panel events
    plugin.on('sidePanel', 'leftSidePanelHidden', () => {
      setLeftPanelHidden(true)
      trackMatomoEvent({ category: 'topbar', action: 'leftSidePanel', name: 'panelHidden', isClick: false })
    })
    plugin.on('sidePanel', 'leftSidePanelShown', () => {
      setLeftPanelHidden(false)
      trackMatomoEvent({ category: 'topbar', action: 'leftSidePanel', name: 'panelShown', isClick: false })
    })

    // Listen to terminal panel events
    plugin.on('terminal', 'terminalPanelHidden', () => {
      setBottomPanelHidden(true)
      trackMatomoEvent({ category: 'topbar', action: 'terminalPanel', name: 'panelHidden', isClick: false })
    })
    plugin.on('terminal', 'terminalPanelShown', () => {
      setBottomPanelHidden(false)
      trackMatomoEvent({ category: 'topbar', action: 'terminalPanel', name: 'panelShown', isClick: false })
    })

    // Listen to right side panel events
    plugin.on('rightSidePanel', 'rightSidePanelHidden', () => {
      setRightPanelHidden(true)
      trackMatomoEvent({ category: 'topbar', action: 'rightSidePanel', name: 'panelHidden', isClick: false })
    })
    plugin.on('rightSidePanel', 'rightSidePanelShown', () => {
      setRightPanelHidden(false)
      trackMatomoEvent({ category: 'topbar', action: 'rightSidePanel', name: 'panelShown', isClick: false })
    })

    // Initialize panel states from localStorage
    const initializePanelStates = async () => {
      try {
        const panelStatesStr = window.localStorage.getItem('panelStates')
        if (panelStatesStr) {
          const panelStates = JSON.parse(panelStatesStr)
          if (panelStates.leftSidePanel) {
            setLeftPanelHidden(panelStates.leftSidePanel.isHidden || false)
          }
          if (panelStates.bottomPanel) {
            setBottomPanelHidden(panelStates.bottomPanel.isHidden || false)
          }
          if (panelStates.rightSidePanel) {
            setRightPanelHidden(panelStates.rightSidePanel.isHidden || false)
          }
        }
      } catch (e) {
        console.error('Error reading panel states:', e)
      }
    }
    initializePanelStates()

    return () => {
      plugin.off('sidePanel', 'leftSidePanelHidden')
      plugin.off('sidePanel', 'leftSidePanelShown')
      plugin.off('terminal', 'terminalPanelHidden')
      plugin.off('terminal', 'terminalPanelShown')
      plugin.off('rightSidePanel', 'rightSidePanelHidden')
      plugin.off('rightSidePanel', 'rightSidePanelShown')
    }
  }, [])

  useEffect(() => {
    if (global.fs.mode === 'browser') {
      if (global.fs.browser.currentWorkspace) {
        setCurrentWorkspace(global.fs.browser.currentWorkspace)
        fetchWorkspaceDirectory(ROOT_PATH)
      } else {
        setCurrentWorkspace(NO_WORKSPACE)
      }
    } else if (global.fs.mode === 'localhost') {
      fetchWorkspaceDirectory(ROOT_PATH)
      setCurrentWorkspace(LOCALHOST)
    }
  }, [global.fs.browser.currentWorkspace, global.fs.browser.workspaceSwitchVersion, global.fs.localhost.sharedFolder, global.fs.mode, showDropdown])

  useEffect(() => {
    if (global.fs.browser.currentWorkspace && !global.fs.browser.workspaces.find(({ name }: any) => name === global.fs.browser.currentWorkspace)) {
      if (global.fs.browser.workspaces.length > 0) {
        switchWorkspace(global.fs.browser.workspaces[global.fs.browser.workspaces.length - 1].name)
      } else {
        switchWorkspace(NO_WORKSPACE)
      }
    }
    updateMenuItems()
  }, [global.fs.browser.workspaces, global.fs.browser.workspaces.length])

  useEffect(() => {
    const handleWorkspaceChanged = () => updateMenuItems()
    plugin.on('filePanel', 'workspaceDeleted', handleWorkspaceChanged)
    plugin.on('filePanel', 'workspaceCreated', handleWorkspaceChanged)
    return () => {
      plugin.off('filePanel', 'workspaceDeleted')
      plugin.off('filePanel', 'workspaceCreated')
    }
  }, [])

  useEffect(() => {
    plugin.on('theme', 'themeChanged', (theme: any) => {
      setCurrentTheme(theme)
    })
    return () => {
      plugin.off('theme', 'themeChanged')
    }
  }, [])

  useEffect(() => {
    async function loadCurrentTheme() {
      try {
        const ct = await plugin.call('theme', 'currentTheme')
        setCurrentTheme(ct)
      } catch (error) {
        console.error("Error fetching current theme:", error)
      }
    }
    loadCurrentTheme()
  }, []);

  const subItems = useMemo(() => {
    return [
      { label: 'Rename', onClick: renameCurrentWorkspace, icon: 'far fa-edit' },
      { label: 'Duplicate', onClick: downloadCurrentWorkspace, icon: 'fas fa-copy' },
      { label: 'Download', onClick: downloadCurrentWorkspace, icon: 'fas fa-download' },
      { label: 'Delete', onClick: deleteCurrentWorkspace, icon: 'fas fa-trash' }
    ]
  }, [])

  const updateMenuItems = async (workspaces?: WorkspaceMetadata[]) => {
    const menuItems = (workspaces || await plugin.getWorkspaces()).map((workspace) => ({
      name: workspace.name,
      isGitRepo: workspace.isGitRepo,
      isGist: (workspace as any).isGist,
      branches: workspace.branches,
      currentBranch: workspace.currentBranch,
      hasGitSubmodules: workspace.hasGitSubmodules,
      remoteId: workspace.remoteId,
      submenu: subItems
    }))
    setMenuItems(menuItems)
  }

  const onFinishRenameWorkspace = async (currMenuName?: string) => {
    if (workspaceRenameInput.current === undefined) return
    // @ts-ignore: Object is possibly 'null'.
    const workspaceName = workspaceRenameInput.current.value
    try {
      await renameWorkspace(currMenuName!, workspaceName)
    } catch (e: any) {
      global.modal(
        intl.formatMessage({ id: 'filePanel.workspace.rename' }),
        e.message,
        intl.formatMessage({ id: 'filePanel.ok' }),
        () => { },
        intl.formatMessage({ id: 'filePanel.cancel' })
      )
      console.error(e)
    }
  }

  const onFinishDownloadWorkspace = async () => {
    try {
      await handleDownloadWorkspace()
    } catch (e: any) {
      global.modal(
        intl.formatMessage({ id: 'filePanel.workspace.download' }),
        e.message,
        intl.formatMessage({ id: 'filePanel.ok' }),
        () => { },
        intl.formatMessage({ id: 'filePanel.cancel' })
      )
      console.error(e)
    }
  }
  const onFinishDeleteWorkspace = async (workspaceName?: string) => {
    try {
      await deleteWorkspace(workspaceName!)
      await updateMenuItems()
    } catch (e: any) {
      global.modal(
        intl.formatMessage({ id: 'filePanel.workspace.delete' }),
        e.message,
        intl.formatMessage({ id: 'filePanel.ok' }),
        () => { },
        intl.formatMessage({ id: 'filePanel.cancel' })
      )
      console.error(e)
    }
  }

  const deleteCurrentWorkspace = (workspaceName?: string) => {
    global.modal(
      intl.formatMessage({ id: 'filePanel.workspace.delete' }),
      intl.formatMessage({ id: 'filePanel.workspace.deleteConfirm' }, { currentWorkspace: workspaceName }),
      intl.formatMessage({ id: 'filePanel.ok' }),
      () => onFinishDeleteWorkspace(workspaceName),
      intl.formatMessage({ id: 'filePanel.cancel' })
    )
  }

  const restoreBackup = async () => {
    try {
      await restoreBackupZip()
    } catch (e) {
      console.error(e)
    }
  }

  const downloadWorkspaces = async () => {
    try {
      await handleDownloadFiles()
    } catch (e) {
      console.error(e)
    }
  }

  const openDomainMigration = async () => {
    try {
      await plugin.call('manager', 'activatePlugin', 'domainMigration')
      await plugin.call('domainMigration', 'showMigration')
    } catch (e) {
      console.error(e)
    }
  }

  const onFinishDeleteAllWorkspaces = async () => {
    try {
      await deleteAllWorkspacesAction()
    } catch (e: any) {
      global.modal(
        intl.formatMessage({ id: 'filePanel.workspace.deleteAll' }),
        e.message,
        intl.formatMessage({ id: 'filePanel.ok' }),
        () => { },
        intl.formatMessage({ id: 'filePanel.cancel' })
      )
      console.error(e)
    }
  }

  const deleteAllWorkspaces = () => {
    global.modal(
      intl.formatMessage({ id: 'filePanel.workspace.deleteAll' }),
      <>
        <div className="d-flex flex-column">
          <span className="pb-1">{intl.formatMessage({ id: 'filePanel.workspace.deleteAllConfirm1' })}</span>
          <span>{intl.formatMessage({ id: 'filePanel.workspace.deleteAllConfirm2' })}</span>
        </div>
      </>,
      intl.formatMessage({ id: 'filePanel.ok' }),
      onFinishDeleteAllWorkspaces,
      intl.formatMessage({ id: 'filePanel.cancel' })
    )
  }

  const renameModalMessage = (workspaceName?: string) => {
    return (
      <div className='d-flex flex-column'>
        <label><FormattedMessage id="filePanel.name" /></label>
        <input type="text" data-id="modalDialogCustomPromptTextRename" defaultValue={workspaceName || currentMenuItemName} ref={workspaceRenameInput} className="form-control" />
      </div>
    )
  }

  const downloadCurrentWorkspace = () => {
    global.modal(
      intl.formatMessage({ id: 'filePanel.workspace.download' }),
      intl.formatMessage({ id: 'filePanel.workspace.downloadConfirm' }),
      intl.formatMessage({ id: 'filePanel.ok' }),
      onFinishDownloadWorkspace,
      intl.formatMessage({ id: 'filePanel.cancel' })
    )
  }

  const createWorkspace = async () => {
    openTemplateExplorer()
  }

  const renameCurrentWorkspace = (workspaceName?: string) => {
    global.modal(
      intl.formatMessage({ id: 'filePanel.workspace.rename' }),
      renameModalMessage(workspaceName),
      intl.formatMessage({ id: 'filePanel.save' }),
      () => onFinishRenameWorkspace(workspaceName),
      intl.formatMessage({ id: 'filePanel.cancel' })
    )
  }

  const checkIfLightTheme = (themeName: string) => themeName.includes('dark') ? false : true

  const IsGitRepoDropDownMenuItem = (props: { isGitRepo: boolean, mName: string }) => {
    return (
      <>
        {props.isGitRepo ? (
          <div
            className="d-flex flex-row-reverse justify-content-end"
          >
            <span
            >
              {currentWorkspace === props.mName ? <span>&#10003; {props.mName} </span> : <span className="ps-1">{props.mName}</span>}</span>
            <i className="fas fa-code-branch pt-1"></i>
          </div>
        ) : (
          <div
            className="d-flex justify-content-between"
          >
            <span>{currentWorkspace === props.mName ? <span>&#10003; {props.mName} </span> : <span className="ps-3">{props.mName}</span>}</span>
          </div>
        )}
      </>
    )
  }

  const switchWorkspace = async (name: string) => {
    try {
      await switchToWorkspace(name)
      handleExpandPath([])
      trackMatomoEvent<WorkspaceEvent>({ category: 'workspace', action: 'switchWorkspace', name: name, isClick: true })
    } catch (e: any) {
      global.modal(
        intl.formatMessage({ id: 'filePanel.workspace.switch' }),
        e.message,
        intl.formatMessage({ id: 'filePanel.ok' }),
        () => { },
        intl.formatMessage({ id: 'filePanel.cancel' })
      )
      console.error(e)
    }
  }

  const ShowAllMenuItems = () => {

    return (
      <>
        {global.fs.browser.workspaces.map(({ name, isGitRepo }: any, index: number) => (
          <div
            key={index}
            className="d-flex justify-content-between w-100"
          >
            <Dropdown.Item
              key={index}
              onClick={() => { switchWorkspace(name) }}
              data-id={`dropdown-item-${name}`}
              className="text-truncate"
              style={{ width: '90%' }}
            >
              <IsGitRepoDropDownMenuItem isGitRepo={isGitRepo} mName={name} />
            </Dropdown.Item>
            <i
              ref={subMenuIconRef}
              className="fas fa-ellipsis-vertical pt-1 pe-2 top-bar-dropdownItem"
              onClick={() => {
                setShowSubMenuFlyOut(!showSubMenuFlyOut)
              }}
            ></i>
          </div>
        ))}
      </>
    )
  }

  const ShowNonLocalHostMenuItems = () => {
    const cachedFilter = global.fs.browser.workspaces.filter((x: any) => !x.name.includes('localhost'))
    return (
      <div className="">
        {
          currentWorkspace === LOCALHOST && cachedFilter.length > 0 ? cachedFilter.map(({ name, isGitRepo }: any, index: number) => (
            <Dropdown.Item
              key={index}
              onClick={() => {
                switchWorkspace(name)
              }}
              data-id={`dropdown-item-${name}`}
            >
              <IsGitRepoDropDownMenuItem isGitRepo={isGitRepo} mName={name} />
            </Dropdown.Item>
          )) : <ShowAllMenuItems />
        }
      </div>
    )
  }

  const panelControls = [
    {
      id: 'toggleLeftSidePanelIcon',
      tooltip: 'Toggle Left Side Panel',
      label: 'Left Side Panel',
      iconClass: `codicon codicon-layout-sidebar-left${leftPanelHidden ? '-off' : ''}`,
      isActive: !leftPanelHidden,
      onClick: () => {
        if (leftPanelHidden) trackMatomoEvent({ category: 'topbar', action: 'leftSidePanel', name: 'showLeftSidePanelClicked', isClick: true })
        else trackMatomoEvent({ category: 'topbar', action: 'leftSidePanel', name: 'hideLeftSidePanelClicked', isClick: true })
        plugin.call('sidePanel', 'togglePanel')
      }
    },
    {
      id: 'toggleBottomPanelIcon',
      tooltip: 'Toggle Bottom Panel',
      label: 'Bottom Panel',
      iconClass: `codicon codicon-layout-panel${bottomPanelHidden ? '-off' : ''}`,
      isActive: !bottomPanelHidden,
      onClick: () => {
        if (bottomPanelHidden) trackMatomoEvent({ category: 'topbar', action: 'terminalPanel', name: 'showTerminalPanelClicked', isClick: true })
        else trackMatomoEvent({ category: 'topbar', action: 'terminalPanel', name: 'hideTerminalPanelClicked', isClick: true })
        plugin.call('terminal', 'togglePanel')
      }
    },
    {
      id: 'toggleRightSidePanelIcon',
      tooltip: 'Toggle Right Side Panel',
      label: 'Right Side Panel',
      iconClass: `codicon codicon-layout-sidebar-right${rightPanelHidden ? '-off' : ''}`,
      isActive: !rightPanelHidden,
      onClick: async () => {
        if (rightPanelHidden) trackMatomoEvent({ category: 'topbar', action: 'rightSidePanel', name: 'showRightSidePanelClicked', isClick: true })
        else trackMatomoEvent({ category: 'topbar', action: 'rightSidePanel', name: 'hideRightSidePanelClicked', isClick: true })

        const currentPlugin = await plugin.call('rightSidePanel', 'currentFocus')
        if (!currentPlugin) {
          plugin.call('notification', 'toast', 'No plugin pinned on the Right Side Panel.')
          return
        }
        plugin.call('rightSidePanel', 'togglePanel')
      }
    }
  ]

  return (
    <section
      ref={sectionRef}
      className="h-100 d-flex bg-light border flex-nowrap px-2"
    >
      <div className="d-flex flex-row align-items-center justify-content-between w-100" style={{ minWidth: 0 }}>
        <div
          className="d-flex flex-row align-items-center m-1"
          style={{ minWidth: 0 }}
        >
          <div
            className="d-flex align-items-center justify-content-between me-3 cursor-pointer"
            onClick={async () => {
              await plugin.call('tabs', 'focus', 'home')
              trackMatomoEvent({ category: 'topbar', action: 'header', name: 'Home', isClick: true })
            }}
            data-id="verticalIconsHomeIcon"
          >
            <div
              style={{ width: '35px', height: '35px' }}
              data-id="verticalIconsHomeIcon"
              className="remixui_homeIcon"
              onClick={async () => {
                await plugin.call('tabs', 'focus', 'home')
                trackMatomoEvent({ category: 'topbar', action: 'header', name: 'Home', isClick: true })
              }}
            >
              <BasicLogo />
            </div>
            <div
              className="text-primary ms-2 font-weight-light text-uppercase cursor-pointer"
              style={{ fontSize: '1.2rem' }}
              onClick={async () => {
                await plugin.call('tabs', 'focus', 'home')
                trackMatomoEvent({ category: 'topbar', action: 'header', name: 'Home', isClick: true })
              }}
            >
              Remix
            </div>
          </div>
          <span
            className="btn btn-sm border border-secondary text-decoration-none font-weight-light"
            onClick={() => {
              window.open(latestReleaseNotesUrl, '_blank')
            }}
            style={{
              whiteSpace: 'nowrap',
              flexShrink: 0,
              color: currentTheme && !checkIfLightTheme(currentTheme.name) ? 'var(--white)' : 'var(--text)'
            }}
          >
            {currentReleaseVersion}
          </span>
          {showCloudLoginModal && <LoginModal onClose={() => setShowCloudLoginModal(false)} plugin={plugin} />}
        </div>
        <div className="m-1 d-flex align-self-center">
          {showCloudToggle && (
            <CloudToggle
              className="ms-2"
              onEnableCloud={() => enableCloud().catch(() => {/* User cancelled */})}
              onDisableCloud={() => disableCloud().catch(() => {/* User cancelled */})}
              theme={currentTheme?.quality}
            />)}
          <div
            className="d-flex align-items-center flex-nowrap ms-2"
            style={{ minWidth: 0, flex: '1 1 auto' }}
          >
            <WorkspacesDropdown
              menuItems={menuItems}
              toggleDropdown={toggleDropdown}
              showDropdown={showDropdown}
              currentWorkspace={currentWorkspace}
              NO_WORKSPACE={NO_WORKSPACE}
              switchWorkspace={switchWorkspace}
              ShowNonLocalHostMenuItems={ShowNonLocalHostMenuItems}
              CustomToggle={CustomToggle}
              showSubMenuFlyOut={showSubMenuFlyOut}
              setShowSubMenuFlyOut={setShowSubMenuFlyOut}
              createWorkspace={createWorkspace}
              renameCurrentWorkspace={renameCurrentWorkspace}
              downloadCurrentWorkspace={downloadCurrentWorkspace}
              deleteCurrentWorkspace={deleteCurrentWorkspace}
              downloadWorkspaces={downloadWorkspaces}
              openDomainMigration={openDomainMigration}
              migrationTarget={migrationTarget}
              restoreBackup={restoreBackup}
              deleteAllWorkspaces={deleteAllWorkspaces}
              setCurrentMenuItemName={setCurrentMenuItemName}
              setMenuItems={setMenuItems}
              connectToLocalhost={() => switchWorkspace(LOCALHOST)}
              openTemplateExplorer={openTemplateExplorer}
              onMigrateToCloud={() => cloudStore.emit('showMigrationDialog')}
              cloneGitRepository={showCloneModal}
            />
            <div
              ref={panelControlRef}
              data-id="panel-control"
              className="d-flex gap-1 align-items-center"
              style={{ marginLeft: isNonMaximizedWindow ? '0.75rem' : '1.5rem', flexShrink: 0 }}
            >
              {compactPanelControl && !isE2E ? (
                <Dropdown onToggle={setPanelControlMenuOpen}>
                  <Dropdown.Toggle
                    as={CustomToggle}
                    id="panel-control-compact"
                    data-id="panel-control-compact-toggle"
                    icon=""
                    useDefaultIcon={false}
                    className="btn btn-link p-0 border-0 shadow-none"
                  >
                    <CustomTooltip placement="bottom-start" tooltipText="Control layout" hide={panelControlMenuOpen}>
                      <i className="codicon codicon-layout fs-6" />
                    </CustomTooltip>
                  </Dropdown.Toggle>
                  <Dropdown.Menu>
                    {panelControls.map(ctrl => (
                      <Dropdown.Item key={ctrl.id} onClick={ctrl.onClick} data-id={`${ctrl.id}-menuItem`}>
                        <i className={`${ctrl.iconClass} me-2`} />
                        {ctrl.label}
                      </Dropdown.Item>
                    ))}
                  </Dropdown.Menu>
                </Dropdown>
              ) : (
                panelControls.map(ctrl => (
                  <CustomTooltip key={ctrl.id} placement="bottom-start" tooltipText={ctrl.tooltip}>
                    <div
                      className={`panel-control-btn${ctrl.isActive ? ' active' : ''}`}
                      data-id={ctrl.id}
                      onClick={ctrl.onClick}
                    >
                      <i className={`${ctrl.iconClass} fs-6`} />
                    </div>
                  </CustomTooltip>
                ))
              )}
            </div>
          </div>
        </div>
        <div
          ref={rightSideRef}
          className="d-flex flex-row align-items-center justify-content-end flex-nowrap"
          style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}
        >
          <div className="d-flex flex-row align-items-center gap-2 flex-nowrap" style={{ whiteSpace: 'nowrap' }}>
            {showLoginUI && (
              <LoginButton
                plugin={plugin}
                variant="compact"
                showCredits={true}
                signInDataId="login-button"
                className="text-nowrap"
                cloneGitRepository={showCloneModal}
                publishToGist={publishToGist}
              />
            )}
            {isAuthenticated && (
              <>
                <CustomTooltip placement="bottom" tooltipText="Check out the features in Remix Pro : Security & Gas Audits, the Code Helper, Web3 API connectors (the Graph, Etherscan, Alchemy) and more!">
                  <span
                    className="btn btn-sm d-flex align-items-center gap-1 text-nowrap"
                    style={{ cursor: 'pointer', padding: '0.25rem 0.6rem' , border: "1px solid color-mix(in srgb, var(--custom-primary) 64%, transparent)", color: 'var(--custom-primary)', fontSize:"12px", fontWeight:'700', lineHeight:'normal' }}
                    onClick={() => {
                      try { plugin.call('planManager', 'open', 'plans') } catch { /* plugin not ready */ }
                      trackMatomoEvent({ category: 'topbar', action: 'upgrade', name: 'Upgrade', isClick: true })
                    }}
                    data-id="topbar-upgradeBtn"
                  >
                    {/* <i className="fas fa-layer-group"></i> */}
                    <span>Upgrade</span>
                  </span>
                </CustomTooltip>
                <CustomTooltip placement="bottom" tooltipText="Use RemixAI for editing contracts, code analysis, deployments and more!">
                  <span
                    className="btn btn-sm btn-ai d-flex align-items-center gap-1 text-nowrap"
                    style={{ cursor: 'pointer', padding: '0.25rem 0.6rem' }}
                    onClick={() => {
                      try { plugin.call('planManager', 'open', 'topup') } catch { /* plugin not ready */ }
                      trackMatomoEvent({ category: 'topbar', action: 'upgrade', name: 'GetAICredits', isClick: true })
                    }}
                    data-id="topbar-aiCreditsBtn"
                  >
                    <img src="assets/img/remixAI_small.svg" alt="Remix AI" className="topbar-ai-credits-icon" />
                    {!compactRightLabels ? <span>Get AI Credits</span> : <span>AI Credits</span>}
                  </span>
                </CustomTooltip>
              </>
            )}
          </div>
          {showJoinBetaTopButton && <BetaPromoPill plugin={plugin} />}
          <CartButton />
          {showNotificationBell && <NotificationBell className="ms-3" />}
          {supportEnabled && isAuthenticated && token && (
            <CustomTooltip placement="bottom" tooltipText="Premium Support">
              <span
                className="btn btn-sm d-flex align-items-center gap-1 ms-3"
                style={{ cursor: 'pointer', padding: '0.25rem 0.6rem', color: 'var(--text)' }}
                onClick={() => {
                  window.open(`https://support.remix.live/login?token=${encodeURIComponent(token)}`, '_blank')
                  trackMatomoEvent({ category: 'topbar', action: 'support', name: 'SupportOpened', isClick: true })
                }}
                data-id="topbar-supportBtn"
              >
                <i className="fas fa-headset"></i>
                {!compactRightLabels && <span>Support</span>}
              </span>
            </CustomTooltip>
          )}
          {feedbackFormUrl && (
            <CustomTooltip placement="bottom" tooltipText="Send Feedback">
              <span
                className="btn btn-sm btn-primary d-flex align-items-center gap-1 ms-3"
                style={{ cursor: 'pointer', padding: '0.25rem 0.6rem' }}
                onClick={() => {
                  setFeedbackPanelOpen(true)
                  trackMatomoEvent({ category: 'topbar', action: 'feedback', name: 'FeedbackOpened', isClick: true })
                }}
                data-id="topbar-feedbackIcon"
              >
                <i className="fas fa-bug"></i>
                {!compactRightLabels && <span>Feedback</span>}
              </span>
            </CustomTooltip>
          )}
          <span
            style={{ fontSize: '1rem', cursor: 'pointer' }}
            className="ms-3"
            onClick={async () => {
              const isActive = await plugin.call('manager', 'isActive', 'settings')
              if (!isActive) await plugin.call('manager', 'activatePlugin', 'settings')
              await plugin.call('tabs', 'focus', 'settings')
              trackMatomoEvent({ category: 'topbar', action: 'header', name: 'Settings', isClick: true })
            }}
            data-id="topbar-settingsIcon"
          >
            <i className="fa fa-cog"></i>
          </span>
          <span
            className={`ms-3 remixai-topbar-icon${aiPanelActive ? ' active' : ''}`}
            onClick={async () => {
              const pState = await plugin.call('menuicons', 'getPluginState', 'remixaiassistant')
              if (pState && pState.pinned) {
                // When the AI panel is already open, clicking the icon closes it; otherwise open it.
                if (aiPanelActive) {
                  await plugin.call('rightSidePanel', 'togglePanel')
                } else {
                  await plugin.call('rightSidePanel', 'highlight')
                }
              } else {
                await plugin.call('menuicons', 'toggle', 'remixaiassistant')
              }
              refreshAiPanelState()
            }}
            data-id="remixai-assistant-icon"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="remixaiassistant">
              <path d="M22.4712 0.753375C22.9245 0.711794 23.2873 1.07432 23.2465 1.52779C23.0693 3.49809 22.2893 8.56115 18.8764 12.0004C22.289 15.4397 23.0693 20.5018 23.2465 22.4721C23.2873 22.9256 22.9246 23.2881 22.4712 23.2465C20.5114 23.0668 15.3236 22.2784 11.9145 18.8432C8.50536 22.2788 3.48849 23.0668 1.52877 23.2465C1.07537 23.2881 0.712585 22.9256 0.753378 22.4721C0.930616 20.5018 1.71093 15.4397 5.1235 12.0004C1.71061 8.56115 0.930607 3.49809 0.753378 1.52779C0.71266 1.07434 1.07542 0.711826 1.52877 0.753375C3.48849 0.93311 8.67724 1.72116 12.0864 5.1567C15.4955 1.72158 20.5115 0.933113 22.4712 0.753375ZM9.53365 8.25045L7.00045 15.7504H8.66353L9.20846 14.0395H11.8579L12.4018 15.7504H14.0649L11.5337 8.25045H9.53365ZM14.9477 8.25045V15.7504H16.5004V8.25045H14.9477ZM10.5629 9.96431L11.4653 12.8022H9.60201L10.5053 9.96431H10.5629Z" fill="var(--custom-ai-color)" />
            </svg>
          </span>
        </div>
      </div>
      {feedbackFormUrl && (
        <FeedbackPanel
          isOpen={feedbackPanelOpen}
          onClose={() => {
            setFeedbackPanelOpen(false)
            trackMatomoEvent({ category: 'topbar', action: 'feedback', name: 'FeedbackClosed', isClick: true })
          }}
          formUrl={feedbackFormUrl}
        />
      )}
    </section>
  )
}
