import { IRemixApi } from "@remixproject/plugin-api"
import { StatusEvents } from "@remixproject/plugin-utils"
import { IConfigApi } from "./plugins/config-api"
import { IFileDecoratorApi } from "./plugins/filedecorator-api"
import { IExtendedFileSystem } from "./plugins/fileSystem-api"
import { IFs } from "./plugins/fs-api"
import { IGitApi } from "./plugins/git-api"
import { INotificationApi } from "./plugins/notification-api"
import { ISettings } from "./plugins/settings-api"
import { IExtendedTerminalApi } from "./plugins/terminal-api"
import { IFilePanelApi } from "./plugins/filePanel-api"
import { ISidePanelApi } from "./plugins/sidePanel-api"
import { IRightSidePanelApi } from "./plugins/rightSidePanel-api"
import { ILayoutApi } from "./plugins/layout-api"
import { IMatomoApi } from "./plugins/matomo-api"
import { IRemixAI } from "./plugins/remixai-api"
import { IMenuIconsApi } from "./plugins/menuicons-api"
import { IDgitPlugin } from "./plugins/dgitplugin-api"
import { IPopupPanelAPI } from "./plugins/popuppanel-api"
import { IDesktopClient } from "./plugins/desktop-client"
import { IGitHubAuthHandlerApi } from "./plugins/githubAuthHandler-api"
import { ITopbarApi } from "./plugins/topbar-api"

export interface ICustomRemixApi extends IRemixApi {
  popupPanel: IPopupPanelAPI
  dgitApi: IGitApi
  dgit: IDgitPlugin
  config: IConfigApi
  notification: INotificationApi
  settings: ISettings
  fileDecorator: IFileDecoratorApi
  fileManager: IExtendedFileSystem
  isogit: IGitApi,
  terminal: IExtendedTerminalApi
  topbar: ITopbarApi
  fs: IFs
  filePanel: IFilePanelApi
  sidePanel: ISidePanelApi
  rightSidePanel: IRightSidePanelApi
  layout: ILayoutApi
  matomo: IMatomoApi
  menuicons: IMenuIconsApi
  remixAI: IRemixAI,
  desktopClient: IDesktopClient
  githubAuthHandler: IGitHubAuthHandlerApi
}

export declare type CustomRemixApi = Readonly<ICustomRemixApi>
