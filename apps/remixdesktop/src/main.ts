import { app, BrowserWindow, dialog, Menu, MenuItem, shell, utilityProcess, screen, ipcMain, protocol } from 'electron';
import path from 'path';
import "./utils/log"
import os from 'os';
import fs from 'fs';
import { exec } from 'child_process';

export let isPackaged = false;
export const version = app.getVersion();

const args = process.argv.slice(1)
console.log("args", args)
export const isE2ELocal = args.find(arg => arg.startsWith('--e2e-local'))
export const isE2E = args.find(arg => arg.startsWith('--e2e'))

if (isE2ELocal) {
  console.log('e2e mode')
}
const cache_dir_arg = args.find(arg => arg.startsWith('--cache_dir='))
export let cache_dir = ''
if (cache_dir_arg) {
  cache_dir = cache_dir_arg.split('=')[1]
}

if (
  process.mainModule &&
  process.mainModule.filename.indexOf('app.asar') !== -1
) {
  isPackaged = true;
} else if (process.argv.filter(a => a.indexOf('app.asar') !== -1).length > 0) {
  isPackaged = true;
}

// get system home dir
const homeDir = app.getPath('userData')

const windowSet = new Set<BrowserWindow>([]);
export const createWindow = async (dir?: string): Promise<void> => {
  await app.whenReady();
  // reize factor
  let resizeFactor = 0.8
  // if the window is too small the size is 100%
  if (screen.getPrimaryDisplay().size.width < 2560 || screen.getPrimaryDisplay().size.height < 1440) {
    resizeFactor = 1
  }
  const windowWidth = Math.round(screen.getPrimaryDisplay().size.width * resizeFactor)
  const windowHeight = Math.round(screen.getPrimaryDisplay().size.height * resizeFactor)

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    // For normal use, start at ~80% of the primary display; E2E will maximize anyway
    width: windowWidth,
    height: windowHeight,
    minWidth: 1024,
    minHeight: 650,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Hint an initial zoom; Electron applies this at creation time
      zoomFactor: (isE2E ? 0.5 : 1.0),
    },
  });

  // Ensure zoom is applied after content loads (some pages reset it on load)
  if (isE2E) {
    const applyZoom = () => {
      try { mainWindow.webContents.setZoomFactor(0.5); } catch (_) {}
    };
    // Apply once the first load finishes
    mainWindow.webContents.once('did-finish-load', applyZoom);
    // Re-apply on any navigation within the window (SPA route changes, reloads)
    mainWindow.webContents.on('did-navigate-in-page', applyZoom);
    mainWindow.webContents.on('did-navigate', applyZoom);
  }

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url); // Open URL in user's browser.
    return { action: "deny" }; // Prevent the app from opening the URL.
  })
  if (dir && dir.endsWith('/')) dir = dir.slice(0, -1)
  const params = dir ? `?opendir=${encodeURIComponent(dir)}` : '';
  // and load the index.html of the app.
  mainWindow.loadURL(
    (process.env.NODE_ENV === 'production' || isPackaged) && !isE2ELocal ? `file://${__dirname}/remix-ide/index.html` + params :
      'http://localhost:8080' + params)

  trackEvent('Instance', 'create_window', '', 1);

  if (dir) {
    mainWindow.setTitle(dir)
  }

  // on close
  mainWindow.on('close', (event) => {
    windowSet.delete(mainWindow)
  })

  if (isE2E)
    mainWindow.maximize()

  windowSet.add(mainWindow)
  //mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
  trackEvent('App', 'Launch', app.getVersion(), 1, 1);
  trackEvent('App', 'OS', process.platform, 1);
  if (!isE2E) registerLinuxProtocolHandler();
  require('./engine')
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

if (!isE2E) {

  app.setAsDefaultProtocolClient('remix')
  // windows only
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    app.quit();
  } else {
    app.on('second-instance', (event, argv, workingDirectory) => {
      // On Windows, protocol URLs are passed here
      console.log('Second instance detected:', argv, workingDirectory);
      const urlArg = argv.find(arg => arg.startsWith('remix://'));
      if (urlArg) {
        handleRemixUrl(urlArg);
      }
    });

    app.whenReady().then(() => {
      // On app launch via protocol link (Windows only)
      console.log('App is ready, checking for remix:// URL');
      const urlArg = process.argv.find(arg => arg.startsWith('remix://'));
      if (urlArg) {
        handleRemixUrl(urlArg);
      }
    });
  }

}

