import { ReadBlobResult, ReadCommitResult } from "isomorphic-git";
import React from "react";
import { fileStatus, fileStatusMerge, setRemoteBranchCommits, resetRemoteBranchCommits, setBranches, setCanCommit, setCommitChanges, setCommits, setCurrentBranch, setGitHubUser, setLoading, setRemoteBranches, setRemotes, setRepos, setUpstream, setLocalBranchCommits, setBranchDifferences, setRemoteAsDefault, setScopes, setLog, clearLog, setUserEmails, setCurrenHead, setStoragePayload, resetBranchDifferences, setTimestamp, setGitLogCount } from "../state/gitpayload";
import { gitActionDispatch, statusMatrixType, gitState, gitLog, fileStatusResult, storage } from '../types';
import { removeSlash } from "../utils";
import { disableCallBacks, enableCallBacks } from "./listeners";
import { ModalTypes, appActionTypes, AppAction } from "@remix-ui/app";
import { setFileDecorators } from "./pluginActions";
import { Plugin } from "@remixproject/engine";
import { addInputType, branch, branchDifference, checkoutInputType, cloneInputType, commitChange, CustomRemixApi, fetchInputType, GitEvent, GitHubUser, pullInputType, pushInputType, remote, rmInputType, trackMatomoEvent, userEmails } from "@remix-api";

export const fileStatuses = [
  ["new,untracked", 0, 2, 0], // new, untracked
  ["added,staged", 0, 2, 2], //
  ["added,staged,with unstaged changes", 0, 2, 3], // added, staged, with unstaged changes
  ["unmodified", 1, 1, 1], // unmodified
  ["modified,unstaged", 1, 2, 1], // modified, unstaged
  ["modified,staged", 1, 2, 2], // modified, staged
  ["modified,staged,with unstaged changes", 1, 2, 3], // modified, staged, with unstaged changes
  ["deleted,unstaged", 1, 0, 1], // deleted, unstaged
  ["deleted,staged", 1, 0, 0],
  ["unmodified", 1, 1, 3],
  ["added,deleted", 0, 0, 3],
  ["unstaged,modified", 1, 2, 0]
];

const statusmatrix: statusMatrixType[] = fileStatuses.map((x: any) => {
  return {
    matrix: x.shift().split(","),
    status: x,
  };
});

let plugin: Plugin<any, CustomRemixApi>, dispatch: React.Dispatch<gitActionDispatch>, appDispatcher: React.Dispatch<AppAction>

export const setPlugin = (p: Plugin, dispatcher: React.Dispatch<gitActionDispatch>, appDispatch: React.Dispatch<AppAction>) => {
  plugin = p
  dispatch = dispatcher
  appDispatcher = appDispatch
}

// Helper function for tracking git events from library functions
const trackGitEvent = (action: GitEvent['action'], name?: string, isClick: boolean = false) => {
  if (!plugin) return
  trackMatomoEvent(plugin, {
    category: 'git',
    action,
    name,
    isClick
  })
}

export const init = async () => {
  trackGitEvent("INIT", undefined, true)
  await plugin.call('dgitApi', 'init');
  dispatch(setTimestamp(Date.now()))
  await getBranches();
}

export const getBranches = async () => {

  const branches = await plugin.call('dgitApi', 'branches')

  dispatch(setBranches(branches));
  await showCurrentBranch();
}
export const getRemotes = async () => {

  const remotes: remote[] = await plugin.call('dgitApi', 'remotes');

  dispatch(setRemotes(remotes));
}

export const setUpstreamRemote = async (remote: remote) => {
  dispatch(setUpstream(remote));
}

export const getFileStatusMatrix = async (filepaths: string[]) => {

  dispatch(setLoading(true))
  const fileStatusResult = await statusMatrix(filepaths);
  fileStatusResult.map((m) => {
    statusmatrix.map((sm) => {
      if (JSON.stringify(sm.status) === JSON.stringify(m.status)) {
        m.statusNames = sm.matrix;
      }
    });
  });
  if (!filepaths) {
    dispatch(fileStatus(fileStatusResult))
  } else {
    dispatch(fileStatusMerge(fileStatusResult))
    setFileDecorators(fileStatusResult)
  }

  dispatch(setLoading(false))
}

