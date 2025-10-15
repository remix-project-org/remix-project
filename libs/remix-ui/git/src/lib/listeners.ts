
import React from "react";
import { setCanUseApp, setLoading, setRepoName, setGItHubToken, setLog, setGitHubUser, setUserEmails, setTimestamp, setDesktopWorkingDir, setVersion } from "../state/gitpayload";
import { gitActionDispatch, gitUIPanels, storage } from "../types";
import { Plugin } from "@remixproject/engine";
import { getBranches, getFileStatusMatrix, loadGitHubUserFromToken, getRemotes, gitlog, setPlugin, setStorage, init } from "./gitactions";
import { Profile } from "@remixproject/plugin-utils";
import { CustomRemixApi, trackMatomoEvent } from "@remix-api";
import { saveToken, statusChanged } from "./pluginActions";
import { appPlatformTypes } from "@remix-ui/app";
import { AppAction } from "@remix-ui/app";
import { setLoginPlugin, startGitHubLogin, disconnectFromGitHub } from "./gitLoginActions";

let plugin: Plugin<any, CustomRemixApi>, gitDispatch: React.Dispatch<gitActionDispatch>, loaderDispatch: React.Dispatch<any>, loadFileQueue: AsyncDebouncedQueue
let callBackEnabled: boolean = false

type AsyncCallback = () => Promise<void>;

class AsyncDebouncedQueue {
  private queues: Map<AsyncCallback, { timer: any, lastCall: number }>;

  constructor(private delay: number = 300) {
    this.queues = new Map();
  }

  enqueue(callback: AsyncCallback, customDelay?: number): void {
    if (this.queues.has(callback)) {
      clearTimeout(this.queues.get(callback)!.timer);
    }

    const timer = setTimeout(async () => {
      await callback();
      this.queues.delete(callback);
    }, customDelay || this.delay);

    this.queues.set(callback, { timer, lastCall: Date.now() });
  }
}

export const setCallBacks = (viewPlugin: Plugin, gitDispatcher: React.Dispatch<gitActionDispatch>, appDispatcher: React.Dispatch<AppAction>, loaderDispatcher: React.Dispatch<any>, setActivePanel: React.Dispatch<React.SetStateAction<string>>, platform: appPlatformTypes) => {
  plugin = viewPlugin
  gitDispatch = gitDispatcher
  loaderDispatch = loaderDispatcher
  loadFileQueue = new AsyncDebouncedQueue()

  setPlugin(viewPlugin, gitDispatcher, appDispatcher)
  // Initialize the login plugin reference
  setLoginPlugin(viewPlugin)

  plugin.on("fileManager", "fileSaved", async (file: string) => {
    loadFileQueue.enqueue(async () => {
      loadFiles()
    })
  });

  plugin.on("fileManager", "fileAdded", async (e) => {
    loadFileQueue.enqueue(async () => {
      loadFiles()
    })
  });

  plugin.on("fileManager", "fileRemoved", async (e) => {
    loadFileQueue.enqueue(async () => {
      loadFiles()
    })
  });

  plugin.on("fileManager", "fileRenamed", async (oldfile, newfile) => {
    loadFileQueue.enqueue(async () => {
      loadFiles()
    })
  });

  plugin.on('fs', 'workingDirChanged', async (path: string) => {

    gitDispatcher(setDesktopWorkingDir(path))
    gitDispatch(setCanUseApp(path ? true : false))
    const version = await plugin.call('dgitApi', 'version')

    gitDispatch(setVersion(version))
    loadFileQueue.enqueue(async () => {
      loadFiles()
    })
    loadFileQueue.enqueue(async () => {
      gitDispatch(setTimestamp(Date.now()))
    })
    loadFileQueue.enqueue(async () => {
      getBranches()
    })
    loadFileQueue.enqueue(async () => {
      getRemotes()
    })
  })

  plugin.on("filePanel", "setWorkspace", async (x: any) => {

    if (platform == appPlatformTypes.desktop) {
      const workingDir = await plugin.call('fs', 'getWorkingDir')
      gitDispatch(setCanUseApp(workingDir? true : false))
      const version = await plugin.call('dgitApi', 'version')

      gitDispatch(setVersion(version))
    } else {
      gitDispatch(setCanUseApp(x && !x.isLocalhost && x.name))
    }

    loadFileQueue.enqueue(async () => {
      loadFiles()
    })
    loadFileQueue.enqueue(async () => {
      gitDispatch(setTimestamp(Date.now()))
    })
    loadFileQueue.enqueue(async () => {
      getBranches()
    })
    loadFileQueue.enqueue(async () => {
      getRemotes()
    })
  });

  plugin.on('dgitApi', 'checkout', async () => {
    loadFileQueue.enqueue(async () => {
      gitDispatch(setTimestamp(Date.now()))
    })
    loadFileQueue.enqueue(async () => {
      getBranches()
    })
    gitDispatch(setLog({
      message: "Checkout",
      type: "success"
    }))
  })
  plugin.on('dgitApi', 'init', async () => {
    loadFileQueue.enqueue(async () => {
      loadFiles()
    }, 10)
  })
  plugin.on('dgitApi', 'add', async () => {
    loadFileQueue.enqueue(async () => {
      loadFiles()
    }, 10)
  })
  plugin.on('dgitApi', 'rm', async () => {
    loadFileQueue.enqueue(async () => {
      loadFiles()
    }, 10)
  })
  plugin.on('dgitApi', 'commit', async () => {

    loadFileQueue.enqueue(async () => {
      loadFiles()
    }, 10)
    loadFileQueue.enqueue(async () => {
      gitDispatch(setTimestamp(Date.now()))
    }, 10)
    loadFileQueue.enqueue(async () => {
      getBranches()
    }, 20)
    gitDispatch(setLog({
      message: 'Committed changes...',
      type: 'success'
    }))
  })
  plugin.on('dgitApi', 'branch', async () => {
    loadFileQueue.enqueue(async () => {
      gitDispatch(setTimestamp(Date.now()))
    })
    loadFileQueue.enqueue(async () => {
      getBranches()
    })
    gitDispatch(setLog({
      message: "Created Branch",
      type: "success"
    }))
  })
  plugin.on('dgitApi', 'clone', async () => {
    gitDispatch(setLog({
      message: "Cloned Repository",
      type: "success"
    }))
    loadFileQueue.enqueue(async () => {
      loadFiles()
    })
    loadFileQueue.enqueue(async () => {
      getBranches()
    })
    loadFileQueue.enqueue(async () => {
      gitDispatch(setTimestamp(Date.now()))
    })
  })
  plugin.on('manager', 'pluginActivated', async (p: Profile<any>) => {
    if (p.name === 'dgitApi') {
      loadGitHubUserFromToken();
      plugin.off('manager', 'pluginActivated');
    }
  })

  plugin.on('config', 'configChanged', async () => {
    await getGitConfig()
  })
  plugin.on('settings', 'configChanged', async () => {
    await getGitConfig()
  })

  plugin.on('dgit' as any, 'openPanel', async (panel: string) => {
    setActivePanel(panel)
  })

  plugin.on('dgit' as any, 'init', async () => {
    init()
  })

  plugin.on('dgit' as any, 'login', async () => {
    try {
      await startGitHubLogin()
    } catch (error) {
      console.error('Failed to start GitHub login from dgit plugin:', error)
      // Optionally show error to user
      gitDispatch(setLog({
        message: `GitHub login failed: ${error.message}`,
        type: "error"
      }))
    }
  })

  plugin.on('dgit' as any, 'disconnect', async () => {
    try {
      await disconnectFromGitHub()
    } catch (error) {
      console.error('Failed to disconnect from GitHub from dgit plugin:', error)
      // Optionally show error to user
      gitDispatch(setLog({
        message: `GitHub disconnect failed: ${error.message}`,
        type: "error"
      }))
    }
  })

  plugin.on('githubAuthHandler', 'onLogin', async (data: { token: string }) => {
    await saveToken(data.token)
    await loadGitHubUserFromToken()
    trackMatomoEvent(plugin, {
      category: 'git',
      action: 'CONNECT_TO_GITHUB_SUCCESS',
      name: 'ON_LOGIN_EVENT',
      isClick: false
    })
  })

  callBackEnabled = true;
}