function handleRemixUrl(url: string) {
  try {
    console.log('Got custom URL:', url);
    const parsedUrl = new URL(url);
    const fullPath = `/${parsedUrl.host}${parsedUrl.pathname}`;
    const searchParams = parsedUrl.searchParams;

    // Bring the frontmost window to the foreground
    const allWindows = BrowserWindow.getAllWindows();
    const targetWindow = allWindows.find(win => win.isVisible()) || allWindows[0];

    if (targetWindow) {
      if (targetWindow.isMinimized()) targetWindow.restore();
      targetWindow.focus();
    }

    switch (fullPath) {
    case '/auth/callback': {
      const code = searchParams.get('code');
      if (code) {
        githubAuthHandlerPlugin?.exchangeCodeForToken(code);
        console.log('Auth exchange', code);
      }
      break;
    }

    default:
      console.warn('Unknown remix:// URL path:', fullPath);
      break;
    }
  } catch (err) {
    console.error('Failed to handle remix:// URL:', err);
  }
}

// linux only
function registerLinuxProtocolHandler() {
  console.log('Registering remix:// protocol handler');
  if (process.platform !== 'linux') return;

  const execPath = app.getPath('exe');
  const applicationsDir = path.join(os.homedir(), '.local', 'share', 'applications');
  const desktopFilePath = path.join(applicationsDir, 'remix.desktop');

  console.log('Executable path:', execPath);

  const desktopEntry = `[Desktop Entry]
Name=Remix IDE
Exec=${execPath} %u
Type=Application
Terminal=false
Categories=Development;
MimeType=x-scheme-handler/remix;
`;

  console.log('Registering remix:// protocol handler:', desktopFilePath);

  try {
    if (!fs.existsSync(applicationsDir)) {
      fs.mkdirSync(applicationsDir, { recursive: true });
    }

    fs.writeFileSync(desktopFilePath, desktopEntry);

    exec(`xdg-mime default remix.desktop x-scheme-handler/remix`, (err, stdout, stderr) => {
      if (err) {
        console.error('Failed to register remix:// protocol handler:', err);
      } else {
        console.log('remix:// protocol handler registered successfully.', desktopFilePath);
      }
    });
  } catch (e) {
    console.error('Error setting up remix:// protocol handler:', e);
  }
}
if (!isE2E) {
  // macos only
  app.on('open-url', async (event, url) => {
    console.log('open-url', url);
    event.preventDefault();
    handleRemixUrl(url);
  });
}

const showAbout = () => {
  void dialog.showMessageBox({
    title: `About Remix`,
    message: `The Native IDE for Web3 Development.`,
    detail: `Remix Desktop version ${app.getVersion()}`,
    buttons: [],
  });
};

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

const isMac = process.platform === 'darwin'

import FileMenu from './menus/file';
import darwinMenu from './menus/darwin';
import WindowMenu from './menus/window';
import EditMenu from './menus/edit';
import GitMenu from './menus/git';
import ViewMenu from './menus/view';
import TerminalMenu from './menus/terminal';
import HelpMenu from './menus/help';
import { execCommand } from './menus/commands';
import main from './menus/main';
import { trackEvent } from './utils/matamo';
import { githubAuthHandlerPlugin } from './engine';

const commandKeys: Record<string, string> = {
  'window:new': 'CmdOrCtrl+N',
  'folder:open': 'CmdOrCtrl+O',
};

const menu = [...(process.platform === 'darwin' ? [darwinMenu(commandKeys, execCommand, showAbout)] : []),
  FileMenu(commandKeys, execCommand),
  GitMenu(commandKeys, execCommand),
  EditMenu(commandKeys, execCommand),
  ViewMenu(commandKeys, execCommand),
  TerminalMenu(commandKeys, execCommand),
  WindowMenu(commandKeys, execCommand, []),
  HelpMenu(commandKeys, execCommand),
]
if (!isE2E || isE2ELocal)
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu))

ipcMain.handle('logger', async (...args) => {
  console.log('log:', ...args)
})

ipcMain.handle('config:isPackaged', async () => {
  return isPackaged
})

ipcMain.handle('config:isE2E', async () => {
  return isE2E
})

ipcMain.handle('matomo:trackEvent', async (event, data) => {
  if (data && data[0] && data[0] === 'trackEvent') {
    // data[5] is isClick (optional)
    trackEvent(data[1], data[2], data[3], data[4], 0, data[5]);
  }
})

ipcMain.on('focus-window', (windowId: any) => {
  console.log('focus-window', windowId)
  windowSet.forEach((win: BrowserWindow) => {
    console.log('win', win.webContents.id)
    if (win.webContents.id === windowId) {
      if (win.isMinimized()) {
        win.restore()
      }
      win.show()
      win.focus()
    }
  })
})