export const getCommits = async (depth: number) => {

  try {
    const commits: ReadCommitResult[] = await plugin.call(
      'dgitApi',
      "log",
      { ref: "HEAD", depth: depth }
    );

    return commits;
  } catch (e) {
    return [];
  }
}

export const gitlog = async (depth: number) => {
  dispatch(setLoading(true))
  let commits = []
  try {
    commits = await getCommits(depth)
  } catch (e) {
  }
  dispatch(setCommits(commits))
  await showCurrentBranch()
  dispatch(setLoading(false))

}

export const setStateGitLogCount = async (count: number) => {
  dispatch(setGitLogCount(count))
}

export const showCurrentBranch = async () => {
  try {
    const branch = await currentBranch();
    dispatch(setCanCommit((branch && branch.name !== "")));
    dispatch(setCurrentBranch(branch));
  } catch (e) {
    console.log(e)
    dispatch(setCanCommit(false));
    dispatch(setCurrentBranch({ name: "", remote: { name: "", url: "" } }));
  }

  try {
    const currentHead = await getCommitFromRef('HEAD');
    dispatch(setCurrenHead(currentHead));
  } catch (e) {
    dispatch(setCurrenHead(''));
  }

}

export const currentBranch = async () => {

  const branch: branch =
    (await plugin.call('dgitApi', "currentbranch")) || {
      name: "",
      remote: {
        name: "",
        url: "",
      },
    };
  return branch;

}

export const createBranch = async (name: string = "") => {
  trackGitEvent("BRANCH", "CREATE", true)
  dispatch(setLoading(true))
  if (name) {
    await plugin.call('dgitApi', 'branch', { ref: name, force: true, checkout: true });
  }
  dispatch(setLoading(false))
}

export const getCommitFromRef = async (ref: string) => {
  const commitOid = await plugin.call('dgitApi', "resolveref", {
    ref: ref,
  });
  return commitOid;
}

const settingsWarning = async () => {
  const username = await plugin.call('config', 'getAppParameter', 'settings/github-user-name')
  const email = await plugin.call('config', 'getAppParameter', 'settings/github-email')
  if (!username || !email) {
    plugin.call('notification', 'toast', 'Please set your github username and email in the settings')
    return false;
  } else {
    return {
      username,
      email
    };
  }
}

export const commit = async (message: string = "") => {

  trackGitEvent("COMMIT", undefined, true)
  try {
    const credentials = await settingsWarning()
    if (!credentials) {
      dispatch(setLoading(false))
      return
    }

    const sha = await plugin.call('dgitApi', 'commit', {
      author: {
        name: credentials.username,
        email: credentials.email,
      },
      message: message,
    });

    sendToGitLog({
      type: 'success',
      message: `Committed: ${sha}`
    })

  } catch (err) {
    plugin.call('notification', 'toast', `${err}`)
  }

}

export const addall = async (files: fileStatusResult[]) => {
  trackGitEvent("ADD_ALL", undefined, true)
  try {
    const filesToAdd = files
      .filter(f => !f.statusNames.includes('deleted'))
      .map(f => removeSlash(f.filename))
    const filesToRemove = files
      .filter(f => f.statusNames.includes('deleted'))
      .map(f => removeSlash(f.filename))
    try {
      add({ filepath: filesToAdd })
    } catch (e) { }
    sendToGitLog({
      type: 'success',
      message: `Added all files to git`
    })

    try {
      filesToRemove.map(f => rm({ filepath: f }))
    } catch (e) { }

  } catch (e) {
    plugin.call('notification', 'toast', `${e}`)
  }
}

export const add = async (filepath: addInputType) => {
  trackGitEvent("ADD", undefined, true)
  try {
    if (typeof filepath.filepath === "string") {
      filepath.filepath = removeSlash(filepath.filepath)
    }
    await plugin.call('dgitApi', 'add', filepath);
    sendToGitLog({
      type: 'success',
      message: `Added to git`
    })
  } catch (e) {
    plugin.call('notification', 'toast', `${e}`)
  }

}

