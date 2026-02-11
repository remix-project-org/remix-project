import { branch, desktopConnection, GitHubUser } from '@remix-api';
import { GenericModal } from '../interface';

type ActionMap<M extends { [index: string]: any }> = {
    [Key in keyof M]: M[Key] extends undefined
      ? {
          type: Key;
        }
      : {
          type: Key;
          payload: M[Key];
        }
}

export const enum appActionTypes {
  setGitHubUser = 'SET_GITHUB_USER',
  setCurrentBranch = 'SET_CURRENT_BRANCH',
  setNeedsGitInit = 'SET_NEEDS_GIT_INIT',
  setCanUseGit = 'SET_CAN_USE_GIT',
  setShowPopupPanel = 'SET_SHOW_POPUP_PANEL',
  setShowOverlayPanel = 'SET_SHOW_OVERLAY_PANEL',
  setConnectedToDesktop = 'SET_CONNECTED_TO_DESKTOP',
  showGenericModal = 'SHOW_GENERIC_MODAL',
  closeGenericModal = 'CLOSE_GENERIC_MODAL',
  showAiChatHistorySidebar = 'SHOW_AI_CHATHISTORY_SIDEBAR',
  toggleIsAiChatMaximized = 'TOGGLE_IS_AI_CHAT_MAXIMIZED',
  closeAiChatHistorySidebar = 'CLOSE_AI_CHATHISTORY_SIDEBAR'
}

type AppPayload = {
  [appActionTypes.setGitHubUser]: GitHubUser,
  [appActionTypes.setCurrentBranch]: branch,
  [appActionTypes.setNeedsGitInit]: boolean,
  [appActionTypes.setCanUseGit]: boolean,
  [appActionTypes.setShowPopupPanel]: boolean,
  [appActionTypes.setShowOverlayPanel]: boolean,
  [appActionTypes.setConnectedToDesktop]: desktopConnection,
  [appActionTypes.showGenericModal]: boolean,
  [appActionTypes.closeGenericModal]: boolean,
  [appActionTypes.showAiChatHistorySidebar]: boolean,
  [appActionTypes.toggleIsAiChatMaximized]: boolean,
  [appActionTypes.closeAiChatHistorySidebar]: boolean
}

export type AppAction = ActionMap<AppPayload>[keyof ActionMap<
  AppPayload
>]
