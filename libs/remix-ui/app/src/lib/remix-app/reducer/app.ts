import { AppAction, appActionTypes } from "../actions/app";
import { AppState } from "../interface";

export const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
  case appActionTypes.setGitHubUser: {
    return {
      ...state,
      gitHubUser: action.payload
    }
  }
  case appActionTypes.setCurrentBranch: {
    return {
      ...state,
      currentBranch: action.payload
    }
  }
  case appActionTypes.setNeedsGitInit: {
    return {
      ...state,
      needsGitInit: action.payload
    }
  }
  case appActionTypes.setCanUseGit: {
    return {
      ...state,
      canUseGit: action.payload
    }
  }

  case appActionTypes.setShowPopupPanel: {
    return {
      ...state,
      showPopupPanel: action.payload
    }
  }

  case appActionTypes.setConnectedToDesktop: {
    console.log('setConnectedToDesktop', action.payload)
    return {
      ...state,
      connectedToDesktop: action.payload
    }
  }

  case appActionTypes.showGenericModal: {
    return {
      ...state,
      genericModalState: { ...state.genericModalState, showModal: action.payload }
    }
  }
  }
}