const getLastCommit = async () => {
  try {
    let currentcommitoid = "";
    currentcommitoid = await getCommitFromRef("HEAD");
    return currentcommitoid;
  } catch (e) {
    return false;
  }
}

export const rm = async (args: rmInputType) => {
  trackGitEvent("RM", undefined, true)
  await plugin.call('dgitApi', 'rm', {
    filepath: removeSlash(args.filepath),
  });
  sendToGitLog({
    type: 'success',
    message: `Removed from git`
  })
}

export const checkoutfile = async (filename: string) => {
  const oid = await getLastCommit();
  if (oid)
    try {
      const commitOid = await plugin.call('dgitApi', 'resolveref', {
        ref: oid,
      });
      const { blob } = await plugin.call('dgitApi', 'readblob', {
        oid: commitOid,
        filepath: removeSlash(filename),
      });
      const original = Buffer.from(blob).toString("utf8");
      //(original, filename);
      await disableCallBacks();
      await plugin.call(
        "fileManager",
        "setFile",
        removeSlash(filename),
        original
      );
      await enableCallBacks();
    } catch (e) {
      plugin.call('notification', 'toast', `No such file`)
    }
}

export const checkout = async (cmd: checkoutInputType) => {
  trackGitEvent("CHECKOUT", undefined, true)
  await disableCallBacks();
  await plugin.call('fileManager', 'closeAllFiles')
  try {
    await plugin.call('dgitApi', 'checkout', cmd)
  } catch (e) {
    console.log(e)
    plugin.call('notification', 'toast', `${e}`)
  }
  await enableCallBacks();
}

export const clone = async (input: cloneInputType) => {

  trackGitEvent("CLONE", undefined, true)
  dispatch(setLoading(true))
  const urlParts = input.url.split("/");
  const lastPart = urlParts[urlParts.length - 1];
  const repoName = lastPart.split(".")[0];
  const timestamp = new Date().getTime();
  const repoNameWithTimestamp = `${repoName}-${timestamp}`;

  try {
    await disableCallBacks()
    const token = await plugin.call('config' as any, 'getAppParameter' as any, 'settings/gist-access-token')

    await plugin.call('dgitApi', 'clone', { ...input, workspaceName: repoNameWithTimestamp });
    await enableCallBacks()

    sendToGitLog({
      type: 'success',
      message: `Cloned ${input.url} to ${repoNameWithTimestamp}`
    })

    plugin.call('notification', 'toast', `Cloned ${input.url} to ${repoNameWithTimestamp}`)

  } catch (e: any) {
    await parseError(e)
  }
  dispatch(setLoading(false))
}

export const fetch = async (input: fetchInputType) => {
  trackGitEvent("FETCH", undefined, true)
  dispatch(setLoading(true))
  await disableCallBacks()
  try {
    await plugin.call('dgitApi', 'fetch', input);
    if (!input.quiet) {
      dispatch(setTimestamp(Date.now()))
      await getBranches()
    }
  } catch (e: any) {
    console.log(e)
    if (!input.quiet) { await parseError(e) }
  }
  dispatch(setLoading(false))
  await enableCallBacks()
}

export const pull = async (input: pullInputType) => {
  trackGitEvent("PULL", undefined, true)
  dispatch(setLoading(true))
  await disableCallBacks()
  try {
    await plugin.call('dgitApi', 'pull', input)
    dispatch(setTimestamp(Date.now()))
  } catch (e: any) {
    console.log(e)
    await parseError(e)
  }
  dispatch(setLoading(false))
  await enableCallBacks()
}

export const push = async (input: pushInputType) => {
  trackGitEvent("PUSH", undefined, true)
  dispatch(setLoading(true))
  await disableCallBacks()
  try {
    await plugin.call('dgitApi', 'push', input)
  } catch (e: any) {
    console.log(e)
    await parseError(e)
  }
  dispatch(setLoading(false))
  await enableCallBacks()
}