export const getGitConfig = async () => {
  const username = await plugin.call('settings', 'get', 'settings/github-user-name')
  const email = await plugin.call('settings', 'get', 'settings/github-email')
  const token = await plugin.call('settings', 'get', 'settings/gist-access-token')
  const config = { username, email, token }

  loadGitHubUserFromToken()
  return

}

export const loadFiles = async (filepaths: string[] = null) => {
  try {
    await calculateLocalStorage()
    const branch = await plugin.call('dgitApi', "currentbranch")
    if (branch) {
      await getFileStatusMatrix(filepaths);
    } else {
      await plugin.call('fileDecorator', 'clearFileDecorators')
      statusChanged(0)
    }
  } catch (e) {
    console.error(e);
  }
}

export const disableCallBacks = async () => {
  callBackEnabled = false;
}
export const enableCallBacks = async () => {
  callBackEnabled = true;
}

const calculateLocalStorage = async () => {
  function bytesToMB(bytes) {
    return parseFloat((bytes / (1024 * 1024)).toFixed(2));
  }

  function calculatePercentage(used, quota) {
    return parseFloat(((used / quota) * 100).toFixed(2));
  }

  let storage: storage = {
    used: 0,
    total: 0,
    available: 0,
    percentUsed: 0,
    enabled: false
  }

  if ('storage' in navigator && 'estimate' in navigator.storage) {
    navigator.storage.estimate().then(estimate => {
      const usedMB = bytesToMB(estimate.usage);
      const quotaMB = bytesToMB(estimate.quota);
      const availableMB = bytesToMB(estimate.quota - estimate.usage);
      const percentageUsed = calculatePercentage(estimate.usage, estimate.quota);
      storage = {
        used: usedMB,
        total: quotaMB,
        available: availableMB,
        percentUsed: percentageUsed,
        enabled: true
      }
      setStorage(storage);

    });
  } else {
    console.log('Storage API not supported in this browser.');
    setStorage(storage);
  }

}

