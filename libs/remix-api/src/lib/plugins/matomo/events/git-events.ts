/**
 * Git Events - Git integration and version control tracking events
 * 
 * This file contains all Git-related Matomo events.
 */

import { MatomoEventBase } from '../core/base-types';

export interface GitEvent extends MatomoEventBase {
  category: 'git';
  action: 
    | 'INIT'
    | 'COMMIT' 
    | 'PUSH'
    | 'PULL'
    | 'ADDREMOTE'
    | 'RMREMOTE'
    | 'CLONE'
    | 'FETCH'
    | 'ADD'
    | 'ADD_ALL'
    | 'RM'
    | 'CHECKOUT'
    | 'CHECKOUT_LOCAL_BRANCH'
    | 'CHECKOUT_REMOTE_BRANCH'
    | 'DIFF'
    | 'BRANCH'
    | 'CREATEBRANCH'
    | 'GET_GITHUB_DEVICECODE'
    | 'GET_GITHUB_DEVICECODE_SUCCESS'
    | 'GET_GITHUB_DEVICECODE_FAIL'
    | 'DEVICE_CODE_AUTH'
    | 'DEVICE_CODE_AUTH_SUCCESS'
    | 'DEVICE_CODE_AUTH_FAIL'
    | 'CONNECT_TO_GITHUB'
    | 'CONNECT_TO_GITHUB_BUTTON'
    | 'DISCONNECT_FROM_GITHUB'
    | 'SAVE_MANUAL_GITHUB_CREDENTIALS'
    | 'LOAD_REPOSITORIES_FROM_GITHUB'
    | 'COPY_GITHUB_DEVICE_CODE'
    | 'CONNECT_TO_GITHUB_SUCCESS'
    | 'CONNECT_TO_GITHUB_FAIL'
    | 'OPEN_LOGIN_MODAL'
    | 'LOGIN_MODAL_FAIL'
    | 'OPEN_PANEL'
    | 'ADD_MANUAL_REMOTE'
    | 'SET_DEFAULT_REMOTE'
    | 'SET_LOCAL_BRANCH_IN_COMMANDS'
    | 'SET_REMOTE_IN_COMMANDS'
    | 'REFRESH'
    | 'ERROR'
    | 'LOAD_GITHUB_USER_SUCCESS'
    | 'GITHUB_DEVICE_CODE_FLOW'
    | 'PANEL_NAVIGATION'
    | 'SOURCE_CONTROL';
}