const tokenWarning = async () => {
  const token = await plugin.call('config' as any, 'getAppParameter' as any, 'settings/gist-access-token')
  if (!token) {
    return false;
  } else {
    return token;
  }
}

const parseError = async (e: any) => {
  console.trace(e)
  if (!e.message) return

  // if message conttains 401 Unauthorized, show token warning
  if (e.message.includes('401')) {
    trackGitEvent('ERROR', '401')
    const result = await plugin.call('notification', 'modal' as any, {
      title: 'The GitHub token may be missing or invalid',
      message: 'Please check the GitHub token and try again. Error: 401 Unauthorized',
      okLabel: 'Go to settings',
      cancelLabel: 'Close',
      type: ModalTypes.confirm
    })
  }
  // if message contains 404 Not Found, show repo not found
  else if (e.message.includes('404')) {
    trackGitEvent('ERROR', '404')
    await plugin.call('notification', 'modal' as any, {
      title: 'Repository not found',
      message: 'Please check the URL and try again.',
      okLabel: 'Go to settings',
      cancelLabel: 'Close',
      type: ModalTypes.confirm
    })
  }
  // if message contains 403 Forbidden
  else if (e.message.includes('403')) {
    trackGitEvent('ERROR', '403')
    await plugin.call('notification', 'modal' as any, {
      title: 'The GitHub token may be missing or invalid',
      message: 'Please check the GitHub token and try again. Error: 403 Forbidden',
      okLabel: 'Go to settings',
      cancelLabel: 'Close',
      type: ModalTypes.confirm
    })
  } else if (e.toString().includes('NotFoundError') && !e.toString().includes('fetch')) {
    trackGitEvent('ERROR', 'BRANCH_NOT_FOUND')
    await plugin.call('notification', 'modal', {
      title: 'Remote branch not found',
      message: 'The branch you are trying to fetch does not exist on the remote. If you have forked this branch from another branch, you may need to fetch the original branch first or publish this branch on the remote.',
      okLabel: 'OK',
      type: ModalTypes.alert
    })
  } else {
    trackGitEvent('ERROR', 'UNKNOWN')
    await plugin.call('notification', 'alert' as any, {
      title: 'Error',
      message: e.message
    })
  }
}

export const repositories = async () => {
  try {
    const token = await tokenWarning();
    if (token) {
      let repos = await plugin.call('dgitApi', 'repositories', { token, per_page: 100 })
      dispatch(setRepos(repos))
      let page = 2
      let hasMoreData = true
      const per_page = 100
      while (hasMoreData) {
        const pagedResponse = await plugin.call('dgitApi', 'repositories', { token, page: page, per_page: per_page })
        if (pagedResponse.length < per_page) {
          hasMoreData = false
        }
        repos = [...repos, ...pagedResponse]
        dispatch(setRepos(repos))
        page++
      }

    } else {
      trackGitEvent('ERROR', 'TOKEN_ERROR')
      plugin.call('notification', 'alert', {
        id: 'github-token-error',
        title: 'Error getting repositories',
        message: `Please check your GitHub token in the GitHub settings... cannot connect to GitHub`
      })
      dispatch(setRepos([]))
    }
  } catch (e) {
    console.log(e)
    trackGitEvent('ERROR', 'TOKEN_ERROR')
    plugin.call('notification', 'alert', {
      id: 'github-token-error',
      title: 'Error getting repositories',
      message: `${e.message}: Please check your GitHub token in the GitHub settings.`
    })
    dispatch(setRepos([]))
  }
}

