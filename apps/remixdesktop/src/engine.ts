import { Engine, PluginManager } from '@remixproject/engine';
import { ipcMain } from 'electron';
import { FSPlugin } from './plugins/fsPlugin';
import { app } from 'electron';
import { XtermPlugin } from './plugins/xtermPlugin';
import git from 'isomorphic-git'
import { IsoGitPlugin } from './plugins/isoGitPlugin';
import { ConfigPlugin } from './plugins/configPlugin';
import { TemplatesPlugin } from './plugins/templates';
import { RipgrepPlugin } from './plugins/ripgrepPlugin';
import { CompilerLoaderPlugin } from './plugins/compilerLoader';
import { SlitherPlugin } from './plugins/slitherPlugin';
import { AppUpdaterPlugin } from './plugins/appUpdater';
import { FoundryPlugin } from './plugins/foundryPlugin';
import { HardhatPlugin } from './plugins/hardhatPlugin';
import { CircomElectronPlugin } from './plugins/circomElectronBasePlugin';
import { isE2E } from './main';
import { DesktopHostPlugin } from './plugins/desktopHost';
import { GitHubAuthHandler } from './plugins/githubAuthHandler';

const engine = new Engine()
const appManager = new PluginManager()
const fsPlugin = new FSPlugin()
const xtermPlugin = new XtermPlugin()
const isoGitPlugin = new IsoGitPlugin()
const configPlugin = new ConfigPlugin()
const templatesPlugin = new TemplatesPlugin()
const ripgrepPlugin = new RipgrepPlugin()
const compilerLoaderPlugin = new CompilerLoaderPlugin()
const slitherPlugin = new SlitherPlugin()
const appUpdaterPlugin = new AppUpdaterPlugin()
const foundryPlugin = new FoundryPlugin()
const hardhatPlugin = new HardhatPlugin()
const circomPlugin = new CircomElectronPlugin()
const desktopHostPlugin = new DesktopHostPlugin()
export const githubAuthHandlerPlugin  = new GitHubAuthHandler()

engine.register(appManager)
engine.register(fsPlugin)
engine.register(xtermPlugin)
engine.register(isoGitPlugin)
engine.register(configPlugin)
engine.register(templatesPlugin)
engine.register(ripgrepPlugin)
engine.register(compilerLoaderPlugin)
engine.register(slitherPlugin)
engine.register(foundryPlugin)
engine.register(appUpdaterPlugin)
engine.register(hardhatPlugin)
engine.register(circomPlugin)
engine.register(desktopHostPlugin)
engine.register(githubAuthHandlerPlugin)

appManager.activatePlugin('electronconfig')
appManager.activatePlugin('fs')

ipcMain.handle('manager:activatePlugin', async (event, plugin) => {
  return await appManager.call(plugin, 'createClient', event.sender.id)
})

ipcMain.on('fs:openFolder', async (event, path?) => {
  fsPlugin.openFolder(event, path)
})

ipcMain.handle('fs:openFolder', async (event, webContentsId, path?) => {
  if(!isE2E) return
  console.log('openFolder', webContentsId, path)
  fsPlugin.openFolder(webContentsId, path)
})

ipcMain.handle('fs:openFolderInSameWindow', async (event, webContentsId, path?) => {
  if(!isE2E) return
  console.log('openFolderInSameWindow', webContentsId, path)
  fsPlugin.openFolderInSameWindow(webContentsId, path)
})


ipcMain.on('terminal:new', async (event) => {
  xtermPlugin.new(event)
})

ipcMain.on('template:open', async (event) => {
  templatesPlugin.openTemplate(event)
})

ipcMain.on('git:startclone', async (event) => {
  isoGitPlugin.startClone(event)
})

ipcMain.handle('getWebContentsID', (event, message) => {
  return event.sender.id
})

app.on('before-quit', async (event) => {
  await appManager.call('fs', 'removeCloseListener')
  await appManager.call('fs', 'closeWatch')
  await appManager.call('xterm', 'closeTerminals')
})