export const remoteBranches = async (owner: string, repo: string) => {
  try {
    const token = await tokenWarning();
    if (token) {
      let branches = await plugin.call('dgitApi' as any, 'remotebranches', { token, owner, repo, per_page: 100 });
      dispatch(setRemoteBranches(branches))
      let page = 2
      let hasMoreData = true
      const per_page = 100
      while (hasMoreData) {
        const pagedResponse = await plugin.call('dgitApi' as any, 'remotebranches', { token, owner, repo, page: page, per_page: per_page })
        if (pagedResponse.length < per_page) {
          hasMoreData = false
        }
        branches = [...branches, ...pagedResponse]
        dispatch(setRemoteBranches(branches))
        page++
      }
    } else {
      trackGitEvent('ERROR', 'TOKEN_ERROR')
      plugin.call('notification', 'alert', {
        title: 'Error getting branches',
        id: 'github-token-error',
        message: `Please check your GitHub token in the GitHub settings. It needs to have access to the branches.`
      })
      dispatch(setRemoteBranches([]))
    }
  } catch (e) {
    console.log(e)
    trackGitEvent('ERROR', 'TOKEN_ERROR')
    plugin.call('notification', 'alert', {
      title: 'Error',
      id: 'github-error',
      message: e.message
    })
    dispatch(setRemoteBranches([]))
  }
}

export const remoteCommits = async (url: string, branch: string, length: number) => {

  const urlParts = url.split("/");

  // check if it's github
  if (!urlParts[urlParts.length - 3].includes('github')) {
    return
  }

  const owner = urlParts[urlParts.length - 2];
  const repo = urlParts[urlParts.length - 1].split(".")[0];

  try {
    const token = await tokenWarning();
    if (token) {

      const commits = await plugin.call('dgitApi' as any, 'remotecommits', { token, owner, repo, branch, length });

    } else {
      sendToGitLog({
        type: 'error',
        message: `Please check your GitHub token in the GitHub settings.`
      })
    }
  } catch (e) {
    // do nothing
  }
}

export const saveGitHubCredentials = async (credentials: { username: string, email: string, token: string }) => {

  try {
    const storedEmail = await plugin.call('config', 'getAppParameter', 'settings/github-email')
    const storedUsername = await plugin.call('config', 'getAppParameter', 'settings/github-user-name')
    const storedToken = await plugin.call('config', 'getAppParameter', 'settings/gist-access-token')

    if (storedUsername !== credentials.username) await plugin.call('config', 'setAppParameter', 'settings/github-user-name', credentials.username)
    if (storedEmail !== credentials.email) await plugin.call('config', 'setAppParameter', 'settings/github-email', credentials.email)
    if (storedToken !== credentials.token) await plugin.call('config', 'setAppParameter', 'settings/gist-access-token', credentials.token)

    const userFetched = await loadGitHubUserFromToken()
    if (!userFetched) {
      if (credentials.username && credentials.email) {
        await plugin.call('notification', 'alert', {
          title: 'Error',
          id: 'github-credentials-error',
          message: `Could not retrieve the user from GitHub. You can continue to use the app, but you will not be able to push or pull.`
        })
      }
      dispatch(setGitHubUser({
        login: credentials.username,
        isConnected: false
      }))
      appDispatcher({ type: appActionTypes.setGitHubUser, payload: { login: credentials.username, isConnected: false } })
      dispatch(setUserEmails([{
        email: credentials.email,
        primary: true,
        verified: null,
        visibility: null
      }]))
      dispatch(setScopes([]))
    }

  } catch (e) {
    console.log(e)
  }
}

export const getGitHubCredentialsFromLocalStorage = async () => {
  if (!plugin) return
  try {
    const username = await plugin.call('config', 'getAppParameter', 'settings/github-user-name')
    const email = await plugin.call('config', 'getAppParameter', 'settings/github-email')
    const token = await plugin.call('config', 'getAppParameter', 'settings/gist-access-token')
    return {
      username,
      email,
      token
    }
  } catch (e) {
    console.log(e)
  }
}

export const showAlert = async ({ title, message }: { title: string, message: string }) => {
  await plugin.call('notification', 'alert', {
    id: 'github-alert',
    title: title,
    message: message
  })
}

export const loadGitHubUserFromToken = async () => {
  if (!plugin) return
  try {
    const token = await tokenWarning();
    if (token) {
      const data: {
        user: GitHubUser,
        scopes: string[]
        emails: userEmails
      } = await plugin.call('dgitApi' as any, 'getGitHubUser', { token });

      if (data && data.emails && data.user && data.user.login) {

        const primaryEmail = data.emails.find(email => email.primary)

        const storedEmail = await plugin.call('config', 'getAppParameter', 'settings/github-email')
        if (primaryEmail && storedEmail !== primaryEmail.email) await plugin.call('config', 'setAppParameter', 'settings/github-email', primaryEmail.email)
        const storedUsername = await plugin.call('config', 'getAppParameter', 'settings/github-user-name')
        if (data.user && data.user.login && (storedUsername !== data.user.login)) await plugin.call('config', 'setAppParameter', 'settings/github-user-name', data.user.login)

        dispatch(setGitHubUser(data.user))
        appDispatcher({ type: appActionTypes.setGitHubUser, payload: data.user })
        dispatch(setScopes(data.scopes))
        dispatch(setUserEmails(data.emails))
        sendToGitLog({
          type: 'success',
          message: `Github user loaded...`
        })
        trackGitEvent("LOAD_GITHUB_USER_SUCCESS")
        return true
      } else {
        trackGitEvent('ERROR', 'GITHUB_USER_LOAD_ERROR')
        sendToGitLog({
          type: 'error',
          message: `Please check your GitHub token in the GitHub settings.`
        })
        dispatch(setGitHubUser(null))
        appDispatcher({ type: appActionTypes.setGitHubUser, payload: null })
        return false
      }
    } else {
      sendToGitLog({
        type: 'error',
        message: `Please check your GitHub token in the GitHub settings.`
      })
      dispatch(setGitHubUser(null))
      appDispatcher({ type: appActionTypes.setGitHubUser, payload: null })
      return false
    }
  } catch (e) {
    console.log(e)
    return false
  }
}

export const statusMatrix = async (filepaths: string[]) => {

  const matrix = await plugin.call('dgitApi', 'status', { ref: "HEAD", filepaths: filepaths || ['.']});

  const result = (matrix || []).map((x) => {
    return {
      filename: `/${x.shift()}`,
      status: x,
      statusNames: []
    };
  });

  return result;
}

export const resolveRef = async (ref: string) => {
  const oid = await plugin.call('dgitApi', "resolveref", {
    ref,
  });
  return oid;
}

export const diff = async (commitChange: commitChange) => {
  trackGitEvent("DIFF", undefined, true)
  if (!commitChange.hashModified) {
    const newcontent = await plugin.call(
      "fileManager",
      "readFile",//
      removeSlash(commitChange.path)
    );
    commitChange.modified = newcontent;
    commitChange.readonly = false;

  } else {

    try {
      const modifiedContentReadBlobResult: ReadBlobResult = await plugin.call('dgitApi', "readblob", {
        oid: commitChange.hashModified,
        filepath: removeSlash(commitChange.path),
      });

      const modifiedContent = Buffer.from(modifiedContentReadBlobResult.blob).toString("utf8");

      commitChange.modified = modifiedContent;
      commitChange.readonly = true;
    } catch (e) {
      commitChange.modified = "";
    }
  }

  try {
    const originalContentReadBlobResult: ReadBlobResult = await plugin.call('dgitApi', "readblob", {
      oid: commitChange.hashOriginal,
      filepath: removeSlash(commitChange.path),
    });

    const originalContent = Buffer.from(originalContentReadBlobResult.blob).toString("utf8");

    commitChange.original = originalContent;
  } catch (e) {
    commitChange.original = "";
  }

}

export const getCommitChanges = async (oid1: string, oid2: string, branch?: branch, remote?: remote) => {

  try {
    let log
    try {
      // check if oid2 exists
      log = await plugin.call('dgitApi', 'log', {
        ref: branch ? branch.name : 'HEAD',
      })

    } catch (e) {
      console.log(e, 'log error')
    }
    if (log) {

      const foundCommit = log.find((commit: ReadCommitResult) => commit.oid === oid2)
      if (!foundCommit && remote) {

        //await fetch(remote ? remote.name : null, branch ? branch.name : null, null, 5, true, true)
        await fetch({
          remote: remote,
          singleBranch: true,
          quiet: true,
          relative: true,
          depth: 5,
          ref: branch,
          remoteRef: null
        })
      }
    }
    const result: commitChange[] = await plugin.call('dgitApi', 'getCommitChanges', oid1, oid2)
    dispatch(setCommitChanges(result))
    return result
  } catch (e) {
    console.log(e)
    return false
  }
}

async function getRepoDetails(url: string) {
  // Extract the owner and repo name from the URL
  const pathParts = new URL(url).pathname.split('/').filter(part => part);
  if (pathParts.length < 2) {
    throw new Error("URL must be in the format 'https://github.com/[owner]/[repository]'");
  }
  const owner = pathParts[0];
  const repo = pathParts[1];
  return { owner, repo };
}

export const fetchBranch = async (branch: branch, page: number) => {

  if (!branch.remote || !branch.remote.url) return
  const token = await tokenWarning();
  if (page == 1) {
    dispatch(resetRemoteBranchCommits({ branch }))
  }
  try {
    const { owner, repo } = await getRepoDetails(branch.remote.url);
    const rc = await plugin.call('dgitApi', 'remotecommits', { token, owner: owner, repo: repo, branch: branch.name, length, page });
    dispatch(setRemoteBranchCommits({ branch, commits: rc }))
  } catch (e) {
    sendToGitLog({
      type: 'error',
      message: `Error fetching remote commits: ${e.message}`
    })
  }
  return
}

export const getBranchDifferences = async (branch: branch, remote: remote, state: gitState) => {

  if (!remote && state) {
    if (state.defaultRemote) {
      remote = state.defaultRemote
    } else {
      remote = state.remotes.find((remote: remote) => remote.name === 'origin')
    }
    if (!remote && state.remotes[0]) {
      remote = state.remotes[0]
    }
  }

  try {

    if (!remote) {
      dispatch(resetBranchDifferences())
      return
    }

    const branchDifference: branchDifference = await plugin.call('dgitApi', 'compareBranches', {
      branch,
      remote
    })

    dispatch(setBranchDifferences(
      {
        branch,
        remote,
        branchDifference: branchDifference
      }))
  } catch (e) {
    // do nothing
    if (dispatch)
      dispatch(resetBranchDifferences())
  }
}

export const getBranchCommits = async (branch: branch, page: number) => {
  dispatch(setLoading(true))
  await disableCallBacks()
  try {
    if (!branch.remote) {
      const commits: ReadCommitResult[] = await plugin.call('dgitApi', 'log', {
        ref: branch.name,
      })
      dispatch(setLocalBranchCommits({ branch, commits }))
    } else {
      await fetchBranch(branch, page)
    }
  } catch (e) {
    console.trace(e)
    await fetchBranch(branch, page)
  }
  dispatch(setLoading(false))
  await enableCallBacks()
}

export const setDefaultRemote = async (remote: remote) => {
  trackGitEvent("SET_DEFAULT_REMOTE", undefined, true)
  dispatch(setRemoteAsDefault(remote))
}

export const addRemote = async (remote: remote) => {
  trackGitEvent("ADDREMOTE", undefined, true)
  try {
    await plugin.call('dgitApi', 'addremote', remote)
    await getRemotes()
    await fetch({
      remote: remote,
      singleBranch: true,
      quiet: true,
    })
  } catch (e) {
    console.log(e)
  }
}

export const removeRemote = async (remote: remote) => {
  trackGitEvent("RMREMOTE", undefined, true)
  try {
    await plugin.call('dgitApi', 'delremote', remote)
    await getRemotes()
  } catch (e) {
    console.log(e)
  }
}

export const sendToGitLog = async (message: gitLog) => {
  dispatch(setLog(message))
}

export const clearGitLog = async () => {
  dispatch(clearLog())
}

export const setStorage = async (storage: storage) => {
  dispatch(setStoragePayload(storage))
}

// Re-export the login function for external use
export { startGitHubLogin } from './gitLoginActions'
